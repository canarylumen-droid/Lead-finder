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
1. Find BUYERS of this service, NOT fellow agencies or competitors.
2. If the offering is "lead generation" or "SEO", you MUST find businesses that NEED these services (e.g., real estate agents, dentists, roofers, local boutiques, law firms), NOT other marketing/lead gen agencies.
3. Generate niche, specific business categories that are likely to have a high budget and high need for this service.
4. For each category, generate at least 20 diverse keywords including job titles (e.g., "Real Estate Agent", "Broker", "Realtor"), business types, and industry-specific terms.
5. NEVER suggest keywords that are just variations of the offering itself (e.g., if offering is "lead gen", do not suggest "lead gen owner").
6. Focus on finding business owners/founders/CEOs of target businesses.
7. Generate AT LEAST 100 diverse search keywords in total across categories.
8. SUMMARY: Provide a deep reasoning summary of WHY these specific niches were suggested, outside of the words provided in the offering. Analyze the business value and pain points.

Think about:
- Which local or national businesses have high customer lifetime value and need more leads?
- What specific niches (e.g., "Luxury Home Realtor", "Implant Dentist") are most profitable?
- Who are the decision makers in these high-value niches?

Respond in JSON:
{
  "summary": "Detailed strategic reasoning on why these niches were chosen based on ROI potential and pain points",
  "targetAudience": "Specific high-value business niches and decision makers",
  "suggestedLeadTypes": [
    {
      "category": "Specific Niche Business (e.g., High-end Real Estate)",
      "keywords": ["specific keyword 1", "specific keyword 2", ...],
      "description": "Detailed explanation of why this specific niche needs the offering right now",
      "buyerProfile": "Decision maker title and persona",
      "estimatedBudget": "$X-$Y/month"
    }
  ],
  "searchKeywords": ["keyword1", "keyword2", ...]
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
  const buyerSuffixes = ['owner', 'founder', 'ceo', 'director', 'manager', 'president', 'managing director'];
  
  // Suggested generic niches if no AI
  const fallbackNiches = ['Real Estate', 'Dentist', 'Lawyer', 'Construction', 'E-commerce'];
  
  for (const niche of fallbackNiches) {
    for (const suffix of buyerSuffixes.slice(0, 4)) {
      keywords.push(`${niche} ${suffix}`);
    }
  }

  for (const word of meaningfulWords.slice(0, 15)) {
    for (const suffix of buyerSuffixes.slice(0, 3)) {
      keywords.push(`${word} ${suffix}`);
    }
  }
  
  // Add industry combinations
  for (let i = 0; i < meaningfulWords.length - 1 && keywords.length < 100; i++) {
    keywords.push(`${meaningfulWords[i]} ${meaningfulWords[i + 1]}`);
  }

  return {
    summary: `Based on your offering of "${offering}", we've identified several high-value business niches that typically require these services to scale. These niches often have high customer lifetime value, making them ideal candidates for your services.`,
    targetAudience: "Niche-specific business owners and decision makers (Founders, CEOs, Directors)",
    suggestedLeadTypes: [
      {
        category: "High-Value Professional Services",
        keywords: keywords.slice(0, 20),
        description: "Decision makers in professional services industries with high margins and a need for consistent lead flow.",
        buyerProfile: "Founders, CEOs, business owners",
        estimatedBudget: "$1,000-$5,000/month"
      }
    ],
    searchKeywords: keywords.slice(0, 100),
  };
}
