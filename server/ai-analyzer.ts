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

interface ProfileData {
  platform: string;
  username: string;
  bio: string;
  name?: string;
  title?: string;
  company?: string;
  followerCount: number;
  email: string | null;
}

interface AnalysisResult {
  isQualified: boolean;
  relevanceScore: number;
  businessType: string;
  contextSummary: string;
  reasoning: string;
}

// Fast parallel AI analysis
export async function analyzeProfileWithAI(
  profile: ProfileData,
  offering: string
): Promise<AnalysisResult> {
  try {
    const openai = getOpenAI();
    if (!openai) {
      return analyzeWithoutAI(profile, offering);
    }

    // Use fast model for quick analysis
    const prompt = `Quick analysis - would this person BUY this service?

SERVICE: ${offering}

PROFILE:
- Name: ${profile.name || profile.username}
- Title: ${profile.title || 'Unknown'}
- Company: ${profile.company || 'Unknown'}
- Bio: ${profile.bio || 'No bio'}
- Platform: ${profile.platform}
- Followers: ${profile.followerCount}

RULES:
1. Is this a BUYER (business owner who needs this service)?
2. NOT a competitor or fellow agency
3. NOT a freelancer
4. NOT someone offering similar services
5. Has budget (business owner, founder, CEO, director)

Quick JSON response:
{
  "isQualified": boolean,
  "relevanceScore": 0-100,
  "businessType": "buyer|competitor|freelancer|employee|unknown",
  "contextSummary": "One sentence: who they are and why they match/don't",
  "reasoning": "Brief reason"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Fast lead qualifier. Find BUYERS not competitors. Return JSON only."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No AI response");

    const result = JSON.parse(content) as AnalysisResult;
    
    return {
      isQualified: result.isQualified ?? false,
      relevanceScore: Math.min(100, Math.max(0, result.relevanceScore ?? 0)),
      businessType: result.businessType ?? 'unknown',
      contextSummary: result.contextSummary ?? '',
      reasoning: result.reasoning ?? '',
    };
  } catch (error: any) {
    console.error("AI analysis error:", error.message);
    return analyzeWithoutAI(profile, offering);
  }
}

// Fast non-AI analysis based on profile data
function analyzeWithoutAI(profile: ProfileData, offering: string): AnalysisResult {
  const bio = (profile.bio || '').toLowerCase();
  const title = (profile.title || '').toLowerCase();
  const name = profile.name || profile.username;
  
  let score = 30; // Base score
  let businessType = 'unknown';
  let isQualified = false;
  
  // Extract key words from offering to match
  const offeringWords = offering.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
  
  // Check for buyer signals
  const buyerSignals = ['owner', 'founder', 'ceo', 'president', 'director', 'head of', 'vp ', 'vice president'];
  const hasBuyerTitle = buyerSignals.some(s => title.includes(s) || bio.includes(s));
  
  if (hasBuyerTitle) {
    score += 30;
    businessType = 'buyer';
  }
  
  // Check for competitor signals (they offer similar services)
  const competitorSignals = ['agency', 'consultant', 'freelancer', 'we help', 'i help', 'services', 'marketing agency', 'digital agency'];
  const isCompetitor = competitorSignals.some(s => bio.includes(s) || title.includes(s));
  
  if (isCompetitor) {
    score -= 40;
    businessType = 'competitor';
  }
  
  // Check for freelancer signals
  const freelancerSignals = ['freelance', 'for hire', 'available', 'dm for rates', 'open to work'];
  const isFreelancer = freelancerSignals.some(s => bio.includes(s));
  
  if (isFreelancer) {
    score -= 30;
    businessType = 'freelancer';
  }
  
  // Check if bio mentions relevant industry (potential buyer)
  let matchCount = 0;
  for (const word of offeringWords) {
    if (bio.includes(word) || title.includes(word)) {
      matchCount++;
    }
  }
  score += matchCount * 5;
  
  // Follower bonus
  if (profile.followerCount >= 10000) score += 10;
  if (profile.followerCount >= 30000) score += 10;
  
  // Email bonus
  if (profile.email) score += 15;
  
  // Final qualification
  isQualified = score >= 50 && businessType !== 'competitor' && businessType !== 'freelancer';
  
  if (isQualified && businessType === 'unknown') {
    businessType = 'buyer';
  }
  
  let context = `${name}`;
  if (profile.title) context += `, ${profile.title}`;
  context += `. `;
  
  if (matchCount > 0) {
    context += `Matches ${matchCount} industry terms.`;
  }
  
  return {
    isQualified,
    relevanceScore: Math.min(100, Math.max(0, score)),
    businessType,
    contextSummary: context,
    reasoning: isQualified ? 'Potential buyer with decision-making role' : 'Does not match buyer criteria',
  };
}

// Batch analyze multiple profiles in parallel (fast)
export async function batchAnalyzeProfiles(
  profiles: ProfileData[],
  offering: string,
  concurrency: number = 10
): Promise<Map<string, AnalysisResult>> {
  const results = new Map<string, AnalysisResult>();
  
  // Process in parallel batches
  const batches: ProfileData[][] = [];
  for (let i = 0; i < profiles.length; i += concurrency) {
    batches.push(profiles.slice(i, i + concurrency));
  }
  
  for (const batch of batches) {
    const promises = batch.map(async (profile) => {
      const result = await analyzeProfileWithAI(profile, offering);
      results.set(profile.username, result);
    });
    
    await Promise.all(promises);
  }
  
  return results;
}
