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
    const prompt = `You are a B2B lead generation expert. Analyze the provided business offering and identify 5-10 distinct, high-value business niches that would be the IDEAL BUYERS for this service.

OFFERING: ${offering}

CRITICAL RULES:
1. Identify 5-10 specific business niches (e.g., "HVAC Companies", "Luxury Real Estate Agencies", "Dental Practices") that have a high ROI potential for this specific offering.
2. DO NOT suggest competitors or similar service providers (e.g., if the offering is 'Lead Generation', do not suggest 'Marketing Agencies').
3. For each niche, provide a deep strategic reasoning (2-3 sentences) explaining WHY they are a perfect fit, focusing on their industry-specific pain points and how this offering solves them.
4. Focus on niches that are currently underserved or have high growth potential.
5. Provide a concise summary of the overall market strategy.

Respond in JSON format:
{
  "summary": "High-level overview of the target market strategy and unique value proposition alignment",
  "targetAudience": "Summary of the ideal decision makers (titles and personas)",
  "suggestedLeadTypes": [
    {
      "category": "Niche Name",
      "description": "Deep reasoning on ROI, specific pain points, and alignment with the offering",
      "buyerProfile": "Specific decision maker persona (e.g., Founder, Owner, Operations Manager)",
      "estimatedBudget": "$X-$Y/month (realistic range for this niche)",
      "keywords": []
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Expert business analyst. Identify profitable niches for services. No competitors. Deep reasoning only."
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
    return extractKeywordsFromOffering(offering);
  }
}

export async function generateKeywordsForNiche(offering: string, niche: string): Promise<string[]> {
  const openai = getOpenAI();
  if (!openai) return [niche];

  try {
    const prompt = `Generate 20 highly specific search keywords for finding decision makers (Owners, Founders, CEOs, Partners, Principal) in the "${niche}" niche who would be interested in "${offering}".

RULES:
1. Combine the niche with decision maker titles (e.g., "${niche} Founder", "${niche} CEO").
2. Focus on intent-rich keywords that a decision maker would use or be associated with.
3. DO NOT include generic terms or terms related to your own competitors.
4. Include geographic variations if applicable (e.g., "${niche} in Miami").
5. Return exactly 20 keywords that maximize the chance of finding a high-value lead.

Respond in JSON: { "keywords": ["keyword1", "keyword2", ...] }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const result = JSON.parse(content);
      return result.keywords || [];
    }
  } catch (e) {
    console.error("Keyword generation failed:", e);
  }
  return [niche];
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
