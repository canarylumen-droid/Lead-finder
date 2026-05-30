import { chromium, type Browser, type BrowserContext } from "playwright-chromium";
import pLimit from "p-limit";
import { db } from "../db.js";
import { leads, scrapeSessions } from "../../shared/schema.js";
import { eq, sql } from "drizzle-orm";

export interface ScrapeConfig {
  sessionId: number;
  userId: number;
  niches: string[];
  cities: string[];
  country: string;
  maxReviews: number;
  targetVolume: number;
}

// How many results to scroll past before collecting (skip page 1 & 2 ≈ 40 results)
const SKIP_TOP_RESULTS = 40;

// Concurrent browser contexts — configurable via env
const CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY ?? "20", 10);

export async function runScrapeSession(config: ScrapeConfig): Promise<void> {
  const { sessionId, userId, niches, cities, country, maxReviews, targetVolume } = config;

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    });

    // Build all query combinations
    const queries: Array<{ niche: string; city: string }> = [];
    for (const niche of niches) {
      for (const city of cities) {
        queries.push({ niche, city });
      }
    }

    const limit = pLimit(CONCURRENCY);
    let totalCollected = 0;

    const tasks = queries.map(({ niche, city }) =>
      limit(async () => {
        if (totalCollected >= targetVolume) return;

        const context = await browser!.newContext({
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          viewport: { width: 1280, height: 800 },
        });

        try {
          const perQuery = Math.ceil(targetVolume / queries.length);
          const collected = await scrapeQuery({
            context,
            niche,
            city,
            country,
            maxReviews,
            maxResults: perQuery + SKIP_TOP_RESULTS,
            skipTop: SKIP_TOP_RESULTS,
            sessionId,
            userId,
          });
          totalCollected += collected;

          // Update live count in DB
          await db
            .update(scrapeSessions)
            .set({ leadsCount: sql`leads_count + ${collected}` })
            .where(eq(scrapeSessions.id, sessionId));
        } finally {
          await context.close();
        }
      })
    );

    await Promise.all(tasks);

    await db
      .update(scrapeSessions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(scrapeSessions.id, sessionId));
  } catch (err: any) {
    await db
      .update(scrapeSessions)
      .set({ status: "failed", errorMessage: err.message, completedAt: new Date() })
      .where(eq(scrapeSessions.id, sessionId));
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeQuery(opts: {
  context: BrowserContext;
  niche: string;
  city: string;
  country: string;
  maxReviews: number;
  maxResults: number;
  skipTop: number;
  sessionId: number;
  userId: number;
}): Promise<number> {
  const { context, niche, city, country, maxReviews, maxResults, skipTop, sessionId, userId } = opts;
  const query = `${niche} in ${city}`;
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  const page = await context.newPage();
  let collected = 0;

  try {
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Accept consent banner if present
    try {
      const consent = page.locator('button[aria-label="Accept all"]');
      if (await consent.isVisible({ timeout: 3000 })) {
        await consent.click();
        await page.waitForTimeout(1000);
      }
    } catch (_) {}

    // Wait for the results feed
    const feed = page.locator('div[role="feed"]');
    try {
      await feed.waitFor({ timeout: 15000 });
    } catch (_) {
      return 0;
    }

    const seenNames = new Set<string>();
    let totalSeen = 0;
    let noChangeStreak = 0;

    while (totalSeen < maxResults && noChangeStreak < 5) {
      // Extract currently visible cards
      const cards = await page.evaluate(() => {
        const items: Array<{
          name: string;
          url: string;
          rating: string | null;
          reviews: string | null;
          phone: string | null;
          address: string | null;
          website: string | null;
        }> = [];
        document.querySelectorAll("div.Nv2PK").forEach((card) => {
          const name = card.querySelector("div.qBF1Pd")?.textContent?.trim() || "";
          const url = (card.querySelector("a.hfpxzc") as HTMLAnchorElement)?.href || "";
          const rating = card.querySelector("span.MW4etd")?.textContent?.trim() || null;
          const reviews = card.querySelector("span.UY7F9")?.textContent?.replace(/[()]/g, "").trim() || null;
          const texts = Array.from(card.querySelectorAll("div.W4Evc span")).map(
            (s) => s.textContent?.trim() || ""
          );
          const phone = texts.find((t) => /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(t)) || null;
          const address = texts.find((t) => t.includes(",") && !t.match(/\d{3}/)) || null;
          const website =
            (card.querySelector('a[aria-label*="website"]') as HTMLAnchorElement)?.href || null;
          if (name) items.push({ name, url, rating, reviews, phone, address, website });
        });
        return items;
      });

      const prevSeen = totalSeen;
      totalSeen = cards.length;

      if (totalSeen === prevSeen) {
        noChangeStreak++;
      } else {
        noChangeStreak = 0;
      }

      // Process cards that are beyond the skip threshold and not yet seen
      for (let i = skipTop; i < cards.length; i++) {
        const card = cards[i];
        if (!card.name || seenNames.has(card.name)) continue;

        // Parse and filter by maxReviews
        const reviewsNum = card.reviews ? parseInt(card.reviews.replace(/,/g, ""), 10) : null;
        if (reviewsNum !== null && reviewsNum > maxReviews) continue;

        seenNames.add(card.name);

        try {
          await db.insert(leads).values({
            sessionId,
            userId,
            niche,
            city,
            country,
            name: card.name,
            phone: card.phone,
            website: card.website,
            rating: card.rating,
            reviewsCount: reviewsNum,
            address: card.address,
            email: null,
            mapsUrl: card.url,
          }).onConflictDoNothing();
          collected++;
        } catch (_) {}
      }

      // Scroll down the feed
      await page.evaluate(() => {
        const f = document.querySelector('div[role="feed"]');
        if (f) f.scrollTop += 600;
      });
      await page.waitForTimeout(1200);
    }
  } finally {
    await page.close();
  }

  return collected;
}
