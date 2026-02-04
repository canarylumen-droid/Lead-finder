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

import { GeminiClient } from "./gemini-client";

export async function analyzeOffering(offering: string): Promise<OfferingAnalysis> {
  // Try Gemini First
  const gemini = GeminiClient.getInstance();
  if (gemini) {
    console.log("Using Gemini for Offering Analysis...");
    try {
      const prompt = `You are a B2B sales expert. Analyze this business offering and determine who would most likely buy it.

OFFERING: ${offering}

Identify 3-5 specific types of leads who would:
1. Actually need this service/product
2. Have budget to pay for it (not freelancers, but businesses with revenue)
3. Be decision makers who can say yes

For each lead type, provide:
- Category name (e.g., "Marketing Agency Owners", "E-commerce Brand Founders")
- Search keywords to find them on Instagram/LinkedIn (specific, low competition)
- Brief description of why they'd buy
- Typical buyer profile
- Estimated budget range

IMPORTANT: Keywords must be SPECIFIC to this exact offering. No generic terms.
Find niche keywords with low competition that match this exact business.

Respond in JSON only with: { summary, targetAudience, suggestedLeadTypes: [{category, keywords[], description, buyerProfile, estimatedBudget}], searchKeywords[] }`;

      const analysis = await gemini.generateJSON<OfferingAnalysis>(prompt);

      // Verify keywords with Second Gemini Call
      const verified = await verifyKeywords(analysis.searchKeywords, offering);
      analysis.searchKeywords = verified;

      return analysis;
    } catch (e) {
      console.error("Gemini Analysis Failed:", e);
    }
  }

  const openai = getOpenAI();
  if (!openai) {
    // No AI available - extract keywords directly from user input
    return extractKeywordsFromOffering(offering);
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
- Search keywords to find them on Instagram/LinkedIn (specific, low competition)
- Brief description of why they'd buy
- Typical buyer profile
- Estimated budget range

IMPORTANT: Keywords must be SPECIFIC to this exact offering. No generic terms.
Find niche keywords with low competition that match this exact business.

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
  "searchKeywords": ["specific", "niche", "terms"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a B2B lead generation expert. Provide specific, niche keywords - never generic. Focus on low competition, high intent buyers."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from AI");

    const analysis = JSON.parse(content) as OfferingAnalysis;

    // Verify keywords with second AI call
    const verified = await verifyKeywords(analysis.searchKeywords, offering);
    analysis.searchKeywords = verified;

    return analysis;
  } catch (error: any) {
    console.error("Offering analysis error:", error.message);
    return extractKeywordsFromOffering(offering);
  }
}

// Second AI agent verifies the keywords are good fit
async function verifyKeywords(keywords: string[], offering: string): Promise<string[]> {
  const gemini = GeminiClient.getInstance();
  if (gemini) {
    try {
      const prompt = `Offering: ${offering}\n\nProposed keywords: ${keywords.join(', ')}\n\nVerify these keywords are:\n1. Specific to this exact offering (not generic)\n2. Low competition\n3. Will find real buyers\n\nReturn JSON: { "verified": ["keyword1", "keyword2"] }\n\nRemove any generic keywords. Add better ones if needed.`;
      const result = await gemini.generateJSON<{ verified: string[] }>(prompt);
      if (result.verified && result.verified.length > 0) return result.verified;
    } catch (e) { }
  }

  const openai = getOpenAI();
  if (!openai) return keywords;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You verify search keywords for lead generation. Return only keywords that are specific, low competition, and match the offering exactly."
        },
        {
          role: "user",
          content: `Offering: ${offering}\n\nProposed keywords: ${keywords.join(', ')}\n\nVerify these keywords are:\n1. Specific to this exact offering (not generic)\n2. Low competition\n3. Will find real buyers\n\nReturn JSON: { "verified": ["keyword1", "keyword2"] }\n\nRemove any generic keywords. Add better ones if needed.`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const result = JSON.parse(content);
      if (result.verified && result.verified.length > 0) {
        return result.verified;
      }
    }
  } catch (e) {
    console.error("Keyword verification failed:", e);
  }

  return keywords;
}

// Extract keywords directly from user's offering text - no hardcoded values
function extractKeywordsFromOffering(offering: string): OfferingAnalysis {
  // Split offering into meaningful words
  const words = offering.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  // Remove common stop words
  const stopWords = ['that', 'this', 'with', 'from', 'have', 'will', 'your', 'their', 'they', 'them', 'what', 'when', 'where', 'which', 'while', 'about', 'after', 'before', 'between', 'into', 'through', 'during', 'above', 'below', 'more', 'most', 'other', 'some', 'such', 'only', 'same', 'than', 'very', 'just', 'also', 'provide', 'help', 'need', 'want', 'make', 'like', 'service', 'services'];

  const meaningfulWords = words.filter(w => !stopWords.includes(w));

  // Create keyword combinations from the user's actual text
  const keywords: string[] = [];

  // Take pairs of meaningful words
  for (let i = 0; i < meaningfulWords.length - 1 && keywords.length < 6; i++) {
    const pair = `${meaningfulWords[i]} ${meaningfulWords[i + 1]}`;
    if (!keywords.includes(pair)) {
      keywords.push(pair);
    }
  }

  // Add single meaningful words if we don't have enough
  for (const word of meaningfulWords.slice(0, 4)) {
    if (!keywords.some(k => k.includes(word))) {
      keywords.push(word);
    }
  }

  return {
    summary: offering.slice(0, 150),
    targetAudience: "Extracted from your offering description",
    suggestedLeadTypes: [
      {
        category: "Based on your offering",
        keywords: keywords.slice(0, 4),
        description: "Leads matching your specific offering",
        buyerProfile: "Decision makers in this space",
        estimatedBudget: "Varies"
      }
    ],
    searchKeywords: keywords,
  };
}
