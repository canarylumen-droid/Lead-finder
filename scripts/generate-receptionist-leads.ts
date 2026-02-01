import { storage } from "../server/storage";
import { analyzeOffering, generateKeywordsFromSummary } from "../server/offering-analyzer";
import { scrapeLeadsVercel } from "../server/scrapers/vercel-scraper";

async function generateAIReceptionistKeywords() {
  const offering = "AI Receptionist service for small businesses that automates calls, books appointments, and handles customer inquiries 24/7 with zero human intervention.";
  
  let keywords = [
    "small law firm owner email",
    "dental practice owner gmail",
    "medical clinic manager contact",
    "plumbing business owner email",
    "hvac company owner contact",
    "boutique hotel manager email",
    "real estate agency owner gmail",
    "veterinary clinic owner email",
    "auto repair shop owner contact",
    "landscaping business owner gmail",
    "roofing contractor owner email",
    "pest control owner contact",
    "cleaning service owner gmail",
    "physiotherapy clinic owner email",
    "chiropractor owner contact",
    "accounting firm partner email",
    "local pharmacy owner gmail",
    "beauty salon owner email",
    "barber shop owner contact",
    "daycare center owner gmail"
  ];

  try {
    console.log("Attempting AI keyword generation...");
    const analysis = await analyzeOffering(offering);
    const result = await generateKeywordsFromSummary(offering, analysis);
    if (result.keywords && result.keywords.length > 0) {
      keywords = result.keywords;
    }
  } catch (err) {
    console.log("AI generation failed, using high-intent fallback keywords.");
  }
  
  console.log(`Using ${keywords.length} high-intent keywords.`);
  
  // Create a job and start scraping
  const job = await storage.createScrapeJob({
    platform: 'both',
    query: keywords.slice(0, 5).join(', '),
    offering: offering,
    quantity: 500,
    totalWorkers: 20,
  });

  console.log(`Starting scrape job ${job.id} for 500 leads...`);
  await scrapeLeadsVercel(job.id, keywords, 500, offering);
  
  console.log("Job completed. Check the dashboard or download CSV.");
}

generateAIReceptionistKeywords().catch(console.error);
