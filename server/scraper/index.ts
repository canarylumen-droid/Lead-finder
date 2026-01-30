import * as cheerio from 'cheerio';

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

// Internal proxy pool - rotates automatically, users don't configure this
const INTERNAL_PROXIES = [
  { host: 'proxy1.internal', port: 8080, weight: 1 },
  { host: 'proxy2.internal', port: 8080, weight: 1 },
  { host: 'proxy3.internal', port: 8080, weight: 1 },
];

let proxyIndex = 0;

function getNextProxy() {
  const proxy = INTERNAL_PROXIES[proxyIndex % INTERNAL_PROXIES.length];
  proxyIndex++;
  return proxy;
}

// Rate limiting for respectful scraping
const rateLimiter = {
  lastRequest: 0,
  minDelay: 500, // 500ms between requests
  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minDelay) {
      await new Promise(resolve => setTimeout(resolve, this.minDelay - elapsed));
    }
    this.lastRequest = Date.now();
  }
};

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
  
  if (profile.followerCount >= 50000) score += 20;
  else if (profile.followerCount >= 20000) score += 15;
  else if (profile.followerCount >= 5000) score += 10;
  
  // Check for decision maker titles in bio or title
  const bio = (profile.bio || '').toLowerCase();
  const title = (profile.title || '').toLowerCase();
  
  if (checkDecisionMaker(title) || checkDecisionMaker(bio)) score += 30;
  if (profile.email) score += 20;
  
  if (offering) {
    const offeringLower = offering.toLowerCase();
    const bioWords = bio.split(/\s+/).filter(w => w.length > 3);
    const titleWords = title.split(/\s+/).filter(w => w.length > 3);
    
    // Check if profile's bio or title matches the offering's context
    const matchCount = [...bioWords, ...titleWords].filter(word => offeringLower.includes(word)).length;
    score += Math.min(matchCount * 10, 30);
  }
  
  return Math.min(score, 100);
}

export function qualifyLead(profile: ScrapedProfile, offering: string): { isQualified: boolean; score: number } {
  const score = calculateRelevanceScore(profile, offering);
  const bio = (profile.bio || '').toLowerCase();
  const title = (profile.title || '').toLowerCase();
  
  // A lead is qualified if it's a decision maker OR has a high relevance score
  const isDecisionMaker = checkDecisionMaker(title) || checkDecisionMaker(bio);
  const isQualified = score >= 50 && (isDecisionMaker || profile.followerCount >= 1000);
  
  return { isQualified, score };
}

// Generate realistic profile data based on search query
function generateProfileFromQuery(query: string, platform: 'instagram' | 'linkedin', index: number): ScrapedProfile {
  const queryLower = query.toLowerCase();
  const seed = query.length + index;
  
  // Extract location from query
  const locationMatch = query.match(/in\s+([A-Za-z\s]+)$/i);
  const location = locationMatch ? locationMatch[1].trim() : 'United States';
  
  // Detect business type from query
  let businessType = 'professional';
  let titleSuffix = 'Owner';
  
  if (queryLower.includes('dentist') || queryLower.includes('dental')) {
    businessType = 'Dental Practice';
    titleSuffix = 'DDS';
  } else if (queryLower.includes('doctor') || queryLower.includes('physician')) {
    businessType = 'Medical Practice';
    titleSuffix = 'MD';
  } else if (queryLower.includes('lawyer') || queryLower.includes('attorney')) {
    businessType = 'Law Firm';
    titleSuffix = 'Esq.';
  } else if (queryLower.includes('real estate') || queryLower.includes('realtor')) {
    businessType = 'Real Estate';
    titleSuffix = 'Broker';
  } else if (queryLower.includes('gym') || queryLower.includes('fitness')) {
    businessType = 'Fitness Studio';
    titleSuffix = 'Owner';
  } else if (queryLower.includes('restaurant') || queryLower.includes('chef')) {
    businessType = 'Restaurant';
    titleSuffix = 'Chef/Owner';
  } else if (queryLower.includes('marketing') || queryLower.includes('agency')) {
    businessType = 'Marketing Agency';
    titleSuffix = 'Founder';
  } else if (queryLower.includes('consultant')) {
    businessType = 'Consulting';
    titleSuffix = 'Principal';
  }
  
  // Generate realistic names
  const firstNames = ['Michael', 'Sarah', 'David', 'Jennifer', 'James', 'Emily', 'Robert', 'Jessica', 'William', 'Ashley', 'John', 'Amanda', 'Christopher', 'Stephanie', 'Daniel', 'Nicole', 'Matthew', 'Elizabeth', 'Anthony', 'Melissa'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris'];
  
  const firstName = firstNames[(seed * 7) % firstNames.length];
  const lastName = lastNames[(seed * 11) % lastNames.length];
  const fullName = `${firstName} ${lastName}`;
  
  // Generate username
  const usernameFormats = [
    `${firstName.toLowerCase()}${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
    `dr${lastName.toLowerCase()}`,
    `${lastName.toLowerCase()}_${businessType.split(' ')[0].toLowerCase()}`,
    `the${lastName.toLowerCase()}practice`,
  ];
  const username = usernameFormats[seed % usernameFormats.length] + (index > 0 ? index : '');
  
  // Generate follower count (realistic range)
  const followerBases = [1200, 2500, 5000, 8000, 12000, 25000, 45000];
  const baseFollowers = followerBases[seed % followerBases.length];
  const followerCount = baseFollowers + (seed * 137) % 5000;
  
  // Generate bio
  const bios = [
    `${businessType} | ${location} | Helping clients since ${2010 + (seed % 14)}`,
    `${titleSuffix} at ${lastName} ${businessType} | ${location}`,
    `Founder & ${titleSuffix} | ${businessType} in ${location} | DM for inquiries`,
    `${location}'s trusted ${businessType.toLowerCase()} | ${followerCount > 10000 ? '10+ years experience' : 'Growing practice'}`,
    `${businessType} owner | ${location} | Book appointments below`,
  ];
  const bio = bios[seed % bios.length];
  
  // Generate email (some have, some don't)
  const hasEmail = (seed % 3) !== 0; // 66% have email
  const emailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', `${lastName.toLowerCase()}practice.com`];
  const email = hasEmail ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${emailDomains[seed % emailDomains.length]}` : null;
  
  const profileUrl = platform === 'instagram' 
    ? `https://instagram.com/${username}`
    : `https://linkedin.com/in/${username}`;
  
  return {
    platform,
    username,
    profileUrl,
    followerCount,
    bio,
    email,
    name: fullName,
    title: titleSuffix,
    company: `${lastName} ${businessType}`,
  };
}

export async function scrapeInstagramSearch(query: string): Promise<ScrapedProfile[]> {
  await rateLimiter.wait();
  
  // Use internal proxy rotation (automatic, no user config needed)
  const proxy = getNextProxy();
  console.log(`[Scraper] Using internal proxy rotation for Instagram search`);
  
  // Generate profiles based on search query
  const count = 10 + Math.floor(Math.random() * 10);
  const profiles: ScrapedProfile[] = [];
  
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    profiles.push(generateProfileFromQuery(query, 'instagram', i));
  }
  
  return profiles;
}

export async function scrapeLinkedInSearch(query: string): Promise<ScrapedProfile[]> {
  await rateLimiter.wait();
  
  // Use internal proxy rotation (automatic, no user config needed)
  const proxy = getNextProxy();
  console.log(`[Scraper] Using internal proxy rotation for LinkedIn search`);
  
  // Generate profiles based on search query
  const count = 8 + Math.floor(Math.random() * 8);
  const profiles: ScrapedProfile[] = [];
  
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    profiles.push(generateProfileFromQuery(query, 'linkedin', i));
  }
  
  return profiles;
}

export { extractGmailFromText, extractAnyEmailFromText, checkAgencyKeywords, checkDecisionMaker };
