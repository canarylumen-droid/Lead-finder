import { chromium, type Browser } from "playwright-chromium";
import pLimit from "p-limit";
import os from "os";
import { db } from "../db.js";
import { leads, scrapeSessions, type InsertLead } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { scraperEvents } from "../events.js";
import { findEmailForBusiness, hasMXRecord } from "./email-finder.js";

export interface ScrapeConfig {
  sessionId: number;
  userId: number;
  niches: string[];
  cities: string[];
  cityCountryMap: Record<string, string>;
  maxReviews: number;
  targetVolume: number;
  includePhone: boolean;
}

// ─── Skip first 40 results (pages 1-2) — starts scraping from page 3+ ────────
// Pages 3-70+ = hidden gems, low competition, never ranked on Google
const SKIP_TOP_RESULTS = 40;
const EMIT_EVERY = 3; // very frequent WS updates

// ─── Concurrency config ───────────────────────────────────────────────────────
// MAPS: Playwright browser contexts — each uses ~150-250 MB RAM.
//   Keep LOW to avoid OOM. 30 concurrent contexts ≈ 4-6 GB.
// EMAIL: plain HTTP fetches — very cheap. Keep HIGH.
function detectConcurrency(): { maps: number; email: number } {
  const gbTotal = os.totalmem() / 1024 ** 3;

  let maps: number;
  let email: number;

  // Maps concurrency is intentionally capped LOW — browser contexts are heavy.
  // Email concurrency can be high — it is just HTTP.
  if (gbTotal >= 56)      { maps = 40; email = 600; }
  else if (gbTotal >= 28) { maps = 30; email = 400; }
  else if (gbTotal >= 14) { maps = 25; email = 300; }  // 16 GB
  else if (gbTotal >= 7)  { maps = 15; email = 200; }  // 8 GB
  else                    { maps = 8;  email = 80;  }  // dev / small

  if (process.env.SCRAPER_CONCURRENCY) maps  = parseInt(process.env.SCRAPER_CONCURRENCY, 10);
  if (process.env.EMAIL_CONCURRENCY)   email = parseInt(process.env.EMAIL_CONCURRENCY,   10);

  console.log(
    `[scraper] RAM: ${gbTotal.toFixed(1)} GB` +
    ` → Maps concurrency: ${maps} (browser contexts)` +
    `, Email concurrency: ${email} (HTTP)`,
  );
  return { maps, email };
}

// Max realistic leads a single Google Maps search can return before it stops
// loading new results (even with deep scrolling).
const MAX_LEADS_PER_QUERY = 180;

const { maps: MAPS_CONCURRENCY, email: EMAIL_CONCURRENCY } = detectConcurrency();

interface SessionState {
  leadsCount: number;
  emailCount: number;
  startTime:  number;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, sleep(ms).then(() => fallback)]);
}

function emitUpdate(sessionId: number, state: SessionState, status: "running" | "completed" | "failed") {
  const elapsed = (Date.now() - state.startTime) / 60_000;
  const lpm     = elapsed > 0 ? Math.round(state.leadsCount / elapsed) : 0;
  scraperEvents.emit("session_update", {
    sessionId,
    leadsCount: state.leadsCount,
    emailCount: state.emailCount,
    status,
    leadsPerMinute: lpm,
  });
}

async function saveLead(
  data: InsertLead,
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
    return;
  }

  if (!insertedId) return; // duplicate — skip

  state.leadsCount++;

  if (state.leadsCount % EMIT_EVERY === 0 || state.leadsCount === 1) {
    await db
      .update(scrapeSessions)
      .set({ leadsCount: state.leadsCount, emailCount: state.emailCount })
      .where(eq(scrapeSessions.id, sessionId))
      .catch(() => {});
    emitUpdate(sessionId, state, "running");
  }

  // Async email finding — runs in parallel email pool, never blocks map scraping
  if (website) {
    const lid = insertedId;
    emailLimit(async () => {
      // Try email find
      const email = await withTimeout(findEmailForBusiness(website), 16_000, null);
      if (!email) return;

      const mx = await withTimeout(hasMXRecord(email), 4_000, false);

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

async function scrapeQuery(opts: {
  browser: Browser;
  niche: string;
  city: string;
  country: string;
  maxReviews: number;
  targetPerQuery: number;
  sessionId: number;
  userId: number;
  includePhone: boolean;
  state: SessionState;
  emailLimit: ReturnType<typeof pLimit>;
  stopped: { value: boolean };
}): Promise<void> {
  const {
    browser, niche, city, country, maxReviews, targetPerQuery,
    sessionId, userId, includePhone, state, emailLimit, stopped,
  } = opts;

  // Cap so a single query never tries to get more than Google can give
  const realTarget = Math.min(targetPerQuery, MAX_LEADS_PER_QUERY);

  const query = `${niche} in ${city}`;
  const url   = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });

  try {
    const page = await context.newPage();

    // Block images, fonts, media — significant speed improvement
    await page.route("**/*.{png,jpg,jpeg,gif,svg,webp,woff,woff2,ttf,eot,mp4,mp3,ico}", (r) => r.abort());

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
        await page.waitForTimeout(500);
      }
    } catch (_) {}

    try {
      await page.locator('div[role="feed"]').waitFor({ timeout: 12_000 });
    } catch (_) {
      return; // No results panel — skip query
    }

    const seenNames    = new Set<string>();
    let localCollected = 0;
    let noChangeStreak = 0;
    let prevCardCount  = 0;
    let sameCountReps  = 0; // how many times we've seen the same count in a row

    while (localCollected < realTarget && !stopped.value) {
      const cards = await withTimeout(
        page.evaluate(() => {
          const items: Array<{
            name: string; url: string; rating: string | null;
            reviews: string | null; phone: string | null;
            address: string | null; website: string | null;
            closed: boolean;
          }> = [];
          document.querySelectorAll("div.Nv2PK").forEach((card) => {
            const name    = card.querySelector("div.qBF1Pd")?.textContent?.trim() ?? "";
            const url     = (card.querySelector("a.hfpxzc") as HTMLAnchorElement)?.href ?? "";
            const rating  = card.querySelector("span.MW4etd")?.textContent?.trim() ?? null;
            const reviews = card.querySelector("span.UY7F9")?.textContent?.replace(/[()]/g, "").trim() ?? null;
            const texts   = Array.from(card.querySelectorAll("div.W4Evc span, span")).map((s) => s.textContent?.trim() ?? "");
            const phone   = texts.find((t) => /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/.test(t)) ?? null;
            const address = texts.find((t) => t.includes(",") && !t.match(/^\(?[\d]/)) ?? null;
            const website = (card.querySelector('a[aria-label*="website"]') as HTMLAnchorElement)?.href ?? null;
            // Detect permanently or temporarily closed businesses
            const cardText = card.textContent?.toLowerCase() ?? "";
            const closed = cardText.includes("permanently closed") ||
                           cardText.includes("temporarily closed") ||
                           cardText.includes("closed permanently");
            if (name) items.push({ name, url, rating, reviews, phone, address, website, closed });
          });
          return items;
        }),
        8_000,
        [] as any[],
      );

      if (cards.length === prevCardCount) {
        sameCountReps++;
        // After 3 same-count scrolls, try a bigger scroll jump to shake loose
        if (sameCountReps >= 3) {
          await withTimeout(
            page.evaluate(() => {
              const f = document.querySelector('div[role="feed"]');
              if (f) f.scrollTop += 3000; // big jump
            }),
            3_000, null,
          );
          await page.waitForTimeout(800);
        }
        if (++noChangeStreak >= 8) break; // truly no more results
      } else {
        noChangeStreak  = 0;
        sameCountReps   = 0;
        prevCardCount   = cards.length;
      }

      // Process from SKIP_TOP_RESULTS onwards (page 4+)
      for (let i = SKIP_TOP_RESULTS; i < cards.length; i++) {
        if (stopped.value || localCollected >= realTarget) break;

        const card = cards[i];
        if (!card.name || seenNames.has(card.name)) continue;
        if (card.closed) continue; // skip permanently/temporarily closed businesses

        const reviewsNum = card.reviews
          ? parseInt(card.reviews.replace(/,/g, ""), 10)
          : null;

        // maxReviews = 0 means no filter; otherwise skip high-review businesses
        if (maxReviews > 0 && reviewsNum !== null && reviewsNum > maxReviews) continue;

        seenNames.add(card.name);

        await saveLead(
          {
            sessionId, userId, niche, city, country,
            name:         card.name,
            phone:        includePhone ? (card.phone ?? null) : null,
            website:      card.website ?? null,
            rating:       card.rating ?? null,
            reviewsCount: reviewsNum ?? null,
            address:      card.address ?? null,
            email:        null,
            mapsUrl:      card.url || null,
          },
          sessionId,
          state,
          emailLimit,
          card.website ?? null,
        );

        localCollected++;
      }

      // Normal scroll — moderate amount for steady loading
      await withTimeout(
        page.evaluate(() => {
          const f = document.querySelector('div[role="feed"]');
          if (f) f.scrollTop += 1200;
        }),
        3_000,
        null,
      );
      await page.waitForTimeout(350); // minimal wait — keep it fast
    }
  } finally {
    await context.close().catch(() => {});
  }
}

export async function runScrapeSession(config: ScrapeConfig): Promise<void> {
  const {
    sessionId, userId, niches, cities, cityCountryMap,
    maxReviews, targetVolume, includePhone,
  } = config;

  const state: SessionState = { leadsCount: 0, emailCount: 0, startTime: Date.now() };
  const stopped             = { value: false };

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu",
        "--no-first-run", "--no-zygote", "--single-process",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-extensions",
        "--mute-audio",
      ],
    });

    // Build queries: every niche × every city combination
    const queries: Array<{ niche: string; city: string; country: string }> = [];
    for (const niche of niches) {
      for (const city of cities) {
        queries.push({ niche, city, country: cityCountryMap[city] ?? "Unknown" });
      }
    }

    // How many leads each query should try to collect.
    // Capped at MAX_LEADS_PER_QUERY — Google Maps won't give more per search anyway.
    const perQuery = Math.min(
      MAX_LEADS_PER_QUERY,
      Math.ceil(targetVolume / queries.length) + 20, // +20 buffer for dedupes
    );

    console.log(
      `[scraper] session=${sessionId} | ${queries.length} queries | ` +
      `target=${targetVolume} | perQuery=${perQuery} | ` +
      `maps_concurrency=${MAPS_CONCURRENCY} | email_concurrency=${EMAIL_CONCURRENCY}`,
    );

    const mapLimit   = pLimit(MAPS_CONCURRENCY);
    const emailLimit = pLimit(EMAIL_CONCURRENCY);

    await Promise.all(
      queries.map((q) =>
        mapLimit(async () => {
          if (stopped.value) return;
          if (state.leadsCount >= targetVolume) { stopped.value = true; return; }

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await withTimeout(
                scrapeQuery({
                  browser: browser!,
                  niche: q.niche,
                  city: q.city,
                  country: q.country,
                  maxReviews,
                  targetPerQuery: perQuery,
                  sessionId,
                  userId,
                  includePhone,
                  state,
                  emailLimit,
                  stopped,
                }),
                90_000, // 90s per query max
                undefined,
              );
              break; // success — no retry needed
            } catch {
              if (attempt === 2) break;
              await sleep(1_500 * (attempt + 1));
            }
          }
        }),
      ),
    );

    // Drain remaining email jobs — keep updating UI as they finish
    const drainStart = Date.now();
    while (emailLimit.pendingCount > 0 || emailLimit.activeCount > 0) {
      if (Date.now() - drainStart > 600_000) break; // 10 min max drain
      await sleep(1_000);
      emitUpdate(sessionId, state, "running");
    }

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
    console.log(`[scraper] session=${sessionId} DONE | leads=${state.leadsCount} | emails=${state.emailCount}`);
  } catch (err: any) {
    console.error(`[scraper] session=${sessionId} FAILED:`, err?.message);
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
