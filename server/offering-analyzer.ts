import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export interface OfferingSummary {
  summary: string;
  idealBuyers: string;
  businessTypes: string[];
  painPoints: string[];
}

export interface KeywordResult {
  keywords: string[];
}

export async function analyzeOffering(offering: string): Promise<OfferingSummary> {
  const genAIClient = getGemini();
  if (!genAIClient) {
    throw new Error("GEMINI_API_KEY is required for analysis");
  }

  try {
    const model = genAIClient.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const prompt = `You are a B2B sales strategist. A user sells this service/product:

"${offering}"

Analyze this offering and create a comprehensive summary of WHO would be the ideal BUYERS for this service.

CRITICAL RULES:
1. These are businesses that NEED this service - NOT competitors or similar service providers
2. If user offers "lead generation" → buyers are businesses that NEED leads (roofing companies, law firms, gyms)
3. If user offers "website development" → buyers are businesses that NEED websites (restaurants, plumbers, dentists)
4. If user offers "SEO" → buyers are businesses that NEED SEO (e-commerce stores, local services)
5. Think about who would PAY for this service because it solves THEIR problem

DO NOT include any generic or hardcoded responses. Analyze the specific offering.

Respond in JSON:
{
  "summary": "A 2-3 paragraph detailed summary explaining what types of businesses would benefit most from this offering, why they need it, and what problems it solves for them. Be specific and detailed.",
  "idealBuyers": "A clear description of the ideal buyer persona - their role, their challenges, why they'd pay for this",
  "businessTypes": ["Specific business type 1", "Specific business type 2", "...up to 10 specific business types that would be buyers"],
  "painPoints": ["Pain point 1 that this offering solves", "Pain point 2", "..."]
}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: "You identify BUYERS for services. Focus on businesses that NEED the service being offered, not competitors. Provide detailed, specific analysis."
    });

    const text = result.response.text();
    return JSON.parse(text) as OfferingSummary;
  } catch (error: any) {
    console.error("Offering analysis error:", error.message);
    throw new Error("Failed to analyze offering. Please ensure GEMINI_API_KEY is configured.");
  }
}

export async function generateKeywordsFromSummary(offering: string, summary: OfferingSummary): Promise<KeywordResult> {
  const genAIClient = getGemini();
  if (!genAIClient) {
    throw new Error("GEMINI_API_KEY is required");
  }

  try {
    const model = genAIClient.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const businessTypesStr = summary.businessTypes.map((b, i) => `${i + 1}. ${b}`).join('\n');
    const painPointsStr = summary.painPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');

    const prompt = `Based on this analysis, generate search keywords to find business owners on social media (Instagram/LinkedIn).

ORIGINAL OFFERING: "${offering}"

AI ANALYSIS SUMMARY:
${summary.summary}

IDEAL BUYERS: ${summary.idealBuyers}

BUSINESS TYPES IDENTIFIED:
${businessTypesStr}

PAIN POINTS:
${painPointsStr}

Generate exactly 100 highly specific search keywords that would help find these business owners on Instagram/LinkedIn.

RULES:
1. Keywords should find the BUSINESS OWNERS of the types identified above
2. Combine business types with owner/founder titles (e.g., "restaurant owner", "dental clinic founder")
3. Include variations and related terms
4. DO NOT include generic terms like "entrepreneur" or "small business owner"
5. DO NOT include terms related to the SERVICE being sold - we're finding BUYERS
6. Each keyword should be 2-4 words max
7. Focus on low-competition, high-intent buyers (small to medium businesses).
8. Avoid social media fluff and broad AI hype. Focus on practical needs.

Respond in JSON:
{
  "keywords": ["keyword1", "keyword2", "..."]
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text) as KeywordResult;
  } catch (error: any) {
    console.error("Keyword generation error:", error.message);
    throw new Error("Failed to generate keywords");
  }
}
