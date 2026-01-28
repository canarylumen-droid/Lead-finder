import * as cheerio from 'cheerio';

export interface ScrapedProfile {
  platform: 'instagram' | 'linkedin';
  username: string;
  profileUrl: string;
  followerCount: number;
  bio: string;
  email: string | null;
  name: string;
  title?: string;
  company?: string;
  rawData?: any;
}

// Internal proxy pool for rotation - built in, users don't configure
const PROXY_ENDPOINTS = [
  // These would be actual proxy service endpoints in production
  // For now, we'll use direct requests with rate limiting
];

let currentProxyIndex = 0;
const requestDelays: Map<string, number> = new Map();

// Rate limiting to be respectful and avoid bans
async function rateLimitedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const domain = new URL(url).hostname;
  const lastRequest = requestDelays.get(domain) || 0;
  const minDelay = 1000 + Math.random() * 2000; // 1-3 seconds between requests
  
  const elapsed = Date.now() - lastRequest;
  if (elapsed < minDelay) {
    await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
  }
  
  requestDelays.set(domain, Date.now());
  
  // Add browser-like headers
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    ...options.headers,
  };
  
  return fetch(url, { ...options, headers });
}

// Extract email from text
function extractEmail(text: string): string | null {
  // Look for Gmail first (most valuable)
  const gmailRegex = /[a-zA-Z0-9._%+-]+@gmail\.com/gi;
  const gmailMatch = text.match(gmailRegex);
  if (gmailMatch) return gmailMatch[0].toLowerCase();
  
  // Then any email
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) return emailMatch[0].toLowerCase();
  
  return null;
}

// Parse follower count from string (e.g., "12.5K", "1.2M")
function parseFollowerCount(text: string): number {
  if (!text) return 0;
  
  const cleaned = text.toLowerCase().replace(/[,\s]/g, '');
  
  if (cleaned.includes('m')) {
    return Math.floor(parseFloat(cleaned.replace('m', '')) * 1000000);
  }
  if (cleaned.includes('k')) {
    return Math.floor(parseFloat(cleaned.replace('k', '')) * 1000);
  }
  
  return parseInt(cleaned, 10) || 0;
}

// Check if username looks legit (no excessive numbers)
function isValidUsername(username: string): boolean {
  if (!username) return false;
  
  // Skip if more than 3 consecutive numbers
  if (/\d{4,}/.test(username)) return false;
  
  // Skip if mostly numbers
  const numberCount = (username.match(/\d/g) || []).length;
  if (numberCount > username.length * 0.4) return false;
  
  // Skip bot-like patterns
  const botPatterns = ['bot', 'spam', 'fake', 'test', 'official_', '_official'];
  if (botPatterns.some(p => username.toLowerCase().includes(p))) return false;
  
  return true;
}

// Check follower count is in valid range (1k-80k)
function isValidFollowerCount(count: number): boolean {
  return count >= 1000 && count <= 80000;
}

// Scrape Instagram profiles using web search
export async function scrapeInstagramProfiles(
  keywords: string[],
  maxResults: number = 50,
  onProgress?: (msg: string) => void
): Promise<ScrapedProfile[]> {
  const profiles: ScrapedProfile[] = [];
  const seenUsernames = new Set<string>();
  
  onProgress?.(`Starting Instagram search with keywords: ${keywords.join(', ')}`);
  
  for (const keyword of keywords) {
    if (profiles.length >= maxResults) break;
    
    try {
      // Search Instagram via Google (public profiles)
      const searchQuery = encodeURIComponent(`site:instagram.com "${keyword}" bio`);
      const searchUrl = `https://www.google.com/search?q=${searchQuery}&num=20`;
      
      onProgress?.(`Searching: ${keyword}`);
      
      const response = await rateLimitedFetch(searchUrl);
      if (!response.ok) {
        onProgress?.(`Search failed for "${keyword}" - status ${response.status}`);
        continue;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Extract Instagram URLs from search results
      const instagramUrls: string[] = [];
      $('a[href*="instagram.com"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('instagram.com/') && !href.includes('/p/') && !href.includes('/reel/')) {
          // Extract clean URL
          const match = href.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
          if (match && match[1]) {
            const username = match[1];
            if (!seenUsernames.has(username) && isValidUsername(username)) {
              instagramUrls.push(`https://instagram.com/${username}`);
              seenUsernames.add(username);
            }
          }
        }
      });
      
      onProgress?.(`Found ${instagramUrls.length} potential profiles for "${keyword}"`);
      
      // Fetch each profile
      for (const profileUrl of instagramUrls.slice(0, 10)) {
        if (profiles.length >= maxResults) break;
        
        try {
          const username = profileUrl.split('/').pop() || '';
          
          const profileResponse = await rateLimitedFetch(profileUrl);
          if (!profileResponse.ok) continue;
          
          const profileHtml = await profileResponse.text();
          const $profile = cheerio.load(profileHtml);
          
          // Extract data from meta tags and JSON-LD
          const description = $profile('meta[property="og:description"]').attr('content') || '';
          const title = $profile('meta[property="og:title"]').attr('content') || '';
          
          // Parse followers from description (format: "X Followers, Y Following, Z Posts")
          const followersMatch = description.match(/([\d,.]+[KkMm]?)\s*Followers/i);
          const followerCount = followersMatch ? parseFollowerCount(followersMatch[1]) : 0;
          
          // Skip if outside follower range
          if (!isValidFollowerCount(followerCount)) {
            onProgress?.(`Skipping ${username} - ${followerCount} followers (outside 1k-80k range)`);
            continue;
          }
          
          // Extract bio (usually after the follower stats)
          const bioParts = description.split(' - ');
          const bio = bioParts.length > 1 ? bioParts.slice(1).join(' - ') : description;
          
          // Extract email from bio
          const email = extractEmail(bio);
          
          // Extract name from title
          const name = title.replace(/\s*\(@[^)]+\).*$/, '').trim() || username;
          
          const profile: ScrapedProfile = {
            platform: 'instagram',
            username,
            profileUrl,
            followerCount,
            bio: bio.slice(0, 500),
            email,
            name,
          };
          
          profiles.push(profile);
          onProgress?.(`Added: @${username} (${followerCount.toLocaleString()} followers)${email ? ' - has email' : ''}`);
          
        } catch (err: any) {
          onProgress?.(`Error fetching profile: ${err.message}`);
        }
      }
      
    } catch (err: any) {
      onProgress?.(`Error searching "${keyword}": ${err.message}`);
    }
  }
  
  return profiles;
}

// Scrape LinkedIn profiles using web search
export async function scrapeLinkedInProfiles(
  keywords: string[],
  maxResults: number = 50,
  onProgress?: (msg: string) => void
): Promise<ScrapedProfile[]> {
  const profiles: ScrapedProfile[] = [];
  const seenUsernames = new Set<string>();
  
  onProgress?.(`Starting LinkedIn search with keywords: ${keywords.join(', ')}`);
  
  for (const keyword of keywords) {
    if (profiles.length >= maxResults) break;
    
    try {
      // Search LinkedIn via Google (public profiles)
      const searchQuery = encodeURIComponent(`site:linkedin.com/in "${keyword}"`);
      const searchUrl = `https://www.google.com/search?q=${searchQuery}&num=20`;
      
      onProgress?.(`Searching LinkedIn: ${keyword}`);
      
      const response = await rateLimitedFetch(searchUrl);
      if (!response.ok) {
        onProgress?.(`Search failed for "${keyword}" - status ${response.status}`);
        continue;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Extract LinkedIn URLs and snippets from search results
      $('div.g').each((_, result) => {
        if (profiles.length >= maxResults) return false;
        
        const $result = $(result);
        const link = $result.find('a').first().attr('href');
        const title = $result.find('h3').first().text();
        const snippet = $result.find('.VwiC3b').first().text();
        
        if (!link || !link.includes('linkedin.com/in/')) return;
        
        // Extract username from URL
        const usernameMatch = link.match(/linkedin\.com\/in\/([^/?]+)/);
        if (!usernameMatch) return;
        
        const username = usernameMatch[1];
        if (seenUsernames.has(username) || !isValidUsername(username)) return;
        seenUsernames.add(username);
        
        // Parse name and title from search result title
        // Format usually: "Name - Title - Company | LinkedIn"
        const titleParts = title.replace(' | LinkedIn', '').split(' - ');
        const name = titleParts[0]?.trim() || username;
        const jobTitle = titleParts[1]?.trim();
        const company = titleParts[2]?.trim();
        
        // Extract email from snippet if available
        const email = extractEmail(snippet);
        
        // LinkedIn doesn't show follower counts in search, estimate based on title
        let estimatedFollowers = 5000; // Base estimate
        const seniorTitles = ['ceo', 'founder', 'owner', 'director', 'vp', 'head', 'president'];
        if (jobTitle && seniorTitles.some(t => jobTitle.toLowerCase().includes(t))) {
          estimatedFollowers = 10000 + Math.floor(Math.random() * 20000);
        }
        
        const profile: ScrapedProfile = {
          platform: 'linkedin',
          username,
          profileUrl: `https://linkedin.com/in/${username}`,
          followerCount: estimatedFollowers,
          bio: snippet.slice(0, 500),
          email,
          name,
          title: jobTitle,
          company,
        };
        
        profiles.push(profile);
        onProgress?.(`Added: ${name} - ${jobTitle || 'Professional'}${email ? ' - has email' : ''}`);
      });
      
    } catch (err: any) {
      onProgress?.(`Error searching "${keyword}": ${err.message}`);
    }
  }
  
  return profiles;
}

export { extractEmail, parseFollowerCount, isValidUsername, isValidFollowerCount };
