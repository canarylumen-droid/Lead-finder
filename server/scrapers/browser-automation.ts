import { chromium, Browser, Page } from "playwright";
import { storage } from "../storage";

export async function scrapeLeads(jobId: number, platform: string, query: string, quantity: number) {
  const browser: Browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  });
  const page: Page = await context.newPage();

  try {
    await storage.addJobLog({
      jobId,
      level: "info",
      message: `Starting ${platform} scrape for "${query}" with quantity ${quantity}`
    });

    await storage.startScrapeJob(jobId);

    if (platform === "instagram" || platform === "both") {
      await scrapeInstagram(page, jobId, query, quantity);
    }
    
    if (platform === "linkedin" || platform === "both") {
      await scrapeLinkedIn(page, jobId, query, quantity);
    }

    await storage.completeScrapeJob(jobId);
    await storage.addJobLog({
      jobId,
      level: "success",
      message: `Scraping completed successfully`
    });
  } catch (error: any) {
    console.error("Scraping error:", error);
    await storage.updateScrapeJobStatus(jobId, "failed", error.message);
    await storage.addJobLog({
      jobId,
      level: "error",
      message: `Scraping failed: ${error.message}`
    });
  } finally {
    await browser.close();
  }
}

async function scrapeInstagram(page: Page, jobId: number, query: string, quantity: number) {
  await storage.addJobLog({ jobId, level: "info", message: "Searching Instagram profiles via Google..." });
  // Search for profiles with 500+ followers constraint in query
  const searchUrl = `https://www.google.com/search?q=site:instagram.com+"500+followers"+${encodeURIComponent(query)}`;
  await page.goto(searchUrl);
  
  // Basic extraction from search results
  const links = await page.$$eval('a', (anchors) => 
    anchors.map(a => a.href).filter(href => href.includes('instagram.com/') && !href.includes('google.com'))
  );

  let processed = 0;
  for (const link of links.slice(0, quantity)) {
    try {
      await page.goto(link);
      const username = link.split('/').filter(Boolean).pop();
      const bio = await page.innerText('header section').catch(() => "");
      
      // Extract email from bio
      const emailMatch = bio.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0] : null;

      // Extract website
      const website = await page.getAttribute('header section a[rel="nofollow"]', 'href').catch(() => null);

      await storage.createLead({
        platform: "instagram",
        username: username || "unknown",
        profileUrl: link,
        bio,
        email,
        website,
        queryUsed: query,
        jobId,
        dedupeHash: `ig-${username}-${email || 'no-email'}`,
        followerCount: 500 // Min requirement
      });
      
      processed++;
      await storage.updateScrapeJobProgress(jobId, { processedCount: processed });
    } catch (e) {
      continue;
    }
  }
}

async function scrapeLinkedIn(page: Page, jobId: number, query: string, quantity: number) {
  await storage.addJobLog({ jobId, level: "info", message: "Searching LinkedIn profiles via Google..." });
  const searchUrl = `https://www.google.com/search?q=site:linkedin.com/in/+${encodeURIComponent(query)}`;
  await page.goto(searchUrl);

  const links = await page.$$eval('a', (anchors) => 
    anchors.map(a => a.href).filter(href => href.includes('linkedin.com/in/') && !href.includes('google.com'))
  );

  let processed = 0;
  for (const link of links.slice(0, quantity)) {
    try {
      // For LinkedIn we often just get the preview unless logged in, 
      // but we can scrape the public profile page
      await page.goto(link);
      const name = await page.innerText('h1').catch(() => "Unknown");
      
      await storage.createLead({
        platform: "linkedin",
        username: link.split('/').filter(Boolean).pop() || "unknown",
        name,
        profileUrl: link,
        queryUsed: query,
        jobId,
        dedupeHash: `li-${link}`,
      });
      
      processed++;
      await storage.updateScrapeJobProgress(jobId, { processedCount: processed });
    } catch (e) {
      continue;
    }
  }
}
