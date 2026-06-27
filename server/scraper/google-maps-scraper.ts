import { chromium, type Browser } from "playwright-chromium";
import pLimit from "p-limit";
import os from "os";
import { db } from "../db.js";
import { leads, scrapeSessions, type InsertLead } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { scraperEvents } from "../events.js";
import { findEmailForBusiness, hasMXRecord } from "./email-finder.js";

// ─── Global session control sets (imported by routes.ts) ─────────────────────
export const cancelledSessions = new Set<number>();
export const pausedSessions    = new Set<number>();

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

// ─── Start from first result — maxReviews filter handles qualification ────────
const SKIP_TOP_RESULTS = 0;
const EMIT_EVERY       = 1;  // emit WebSocket update on every new lead

// ─── Concurrency config ───────────────────────────────────────────────────────
function detectConcurrency(): { maps: number; email: number } {
  const gbTotal = os.totalmem() / 1024 ** 3;
  let maps: number;
  let email: number;
  if      (gbTotal >= 56) { maps = 10; email = 200; }
  else if (gbTotal >= 28) { maps =  6; email = 150; }
  else if (gbTotal >= 14) { maps =  4; email = 100; }
  else if (gbTotal >=  7) { maps =  3; email =  80; }
  else                    { maps =  2; email =  40; }
  if (process.env.SCRAPER_CONCURRENCY) maps  = parseInt(process.env.SCRAPER_CONCURRENCY, 10);
  if (process.env.EMAIL_CONCURRENCY)   email = parseInt(process.env.EMAIL_CONCURRENCY,   10);
  console.log(`[scraper] RAM: ${gbTotal.toFixed(1)} GB → Maps: ${maps}, Email: ${email}`);
  return { maps, email };
}

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

function emitUpdate(sessionId: number, state: SessionState, status: "running" | "completed" | "failed" | "paused") {
  const elapsed = (Date.now() - state.startTime) / 60_000;
  const lpm     = elapsed > 0.05 ? Math.round(state.leadsCount / elapsed) : 0;
  scraperEvents.emit("session_update", {
    sessionId,
    leadsCount:     state.leadsCount,
    emailCount:     state.emailCount,
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
  globalSeen: Set<string>,
) {
  // Cross-session dedup: skip if this user already has this business+city
  const dedupeKey = `${data.name.toLowerCase()}|${data.city.toLowerCase()}`;
  if (globalSeen.has(dedupeKey)) return;

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

  if (!insertedId) return; // DB conflict
  globalSeen.add(dedupeKey); // mark as seen globally

  state.leadsCount++;

  if (state.leadsCount % EMIT_EVERY === 0 || state.leadsCount === 1) {
    await db
      .update(scrapeSessions)
      .set({ leadsCount: state.leadsCount, emailCount: state.emailCount })
      .where(eq(scrapeSessions.id, sessionId))
      .catch(() => {});
    emitUpdate(sessionId, state, "running");
  }

  // Async email finding — never blocks map scraping
  if (website) {
    const lid = insertedId;
    emailLimit(async () => {
      const email = await withTimeout(findEmailForBusiness(website), 18_000, null);
      if (!email) return;
      const mx = await withTimeout(hasMXRecord(email), 4_000, false);
      await db
        .update(leads)
        .set({ email, emailVerified: mx ? 1 : 0 })
        .where(eq(leads.id, lid))
        .catch(() => {});
      state.emailCount++;
      await db
        .update(scrapeSessions)
        .set({ emailCount: state.emailCount })
        .where(eq(scrapeSessions.id, sessionId))
        .catch(() => {});
      emitUpdate(sessionId, state, "running");
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
  globalSeen: Set<string>;
}): Promise<void> {
  const {
    browser, niche, city, country, maxReviews, targetPerQuery,
    sessionId, userId, includePhone, state, emailLimit, stopped, globalSeen,
  } = opts;

  // Abort/pause check before starting
  if (cancelledSessions.has(sessionId)) { stopped.value = true; return; }

  const realTarget = Math.min(targetPerQuery, MAX_LEADS_PER_QUERY);
  const query      = `${niche} in ${city}`;
  const url        = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  // Stagger concurrent requests: random delay 0–4s to avoid simultaneous Google hits
  await sleep(Math.floor(Math.random() * 4000));

  let context;
  try {
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport:  { width: 1280, height: 900 },
      locale:    "en-US",
    });
  } catch (ctxErr: any) {
    console.log(`[scraper] context error (browser down?): ${ctxErr?.message?.slice(0, 80)}`);
    return;
  }

  try {
    const page = await context.newPage();
    await page.route("**/*.{png,jpg,jpeg,gif,svg,webp,woff,woff2,ttf,eot,mp4,mp3,ico}", (r) => r.abort());
    const gotoResult = await withTimeout(page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 }), 30_000, null);
    if (!gotoResult) { console.log(`[scraper] goto timeout: ${query}`); return; }

    // Accept consent if present
    try {
      const btn = page.locator('button[aria-label="Accept all"]');
      if (await btn.isVisible({ timeout: 2_000 })) { await btn.click(); await page.waitForTimeout(500); }
    } catch (_) {}

    let feedLoaded = true;
    try {
      await page.locator('div[role="feed"]').waitFor({ timeout: 12_000 });
    } catch (_) { feedLoaded = false; }

    if (!feedLoaded) {
      const title = await page.title().catch(() => "?");
      console.log(`[scraper] no feed (title="${title}"): ${query}`);
      return;
    }

    const seenNames    = new Set<string>();
    let localCollected = 0;
    let noChangeStreak = 0;
    let prevCardCount  = 0;
    let sameCountReps  = 0;

    while (localCollected < realTarget && !stopped.value) {
      // Check for abort / pause every iteration
      if (cancelledSessions.has(sessionId)) { stopped.value = true; break; }
      while (pausedSessions.has(sessionId) && !cancelledSessions.has(sessionId)) {
        emitUpdate(sessionId, state, "paused");
        await sleep(2_000);
      }
      if (cancelledSessions.has(sessionId)) { stopped.value = true; break; }

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
            // Phone: try US and international patterns
            const phone   = texts.find((t) =>
              /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/.test(t) ||
              /\+\d[\d\s\-().]{7,15}/.test(t)
            ) ?? null;
            const address = texts.find((t) => t.includes(",") && !t.match(/^\(?[\d+]/)) ?? null;
            const website = (card.querySelector('a[aria-label*="website"]') as HTMLAnchorElement)?.href ?? null;
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
        if (sameCountReps >= 3) {
          await withTimeout(
            page.evaluate(() => { const f = document.querySelector('div[role="feed"]'); if (f) f.scrollTop += 3000; }),
            3_000, null,
          );
          await page.waitForTimeout(800);
        }
        if (++noChangeStreak >= 8) break;
      } else {
        noChangeStreak = 0;
        sameCountReps  = 0;
        prevCardCount  = cards.length;
      }

      for (let i = SKIP_TOP_RESULTS; i < cards.length; i++) {
        if (stopped.value || localCollected >= realTarget) break;
        const card = cards[i];
        if (!card.name || seenNames.has(card.name)) continue;
        if (card.closed) continue; // skip permanently/temporarily closed

        const reviewsNum = card.reviews ? parseInt(card.reviews.replace(/,/g, ""), 10) : null;
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
          sessionId, state, emailLimit, card.website ?? null, globalSeen,
        );
        localCollected++;
      }

      await withTimeout(
        page.evaluate(() => { const f = document.querySelector('div[role="feed"]'); if (f) f.scrollTop += 1200; }),
        3_000, null,
      );
      await page.waitForTimeout(300);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

export async function runScrapeSession(config: ScrapeConfig): Promise<void> {
  const { sessionId, userId, niches, cities, cityCountryMap, maxReviews, targetVolume, includePhone } = config;

  const state: SessionState = { leadsCount: 0, emailCount: 0, startTime: Date.now() };
  const stopped = { value: false };

  let browser: Browser | null = null;

  // ── Cross-session dedup: load all existing (name, city) for this user ────────
  const existingRows = await db
    .select({ name: leads.name, city: leads.city })
    .from(leads)
    .where(eq(leads.userId, userId))
    .catch(() => [] as { name: string; city: string }[]);
  const globalSeen = new Set<string>(
    existingRows.map((r) => `${r.name.toLowerCase()}|${r.city.toLowerCase()}`),
  );
  console.log(`[scraper] session=${sessionId} | globalSeen=${globalSeen.size} existing leads for user ${userId}`);

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu",
        "--no-first-run", "--no-zygote",
        "--disable-background-networking", "--disable-default-apps",
        "--disable-extensions", "--mute-audio",
      ],
    });

    const queries: Array<{ niche: string; city: string; country: string }> = [];
    for (const niche of niches) {
      for (const city of cities) {
        queries.push({ niche, city, country: cityCountryMap[city] ?? "Unknown" });
      }
    }

    const perQuery = Math.min(
      MAX_LEADS_PER_QUERY,
      Math.ceil(targetVolume / queries.length) + 20,
    );

    console.log(
      `[scraper] session=${sessionId} | ${queries.length} queries | ` +
      `target=${targetVolume} | perQuery=${perQuery} | ` +
      `maps=${MAPS_CONCURRENCY} | email=${EMAIL_CONCURRENCY}`,
    );

    const mapLimit   = pLimit(MAPS_CONCURRENCY);
    const emailLimit = pLimit(EMAIL_CONCURRENCY);

    await Promise.all(
      queries.map((q) =>
        mapLimit(async () => {
          if (stopped.value || cancelledSessions.has(sessionId)) return;
          if (state.leadsCount >= targetVolume) { stopped.value = true; return; }

          // Wait while paused
          while (pausedSessions.has(sessionId) && !cancelledSessions.has(sessionId)) {
            await sleep(2_000);
          }
          if (cancelledSessions.has(sessionId)) { stopped.value = true; return; }

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await withTimeout(
                scrapeQuery({
                  browser: browser!, niche: q.niche, city: q.city, country: q.country,
                  maxReviews, targetPerQuery: perQuery, sessionId, userId,
                  includePhone, state, emailLimit, stopped, globalSeen,
                }),
                90_000,
                undefined,
              );
              break;
            } catch {
              if (attempt === 2) break;
              await sleep(1_500 * (attempt + 1));
            }
          }
        }),
      ),
    );

    // Drain email queue
    const drainStart = Date.now();
    while (emailLimit.pendingCount > 0 || emailLimit.activeCount > 0) {
      if (Date.now() - drainStart > 600_000) break;
      await sleep(1_000);
      emitUpdate(sessionId, state, "running");
    }

    const finalStatus = cancelledSessions.has(sessionId) ? "failed" : "completed";
    const finalError  = cancelledSessions.has(sessionId) ? "Aborted by user" : undefined;

    await db
      .update(scrapeSessions)
      .set({
        status: finalStatus,
        leadsCount: state.leadsCount,
        emailCount: state.emailCount,
        errorMessage: finalError ?? null,
        completedAt: new Date(),
      })
      .where(eq(scrapeSessions.id, sessionId));

    cancelledSessions.delete(sessionId);
    pausedSessions.delete(sessionId);

    emitUpdate(sessionId, state, finalStatus === "completed" ? "completed" : "failed");
    console.log(`[scraper] session=${sessionId} ${finalStatus} | leads=${state.leadsCount} | emails=${state.emailCount}`);
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
    cancelledSessions.delete(sessionId);
    pausedSessions.delete(sessionId);
    emitUpdate(sessionId, state, "failed");
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
