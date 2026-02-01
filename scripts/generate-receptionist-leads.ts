import { storage } from "../server/storage";
import { analyzeOffering, generateKeywordsFromSummary } from "../server/offering-analyzer";

async function generateAIReceptionistKeywords() {
  const offering = "AI Receptionist service for small businesses that automates calls, books appointments, and handles customer inquiries 24/7 with zero human intervention.";
  
  console.log("Analyzing offering...");
  const analysis = await analyzeOffering(offering);
  
  console.log("Generating 100+ keywords...");
  const result = await generateKeywordsFromSummary(offering, analysis);
  
  console.log(`Generated ${result.keywords.length} keywords.`);
  console.log("Keywords:", result.keywords.join(", "));
  
  return result.keywords;
}

generateAIReceptionistKeywords().catch(console.error);
