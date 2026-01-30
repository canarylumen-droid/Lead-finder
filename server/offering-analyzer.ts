import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export interface NicheSuggestion {
  niche: string;
  reasoning: string;
  decisionMaker: string;
  budgetRange: string;
}

export interface OfferingAnalysis {
  summary: string;
  targetDescription: string;
  niches: NicheSuggestion[];
}

export interface KeywordGenerationResult {
  keywords: string[];
  nicheBreakdown: { niche: string; keywords: string[] }[];
}

// Step 1: Analyze offering and identify ideal buyer niches
export async function analyzeOffering(offering: string): Promise<OfferingAnalysis> {
  const openai = getOpenAI();
  
  if (!openai) {
    return fallbackAnalysis(offering);
  }

  try {
    const prompt = `You are a B2B sales strategist. A user sells this service/product:

"${offering}"

Your job is to identify 5-8 specific BUSINESS NICHES that would be BUYERS of this service. These are businesses that NEED what the user offers.

CRITICAL RULES:
1. DO NOT suggest competitors or similar businesses. If user offers "lead generation", do NOT suggest "marketing agencies" - those are competitors, not buyers.
2. DO NOT suggest businesses that provide similar services. Focus on who NEEDS the service.
3. Think: "Which businesses would PAY for this service because it solves THEIR problem?"
4. Be specific with niches (e.g., "HVAC repair companies" not just "contractors")

Examples of correct thinking:
- User offers "website development" → Buyers: restaurants, dental clinics, plumbers, real estate agents (they NEED websites)
- User offers "lead generation" → Buyers: roofing companies, law firms, gyms, home improvement contractors (they NEED leads)
- User offers "SEO services" → Buyers: e-commerce stores, local dentists, chiropractors, wedding photographers (they NEED SEO)

Respond in JSON:
{
  "summary": "2-3 sentence overview of who your ideal buyers are and why they need your service",
  "targetDescription": "The type of decision maker to target (e.g., 'Small business owners who struggle with...')",
  "niches": [
    {
      "niche": "Specific Business Niche Name",
      "reasoning": "Why this niche desperately needs your service - their pain point",
      "decisionMaker": "Who makes buying decisions (e.g., 'Owner', 'Marketing Manager')",
      "budgetRange": "$X-$Y/month typical spend"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You identify BUYERS for services, not competitors. Focus on businesses that NEED the service being offered."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const analysis = JSON.parse(content) as OfferingAnalysis;
    return analysis;
  } catch (error: any) {
    console.error("Offering analysis error:", error.message);
    return fallbackAnalysis(offering);
  }
}

// Step 2: Generate search keywords for the identified niches
export async function generateKeywordsForNiches(offering: string, niches: string[]): Promise<KeywordGenerationResult> {
  const openai = getOpenAI();
  
  if (!openai) {
    return fallbackKeywords(niches);
  }

  try {
    const prompt = `Generate search keywords to find business owners/decision makers on social media (Instagram/LinkedIn).

SERVICE BEING SOLD: "${offering}"

TARGET NICHES (these are the BUYERS, not competitors):
${niches.map((n, i) => `${i + 1}. ${n}`).join('\n')}

For EACH niche, generate 3-5 specific search terms that would help find these business owners on Instagram/LinkedIn.

RULES:
1. Keywords should find the BUSINESS OWNERS in these niches, not the service provider
2. Include job titles + niche combinations (e.g., "dental clinic owner", "HVAC business founder")
3. Include niche-specific terms (e.g., "roofing contractor", "salon owner")
4. Do NOT include generic terms like "entrepreneur" or "small business"
5. Do NOT include terms related to the SERVICE being sold (we're finding BUYERS, not sellers)

Example for "restaurant" niche:
- "restaurant owner"
- "cafe founder"
- "food truck owner"
- "hospitality entrepreneur"

Respond in JSON:
{
  "nicheBreakdown": [
    {
      "niche": "Niche Name",
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
  ],
  "keywords": ["all", "combined", "keywords", "deduplicated"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const result = JSON.parse(content) as KeywordGenerationResult;
    return result;
  } catch (error: any) {
    console.error("Keyword generation error:", error.message);
    return fallbackKeywords(niches);
  }
}

// Fallback when no OpenAI
function fallbackAnalysis(offering: string): OfferingAnalysis {
  const words = offering.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  return {
    summary: `Based on "${offering}", we'll help you find businesses that need your service. Please ensure OpenAI is configured for AI-powered analysis.`,
    targetDescription: "Business owners and decision makers who would benefit from your service",
    niches: [
      {
        niche: "Local Service Businesses",
        reasoning: "Small local businesses often need outside help with specialized services",
        decisionMaker: "Owner",
        budgetRange: "$500-$2000/month"
      },
      {
        niche: "E-commerce Stores",
        reasoning: "Online businesses frequently outsource specialized work",
        decisionMaker: "Founder/Owner",
        budgetRange: "$1000-$5000/month"
      },
      {
        niche: "Professional Services",
        reasoning: "Lawyers, accountants, and consultants often need support services",
        decisionMaker: "Managing Partner",
        budgetRange: "$500-$3000/month"
      }
    ],
  };
}

function fallbackKeywords(niches: string[]): KeywordGenerationResult {
  const ownerSuffixes = ['owner', 'founder', 'CEO', 'director'];
  const keywords: string[] = [];
  const nicheBreakdown: { niche: string; keywords: string[] }[] = [];

  for (const niche of niches) {
    const nicheKeywords = ownerSuffixes.map(suffix => `${niche} ${suffix}`);
    nicheBreakdown.push({ niche, keywords: nicheKeywords });
    keywords.push(...nicheKeywords);
  }

  return { keywords: Array.from(new Set(keywords)), nicheBreakdown };
}
