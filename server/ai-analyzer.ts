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

export async function analyzeProfileWithAI(
  profile: ProfileData,
  offering: string
): Promise<AnalysisResult> {
  try {
    const genAIClient = getGemini();
    if (!genAIClient) {
      return analyzeWithoutAI(profile, offering);
    }

    const model = genAIClient.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: { 
        responseMimeType: "application/json",
        maxOutputTokens: 200
      }
    });

    const prompt = `Quick analysis - would this person BUY this service?

SERVICE: \${offering}

PROFILE:
- Name: \${profile.name || profile.username}
- Title: \${profile.title || 'Unknown'}
- Company: \${profile.company || 'Unknown'}
- Bio: \${profile.bio || 'No bio'}
- Platform: \${profile.platform}
- Followers: \${profile.followerCount}

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

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: "Fast lead qualifier. Find BUYERS not competitors. Return JSON only."
    });

    const text = result.response.text();
    const data = JSON.parse(text) as AnalysisResult;
    
    return {
      isQualified: data.isQualified ?? false,
      relevanceScore: Math.min(100, Math.max(0, data.relevanceScore ?? 0)),
      businessType: data.businessType ?? 'unknown',
      contextSummary: data.contextSummary ?? '',
      reasoning: data.reasoning ?? '',
    };
  } catch (error: any) {
    console.error("AI analysis error:", error.message);
    return analyzeWithoutAI(profile, offering);
  }
}

function analyzeWithoutAI(profile: ProfileData, offering: string): AnalysisResult {
  const bio = (profile.bio || '').toLowerCase();
  const title = (profile.title || '').toLowerCase();
  const name = profile.name || profile.username;
  
  let score = 30;
  let businessType = 'unknown';
  let isQualified = false;
  
  const offeringWords = offering.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
  
  const buyerSignals = ['owner', 'founder', 'ceo', 'president', 'director', 'head of', 'vp ', 'vice president'];
  const hasBuyerTitle = buyerSignals.some(s => title.includes(s) || bio.includes(s));
  
  if (hasBuyerTitle) {
    score += 30;
    businessType = 'buyer';
  }
  
  const competitorSignals = ['agency', 'consultant', 'freelancer', 'we help', 'i help', 'services', 'marketing agency', 'digital agency'];
  const isCompetitor = competitorSignals.some(s => bio.includes(s) || title.includes(s));
  
  if (isCompetitor) {
    score -= 40;
    businessType = 'competitor';
  }
  
  const freelancerSignals = ['freelance', 'for hire', 'available', 'dm for rates', 'open to work'];
  const isFreelancer = freelancerSignals.some(s => bio.includes(s));
  
  if (isFreelancer) {
    score -= 30;
    businessType = 'freelancer';
  }
  
  let matchCount = 0;
  for (const word of offeringWords) {
    if (bio.includes(word) || title.includes(word)) {
      matchCount++;
    }
  }
  score += matchCount * 5;
  
  if (profile.followerCount >= 10000) score += 10;
  if (profile.followerCount >= 30000) score += 10;
  
  if (profile.email) score += 15;
  
  isQualified = score >= 50 && businessType !== 'competitor' && businessType !== 'freelancer';
  
  if (isQualified && businessType === 'unknown') {
    businessType = 'buyer';
  }
  
  let context = \`\${name}\`;
  if (profile.title) context += \`, \${profile.title}\`;
  context += \`. \`;
  
  if (matchCount > 0) {
    context += \`Matches \${matchCount} industry terms.\`;
  }
  
  return {
    isQualified,
    relevanceScore: Math.min(100, Math.max(0, score)),
    businessType,
    contextSummary: context,
    reasoning: isQualified ? 'Potential buyer with decision-making role' : 'Does not match buyer criteria',
  };
}

export async function batchAnalyzeProfiles(
  profiles: ProfileData[],
  offering: string,
  concurrency: number = 10
): Promise<Map<string, AnalysisResult>> {
  const results = new Map<string, AnalysisResult>();
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

export async function extractEmailFromWebsite(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const html = await response.text();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex) || [];
    const validEmails = matches.filter(email => {
      const lower = email.toLowerCase();
      return !lower.includes('example.com') && !lower.includes('test.com') && !lower.includes('noreply');
    });
    const preferred = validEmails.find(e => e.includes('contact') || e.includes('info') || e.includes('hello'));
    return preferred || validEmails[0] || null;
  } catch {
    return null;
  }
}

export function hasAICapability(): boolean {
  return !!process.env.GEMINI_API_KEY;
}
