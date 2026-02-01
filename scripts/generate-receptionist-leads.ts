import { storage } from "../server/storage";
import { analyzeOffering, generateKeywordsFromSummary } from "../server/offering-analyzer";
import { scrapeLeadsVercel } from "../server/scrapers/vercel-scraper";

async function generateAIReceptionistKeywords() {
  const offering = "AI Receptionist service for small businesses that automates calls, books appointments, and handles customer inquiries 24/7 with zero human intervention.";
  
  // High-intent, low-competition keywords for AI Receptionist niche
  let keywords = [
    "dental clinic 'contact us' email",
    "law firm owner 'gmail.com'",
    "plumbing business owner 'gmail.com'",
    "medical practice manager 'contact'",
    "hvac company owner email",
    "boutique hotel manager 'gmail.com'",
    "real estate broker contact email",
    "veterinary clinic owner 'gmail.com'",
    "auto repair shop owner contact",
    "landscaping business owner email",
    "roofing contractor 'gmail.com'",
    "pest control company owner email",
    "cleaning service owner 'gmail.com'",
    "physiotherapy clinic owner contact",
    "chiropractor owner 'gmail.com'",
    "accounting firm partner email",
    "local pharmacy manager 'gmail.com'",
    "beauty salon owner email",
    "barber shop owner contact",
    "daycare center owner 'gmail.com'"
  ];

  try {
    console.log("Attempting AI keyword generation...");
    const analysis = await analyzeOffering(offering);
    const result = await generateKeywordsFromSummary(offering, analysis);
    if (result.keywords && result.keywords.length > 0) {
      keywords = [...new Set([...keywords, ...result.keywords])];
    }
  } catch (err) {
    console.log("AI generation failed or skipped, using high-intent fallback keywords.");
  }
  
  console.log(`Using ${keywords.length} high-intent keywords.`);
  
  // Create a job and start scraping for 500 leads
  const job = await storage.createScrapeJob({
    platform: 'website',
    query: keywords.slice(0, 10).join(', '),
    offering: offering,
    quantity: 500,
    totalWorkers: 20,
  });

  console.log(`Starting scrape job ${job.id} for 500 leads...`);
  // This will run in the background via the worker pool logic in scrapeLeadsVercel
  scrapeLeadsVercel(job.id, keywords, 500, offering).catch(console.error);
  
  console.log("Job execution initiated. Check the dashboard for real-time progress.");
}

generateAIReceptionistKeywords().catch(console.error);
