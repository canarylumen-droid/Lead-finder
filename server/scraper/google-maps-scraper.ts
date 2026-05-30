import { chromium, type Browser } from "playwright-chromium";
import pLimit from "p-limit";
import { db } from "../db.js";
import { leads, scrapeSessions } from "../../shared/schema.js";
import { eq, sql } from "drizzle-orm";
import { scraperEvents } from "../events.js";
import { findEmailForBusiness, hasMXRecord } from "./email-finder.js";

export interface ScrapeConfig {
  sessionId: number;
  userId: number;
  niches: string[];
  cities: string[];
  country: string;
  maxReviews: number;
  targetVolume: number;
}

// Skip first N results = "page 1 & 2" of Google Maps (each ~20 results)
const SKIP_TOP_RESULTS = 40;

// Concurrency pulled from env — set per your RAM:
//   8GB  → SCRAPER_CONCURRENCY=50  EMAIL_CONCURRENCY=100
//   16GB → SCRAPER_CONCURRENCY=120 EMAIL_CONCURRENCY=200
//   32GB → SCRAPER_CONCURRENCY=250 EMAIL_CONCURRENCY=400
const MAPS_CONCURRENCY  = parseInt(process.env.SCRAPER_CONCURRENCY  ?? "20",  10);
const EMAIL_CONCURRENCY = parseInt(process.env.EMAIL_CONCURRENCY    ?? "50",  10);
const EMIT_EVERY        = 10;   // broadcast WS update every N saved leads

interface SessionState {
  leadsCount: number;
  emailCount: number;
  startTime:  number;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wrap any async op with a hard timeout; resolves to fallback on timeout */
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, sleep(ms).then(() => fallback)]);
}

/** Emit a WS broadcast for a session */
function emitUpdate(sessionId: number, state: SessionState, status: "running" | "completed" | "failed") {
  const elapsed = (Date.now() - state.startTime) / 60_000; // minutes
  const lpm     = elapsed > 0 ? Math.round(state.leadsCount / elapsed) : 0;
  scraperEvents.emit("session_update", {
    sessionId,
    leadsCount: state.leadsCount,
    emailCount: state.emailCount,
    status,
    leadsPerMinute: lpm,
  });
}

/** Persist lead → DB, update in-memory counters, maybe emit WS */
async function saveLead(
  data: Parameters<typeof db.insert>[0] extends { values: (v: infer V) => unknown } ? V : never,
  sessionId: number,
  state: SessionState,
  emailLimit: ReturnType<typeof pLimit>,
  website: string | null,
) {
  let insertedId: number | null = null;

  try {
    const rows = await (db.insert(leads) as any)
      .values(data)
      .onConflictDoNothing()
      .returning({ id: leads.id });
    insertedId = rows[0]?.id ?? null;
  } catch {
    return; // duplicate or constraint violation — skip
  }

  if (!insertedId) return;

  state.leadsCount++;

  // Update DB lead count every EMIT_EVERY leads (bulk update is cheaper)
  if (state.leadsCount % EMIT_EVERY === 0) {
    await db
      .update(scrapeSessions)
      .set({ leadsCount: state.leadsCount, emailCount: state.emailCount })
      .where(eq(scrapeSessions.id, sessionId))
      .catch(() => {});
    emitUpdate(sessionId, state, "running");
  }

  // Fire-and-forget email finding — runs in separate concurrency pool
  if (website) {
    const lid = insertedId;
    emailLimit(async () => {
      const email = await withTimeout(findEmailForBusiness(website), 10_000, null);
      if (!email) return;

      // Optional MX check (soft verify — no false positives from dead domains)
      const mx = await withTimeout(hasMXRecord(email), 3_000, false);

      await db
        .update(leads)
        .set({ email, emailVerified: mx ? 1 : 0 })
        .where(eq(leads.id, lid))
        .catch(() => {});

      state.emailCount++;

      if (state.emailCount % EMIT_EVERY === 0) {
        await db
          .update(scrapeSessions)
          .set({ emailCount: state.emailCount })
          .where(eq(scrapeSessions.id, sessionId))
          .catch(() => {});
        emitUpdate(sessionId, state, "running");
      }
    }).catch(() => {});
  }
}

/** Scrape one (niche, city) query with retry */
async function scrapeQuery(opts: {
  browser: Browser;
  niche: string;
  city: string;
  country: string;
  maxReviews: number;
  targetPerQuery: number;
  sessionId: number;
  userId: number;
  state: SessionState;
  emailLimit: ReturnType<typeof pLimit>;
  stopped: { value: boolean };
}): Promise<void> {
  const { browser, niche, city, country, maxReviews, targetPerQuery,
          sessionId, userId, state, emailLimit, stopped } = opts;

  const query = `${niche} in ${city}`;
  const url   = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  try {
    const page = await context.newPage();

    // Block heavy assets — faster scraping
    await page.route("**/*.{png,jpg,jpeg,gif,svg,webp,woff,woff2,ttf,eot,mp4,mp3}", (r) => r.abort());

    await withTimeout(
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 }),
      30_000,
      null,
    );

    // Accept consent if present
    try {
      const btn = page.locator('button[aria-label="Accept all"]');
      if (await btn.isVisible({ timeout: 2_000 })) {
        await btn.click();
        await page.waitForTimeout(800);
      }
    } catch (_) {}

    // Wait for results feed
    try {
      await page.locator('div[role="feed"]').waitFor({ timeout: 12_000 });
    } catch (_) {
      return; // No results — skip query
    }

    const seenNames = new Set<string>();
    let localCollected   = 0;
    let noChangeStreak   = 0;
    let prevCardCount    = 0;

    while (localCollected < targetPerQuery && !stopped.value) {
      const cards = await withTimeout(
        page.evaluate(() => {
          const items: Array<{
            name: string; url: string; rating: string | null;
            reviews: string | null; phone: string | null;
            address: string | null; website: string | null;
          }> = [];
          document.querySelectorAll("div.Nv2PK").forEach((card) => {
            const name    = card.querySelector("div.qBF1Pd")?.textContent?.trim() ?? "";
            const url     = (card.querySelector("a.hfpxzc") as HTMLAnchorElement)?.href ?? "";
            const rating  = card.querySelector("span.MW4etd")?.textContent?.trim() ?? null;
            const reviews = card.querySelector("span.UY7F9")?.textContent?.replace(/[()]/g, "").trim() ?? null;
            const texts   = Array.from(card.querySelectorAll("div.W4Evc span")).map((s) => s.textContent?.trim() ?? "");
            const phone   = texts.find((t) => /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/.test(t)) ?? null;
            const address = texts.find((t) => t.includes(",") && !/\d{3}/.test(t)) ?? null;
            const website = (card.querySelector('a[aria-label*="website"]') as HTMLAnchorElement)?.href ?? null;
            if (name) items.push({ name, url, rating, reviews, phone, address, website });
          });
          return items;
        }),
        8_000,
        [] as any[],
      );

      if (cards.length === prevCardCount) {
        if (++noChangeStreak >= 5) break;
      } else {
        noChangeStreak = 0;
        prevCardCount  = cards.length;
      }

      // Only process cards beyond the skip threshold (= page 3+)
      for (let i = SKIP_TOP_RESULTS; i < cards.length; i++) {
        if (stopped.value || localCollected >= targetPerQuery) break;

        const card = cards[i];
        if (!card.name || seenNames.has(card.name)) continue;

        const reviewsNum = card.reviews
          ? parseInt(card.reviews.replace(/,/g, ""), 10)
          : null;

        // Filter: skip businesses with too many reviews (they're too established)
        if (reviewsNum !== null && reviewsNum > maxReviews) continue;

        seenNames.add(card.name);

        await saveLead(
          {
            sessionId, userId, niche, city, country,
            name: card.name,
            phone: card.phone ?? null,
            website: card.website ?? null,
            rating: card.rating ?? null,
            reviewsCount: reviewsNum ?? null,
            address: card.address ?? null,
            email: null,
            mapsUrl: card.url || null,
          },
          sessionId,
          state,
          emailLimit,
          card.website ?? null,
        );

        localCollected++;
      }

      // Scroll the feed
      await withTimeout(
        page.evaluate(() => {
          const f = document.querySelector('div[role="feed"]');
          if (f) f.scrollTop += 800;
        }),
        3_000,
        null,
      );
      await page.waitForTimeout(1_000);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

export async function runScrapeSession(config: ScrapeConfig): Promise<void> {
  const { sessionId, userId, niches, cities, country, maxReviews, targetVolume } = config;

  const state: SessionState = { leadsCount: 0, emailCount: 0, startTime: Date.now() };
  const stopped             = { value: false };

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu",
        "--no-first-run", "--no-zygote",
      ],
    });

    const queries: Array<{ niche: string; city: string }> = [];
    for (const niche of niches) {
      for (const city of cities) {
        queries.push({ niche, city });
      }
    }

    const perQuery  = Math.ceil((targetVolume + SKIP_TOP_RESULTS) / queries.length);
    const mapLimit   = pLimit(MAPS_CONCURRENCY);
    const emailLimit = pLimit(EMAIL_CONCURRENCY);

    // Run all queries concurrently, respect stopped flag
    await Promise.all(
      queries.map((q) =>
        mapLimit(async () => {
          if (stopped.value || state.leadsCount >= targetVolume) return;
          if (state.leadsCount >= targetVolume) { stopped.value = true; return; }

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await withTimeout(
                scrapeQuery({
                  browser: browser!,
                  niche: q.niche,
                  city: q.city,
                  country,
                  maxReviews,
                  targetPerQuery: perQuery,
                  sessionId,
                  userId,
                  state,
                  emailLimit,
                  stopped,
                }),
                120_000, // 2-min hard timeout per query
                undefined,
              );
              break; // success
            } catch (err) {
              if (attempt === 2) break;
              await sleep(2_000 * (attempt + 1));
            }
          }
        }),
      ),
    );

    // Wait for email tasks to drain (up to 5 more minutes)
    const emailDrainStart = Date.now();
    while (emailLimit.pendingCount > 0 || emailLimit.activeCount > 0) {
      if (Date.now() - emailDrainStart > 300_000) break;
      await sleep(2_000);
      // Emit progress while draining
      emitUpdate(sessionId, state, "running");
    }

    // Final DB sync
    await db
      .update(scrapeSessions)
      .set({
        status: "completed",
        leadsCount: state.leadsCount,
        emailCount: state.emailCount,
        completedAt: new Date(),
      })
      .where(eq(scrapeSessions.id, sessionId));

    emitUpdate(sessionId, state, "completed");
  } catch (err: any) {
    await db
      .update(scrapeSessions)
      .set({
        status: "failed",
        leadsCount: state.leadsCount,
        emailCount: state.emailCount,
        errorMessage: err?.message ?? "Unknown error",
        completedAt: new Date(),
      })
      .where(eq(scrapeSessions.id, sessionId))
      .catch(() => {});
    emitUpdate(sessionId, state, "failed");
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
