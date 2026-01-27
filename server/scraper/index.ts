import * as cheerio from 'cheerio';

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ScrapedProfile {
  platform: 'instagram' | 'linkedin';
  username: string;
  profileUrl: string;
  followerCount: number;
  bio: string;
  email: string | null;
  name?: string;
  title?: string;
  company?: string;
  companySize?: string;
}

const AGENCY_KEYWORDS = ['agency', 'marketing', 'creative', 'digital', 'consulting', 'media', 'ads', 'growth', 'branding'];
const DECISION_MAKER_TITLES = ['founder', 'ceo', 'owner', 'director', 'cmo', 'head', 'president', 'partner'];

function extractGmailFromText(text: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@gmail\.com/gi;
  const matches = text.match(emailRegex);
  return matches ? matches[0].toLowerCase() : null;
}

function extractAnyEmailFromText(text: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const matches = text.match(emailRegex);
  return matches ? matches[0].toLowerCase() : null;
}

function checkAgencyKeywords(bio: string): boolean {
  const lowerBio = bio.toLowerCase();
  return AGENCY_KEYWORDS.some(keyword => lowerBio.includes(keyword));
}

function checkDecisionMaker(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return DECISION_MAKER_TITLES.some(t => lowerTitle.includes(t));
}

function calculateRelevanceScore(profile: ScrapedProfile, offering: string): number {
  let score = 0;
  
  // Follower count scoring
  if (profile.followerCount >= 50000) score += 30;
  else if (profile.followerCount >= 20000) score += 25;
  else if (profile.followerCount >= 10000) score += 20;
  else if (profile.followerCount >= 5000) score += 15;
  
  // Agency keywords in bio
  if (profile.bio && checkAgencyKeywords(profile.bio)) score += 25;
  
  // Decision maker check
  if (profile.title && checkDecisionMaker(profile.title)) score += 20;
  
  // Has email
  if (profile.email) score += 15;
  
  // Bio mentions offering keywords
  if (profile.bio && offering) {
    const offeringKeywords = offering.toLowerCase().split(/\s+/);
    const bioLower = profile.bio.toLowerCase();
    const matchCount = offeringKeywords.filter(kw => kw.length > 3 && bioLower.includes(kw)).length;
    score += Math.min(matchCount * 5, 10);
  }
  
  return Math.min(score, 100);
}

export function qualifyLead(profile: ScrapedProfile, offering: string): { isQualified: boolean; score: number } {
  const score = calculateRelevanceScore(profile, offering);
  const isQualified = score >= 50 && profile.followerCount >= 5000 && checkAgencyKeywords(profile.bio || '');
  return { isQualified, score };
}

export async function scrapeInstagramSearch(
  query: string,
  proxyConfig?: ProxyConfig
): Promise<ScrapedProfile[]> {
  // Real Instagram scraping requires:
  // 1. Rotating proxies (to avoid IP bans)
  // 2. Headless browser with proper fingerprinting
  // 3. Session management and cookies
  
  if (!proxyConfig) {
    throw new Error('PROXY_REQUIRED: Instagram scraping requires proxy configuration. Please set PROXY_HOST, PROXY_PORT, PROXY_USERNAME, and PROXY_PASSWORD environment variables.');
  }
  
  // This would use puppeteer-core with a proxy
  // For now, throw an error indicating proxy setup is needed
  throw new Error('PROXY_NOT_CONFIGURED: Please configure your rotating proxy service to enable Instagram scraping. Set environment variables: PROXY_HOST, PROXY_PORT, PROXY_USERNAME, PROXY_PASSWORD');
}

export async function scrapeLinkedInSearch(
  query: string,
  proxyConfig?: ProxyConfig
): Promise<ScrapedProfile[]> {
  // Real LinkedIn scraping requires:
  // 1. LinkedIn Premium or Sales Navigator account
  // 2. Authenticated session cookies
  // 3. Rotating residential proxies
  // 4. Rate limiting (max ~100 requests/day)
  
  if (!proxyConfig) {
    throw new Error('PROXY_REQUIRED: LinkedIn scraping requires proxy configuration. Please set PROXY_HOST, PROXY_PORT, PROXY_USERNAME, and PROXY_PASSWORD environment variables.');
  }
  
  throw new Error('PROXY_NOT_CONFIGURED: Please configure your rotating proxy service to enable LinkedIn scraping. Set environment variables: PROXY_HOST, PROXY_PORT, PROXY_USERNAME, PROXY_PASSWORD');
}

export function getProxyConfigFromEnv(): ProxyConfig | null {
  const host = process.env.PROXY_HOST;
  const port = process.env.PROXY_PORT;
  
  if (!host || !port) {
    return null;
  }
  
  return {
    host,
    port: parseInt(port, 10),
    username: process.env.PROXY_USERNAME,
    password: process.env.PROXY_PASSWORD,
  };
}

export { extractGmailFromText, extractAnyEmailFromText, checkAgencyKeywords, checkDecisionMaker };
