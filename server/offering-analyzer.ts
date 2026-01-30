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

export interface LeadSuggestion {
  category: string;
  keywords: string[];
  description: string;
  buyerProfile: string;
  estimatedBudget: string;
}

export interface OfferingAnalysis {
  summary: string;
  targetAudience: string;
  suggestedLeadTypes: LeadSuggestion[];
  searchKeywords: string[];
}

export async function analyzeOffering(offering: string): Promise<OfferingAnalysis> {
  const openai = getOpenAI();
  
  if (!openai) {
    return extractKeywordsFromOffering(offering);
  }

  try {
    // First AI: Generate 100+ diverse keywords
    const prompt = `You are a B2B lead generation expert. Analyze this offering and find WHO would BUY it.

OFFERING: ${offering}

CRITICAL RULES:
1. Find BUYERS of this service, NOT fellow agencies or competitors
2. If they sell "lead generation", find businesses that NEED leads (restaurants, dentists, real estate), NOT other lead gen agencies
3. If they sell "SEO", find businesses that need SEO (local shops, lawyers, clinics), NOT marketing agencies
4. Find business OWNERS/founders/CEOs who make buying decisions
5. NO freelancers, NO employees, NO fellow service providers
6. Focus on NICHE, LOW-COMPETITION keywords that find real buyers
7. Generate AT LEAST 100 diverse search keywords

Think about:
- What industries need this service?
- What job titles would buy this?
- What company types would pay for this?
- What problems does this solve? Who has those problems?

Respond in JSON:
{
  "summary": "Brief offering summary",
  "targetAudience": "Who would BUY this",
  "suggestedLeadTypes": [
    {
      "category": "Business type that would BUY",
      "keywords": ["at least 20 specific keywords for this category"],
      "description": "Why they would buy",
      "buyerProfile": "Decision maker type",
      "estimatedBudget": "$X-$Y/month"
    }
  ],
  "searchKeywords": ["MINIMUM 100 diverse, specific, niche keywords - job titles, business types, industries, company names patterns - all potential BUYERS"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at finding buyers for B2B services. You understand that if someone sells lead generation, you find businesses that NEED leads (restaurants, clinics, real estate agents), NOT other lead gen agencies. Always find the END BUYERS. Generate 100+ keywords minimum."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const analysis = JSON.parse(content) as OfferingAnalysis;
    
    // Second AI: Verify keywords are for BUYERS not competitors
    const verified = await verifyBuyerKeywords(analysis.searchKeywords, offering);
    analysis.searchKeywords = verified;

    console.log(`AI generated ${analysis.searchKeywords.length} verified keywords`);
    return analysis;
  } catch (error: any) {
    console.error("Offering analysis error:", error.message);
    return extractKeywordsFromOffering(offering);
  }
}

// Second AI verifies keywords are for BUYERS not competitors
async function verifyBuyerKeywords(keywords: string[], offering: string): Promise<string[]> {
  const openai = getOpenAI();
  if (!openai) return keywords;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You verify search keywords find BUYERS, not competitors. Remove any keywords that would find fellow agencies or competitors."
        },
        {
          role: "user",
          content: `Offering: ${offering}

Keywords to verify: ${keywords.join(', ')}

REMOVE keywords that would find:
- Other agencies offering similar services
- Competitors or fellow service providers
- Freelancers
- Generic terms that won't find buyers

KEEP keywords that find:
- Business owners who NEED this service
- Decision makers in industries that would PAY for this
- Specific niches and job titles of potential BUYERS

Return JSON: { "verified": ["keyword1", "keyword2", ...], "removed": ["bad1", "bad2"] }

Keep at least 80 keywords. Add better buyer-focused ones if needed.`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const result = JSON.parse(content);
      if (result.verified && result.verified.length > 0) {
        console.log(`Verified ${result.verified.length} keywords, removed ${result.removed?.length || 0}`);
        return result.verified;
      }
    }
  } catch (e) {
    console.error("Keyword verification failed:", e);
  }
  
  return keywords;
}

// Fallback: extract from user's offering text
function extractKeywordsFromOffering(offering: string): OfferingAnalysis {
  const words = offering.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
  
  const stopWords = ['that', 'this', 'with', 'from', 'have', 'will', 'your', 'their', 'they', 'them', 'what', 'when', 'where', 'which', 'while', 'about', 'after', 'before', 'between', 'into', 'through', 'during', 'provide', 'help', 'need', 'want', 'make', 'like', 'service', 'services', 'business', 'company', 'offer', 'offering'];
  
  const uniqueWords = new Set(words.filter(w => !stopWords.includes(w)));
  const meaningfulWords = Array.from(uniqueWords);
  
  // Create diverse keyword combinations
  const keywords: string[] = [];
  
  // Add buyer-focused variations
  const buyerSuffixes = ['owner', 'founder', 'ceo', 'director', 'manager', 'business', 'company', 'startup', 'agency'];
  
  for (const word of meaningfulWords.slice(0, 15)) {
    keywords.push(word);
    for (const suffix of buyerSuffixes.slice(0, 3)) {
      keywords.push(`${word} ${suffix}`);
    }
  }
  
  // Add industry combinations
  for (let i = 0; i < meaningfulWords.length - 1 && keywords.length < 100; i++) {
    keywords.push(`${meaningfulWords[i]} ${meaningfulWords[i + 1]}`);
  }

  return {
    summary: offering.slice(0, 150),
    targetAudience: "Business owners who need your service",
    suggestedLeadTypes: [
      {
        category: "Business Owners",
        keywords: keywords.slice(0, 20),
        description: "Decision makers who would buy your service",
        buyerProfile: "Founders, CEOs, business owners",
        estimatedBudget: "Varies by business"
      }
    ],
    searchKeywords: keywords.slice(0, 100),
  };
}
