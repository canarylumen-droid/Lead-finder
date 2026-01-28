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
    // Fallback analysis without AI
    return fallbackOfferingAnalysis(offering);
  }

  try {
    const prompt = `You are a B2B sales expert. Analyze this business offering and determine who would most likely buy it.

OFFERING: ${offering}

Identify 3-5 specific types of leads who would:
1. Actually need this service/product
2. Have budget to pay for it (not freelancers, but businesses with revenue)
3. Be decision makers who can say yes

For each lead type, provide:
- Category name (e.g., "Marketing Agency Owners", "E-commerce Brand Founders")
- Search keywords to find them on Instagram/LinkedIn
- Brief description of why they'd buy
- Typical buyer profile
- Estimated budget range

Also provide overall search keywords that work across platforms.

Respond in JSON:
{
  "summary": "Brief summary of the offering",
  "targetAudience": "Who this is for",
  "suggestedLeadTypes": [
    {
      "category": "string",
      "keywords": ["keyword1", "keyword2"],
      "description": "Why they'd buy",
      "buyerProfile": "Who exactly",
      "estimatedBudget": "$X-$Y/month"
    }
  ],
  "searchKeywords": ["broad", "search", "terms"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a B2B lead generation expert. Provide actionable, specific recommendations for finding buyers."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    return JSON.parse(content) as OfferingAnalysis;
  } catch (error: any) {
    console.error("Offering analysis error:", error.message);
    return fallbackOfferingAnalysis(offering);
  }
}

function fallbackOfferingAnalysis(offering: string): OfferingAnalysis {
  const lowerOffering = offering.toLowerCase();
  
  // Extract keywords from offering
  const keywords: string[] = [];
  if (lowerOffering.includes('seo')) keywords.push('marketing agency', 'digital marketing');
  if (lowerOffering.includes('marketing')) keywords.push('agency owner', 'brand founder');
  if (lowerOffering.includes('design')) keywords.push('creative agency', 'brand designer');
  if (lowerOffering.includes('software') || lowerOffering.includes('saas')) keywords.push('startup founder', 'tech company');
  if (lowerOffering.includes('coach')) keywords.push('entrepreneur', 'business owner');
  
  if (keywords.length === 0) {
    keywords.push('business owner', 'agency founder', 'entrepreneur');
  }

  return {
    summary: offering.slice(0, 100),
    targetAudience: "Business owners and agency founders",
    suggestedLeadTypes: [
      {
        category: "Agency Owners",
        keywords: ["marketing agency", "digital agency", "creative agency"],
        description: "They need services to scale their business",
        buyerProfile: "Founders with 5-50 employees",
        estimatedBudget: "$1,000-$10,000/month"
      },
      {
        category: "E-commerce Founders",
        keywords: ["ecommerce founder", "DTC brand", "shopify store"],
        description: "They have revenue and need to grow",
        buyerProfile: "Brand owners doing $50k+/month",
        estimatedBudget: "$2,000-$15,000/month"
      }
    ],
    searchKeywords: keywords,
  };
}
