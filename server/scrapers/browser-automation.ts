import { chromium, Browser, Page } from "playwright";
import { storage } from "../storage";

export async function scrapeLeads(jobId: number, platform: string, query: string, quantity: number) {
  const browser: Browser = await chromium.launch({ 
    headless: true,
    executablePath: "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ] 
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
    await storage.addJobLog({ jobId, level: "info", message: "Browser launched successfully" });

    if (platform === "instagram" || platform === "both") {
      await storage.addJobLog({ jobId, level: "info", message: "Starting Instagram module..." });
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

async function scrapeWebsiteForEmails(page: Page, url: string): Promise<string | null> {
  try {
    if (!url.startsWith('http')) url = `https://${url}`;
    await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    const content = await page.content();
    const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return emailMatch ? emailMatch[0] : null;
  } catch (e) {
    return null;
  }
}

async function scrapeInstagram(page: Page, jobId: number, query: string, quantity: number) {
  await storage.addJobLog({ jobId, level: "info", message: "Searching Instagram profiles via Google..." });
  const searchUrl = `https://www.google.com/search?q=site:instagram.com+"500+followers"+${encodeURIComponent(query)}`;
  
  // Rotate User Agents
  const uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
  ];

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    const links = await page.$$eval('a', (anchors) => 
      anchors.map(a => a.href).filter(href => href.includes('instagram.com/') && !href.includes('google.com'))
    );

    await storage.addJobLog({ jobId, level: "info", message: `Found ${links.length} potential Instagram profiles` });

    if (links.length === 0) {
      const content = await page.content();
      if (content.includes('consent.google.com') || content.includes('captcha')) {
        await storage.addJobLog({ jobId, level: "warn", message: "Google bot detection triggered. Try again in a few minutes." });
      }
    }

    let processed = 0;
    for (const link of links.slice(0, quantity)) {
      try {
        // Set random UA for each profile to avoid detection
        await page.context().setExtraHTTPHeaders({ 'User-Agent': uas[Math.floor(Math.random() * uas.length)] });
        
        await page.goto(link, { waitUntil: 'networkidle' });
        const username = link.split('/').filter(Boolean).pop();
        const bio = await page.innerText('header section').catch(() => "");
        
        let email = bio.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || null;
        const website = await page.getAttribute('header section a[rel="nofollow"]', 'href').catch(() => null);

        // Deep Scrape Website if no email in bio
        if (!email && website) {
          await storage.addJobLog({ jobId, level: "info", message: `No email in bio for ${username}, checking website: ${website}` });
          email = await scrapeWebsiteForEmails(page, website);
        }

        await storage.createLead({
          platform: "instagram",
          username: username || "unknown",
          profileUrl: link,
          bio,
          email,
          website,
          queryUsed: query,
          jobId,
          dedupeHash: `ig-${username}-${email || Math.random()}`,
          followerCount: 500
        });
        
        processed++;
        await storage.updateScrapeJobProgress(jobId, { processedCount: processed });
        // Human-like delay
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
      } catch (e) {
        console.error(`Error scraping Instagram profile ${link}:`, e);
        continue;
      }
    }
  } catch (error: any) {
    await storage.addJobLog({ jobId, level: "error", message: `Instagram search failed: ${error.message}` });
    return;
  }
}

async function scrapeLinkedIn(page: Page, jobId: number, query: string, quantity: number) {
  await storage.addJobLog({ jobId, level: "info", message: "Searching LinkedIn profiles via Google..." });
  const searchUrl = `https://www.google.com/search?q=site:linkedin.com/in/+${encodeURIComponent(query)}`;
  
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    const links = await page.$$eval('a', (anchors) => 
      anchors.map(a => a.href).filter(href => href.includes('linkedin.com/in/') && !href.includes('google.com'))
    );

    await storage.addJobLog({ jobId, level: "info", message: `Found ${links.length} potential LinkedIn profiles` });

    let processed = 0;
    for (const link of links.slice(0, quantity)) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded' });
        const name = await page.innerText('h1').catch(() => "Unknown");
        const title = await page.innerText('h2').catch(() => "");
        const about = await page.innerText('#about').catch(() => "");
        
        let email = about.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || null;

        await storage.createLead({
          platform: "linkedin",
          username: link.split('/').filter(Boolean).pop() || "unknown",
          name,
          title,
          profileUrl: link,
          queryUsed: query,
          jobId,
          email,
          dedupeHash: `li-${link}-${email || 'no-email'}`,
        });
        
        processed++;
        await storage.updateScrapeJobProgress(jobId, { processedCount: processed });
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
      } catch (e) {
        continue;
      }
    }
  } catch (error: any) {
    await storage.addJobLog({ jobId, level: "error", message: `LinkedIn search failed: ${error.message}` });
  }
}
