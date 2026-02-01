import * as cheerio from 'cheerio';
import { storage } from '../storage';
import crypto from 'crypto';

function generateDedupeHash(data: { platform: string; username: string; email: string | null }): string {
  const key = `${(data.email || '').toLowerCase()}-${data.platform}-${data.username.toLowerCase()}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const SKIP_EMAIL_PATTERNS = [
  'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'postmaster', 'admin@', 'root@', 'webmaster',
  'abuse@', 'spam@', 'support@wix', 'support@squarespace', 'support@wordpress',
  'example.com', 'test.com', 'domain.com', 'email.com', 'mail.com',
  'sentry.io', 'github.com', 'gitlab.com', 'bitbucket.org',
  'hiring', 'career', 'job', 'hr@', 'recruitment'
];

const SKIP_DOMAINS = [
  'wix.com', 'wixsite.com', 'squarespace.com', 'wordpress.com', 'wordpress.org',
  'weebly.com', 'blogger.com', 'blogspot.com', 'tumblr.com', 'medium.com',
  'godaddy.com', 'hostinger.com', 'bluehost.com', 'namecheap.com',
  'google.com', 'facebook.com', 'instagram.com', 'twitter.com',
  'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com',
  'amazon.com', 'ebay.com', 'etsy.com', 'shopify.com',
  'github.com', 'gitlab.com', 'stackoverflow.com', 'wikipedia.org',
  'sentry.io', 'cloudflare.com', 'netlify.com', 'vercel.com',
  'w3.org', 'schema.org', 'gravatar.com', 'replit.com', 'vercel.app'
];

const PRIORITY_EMAIL_PREFIXES = [
  'contact', 'info', 'hello', 'sales', 'team', 'business', 'inquiries',
  'partnerships', 'collaborate', 'booking', 'hire', 'work'
];

let userAgentIndex = 0;
const requestDelays: Map<string, number> = new Map();

function getRandomUserAgent(): string {
  userAgentIndex = (userAgentIndex + 1) % USER_AGENTS.length;
  return USER_AGENTS[userAgentIndex];
}

async function rateLimitedFetch(url: string, timeout: number = 8000): Promise<Response | null> {
  const domain = new URL(url).hostname;
  const lastRequest = requestDelays.get(domain) || 0;
  const minDelay = 300 + Math.random() * 700;
  
  const elapsed = Date.now() - lastRequest;
  if (elapsed < minDelay) {
    await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
  }
  
  requestDelays.set(domain, Date.now());
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    return null;
  }
}

function isValidBusinessEmail(email: string): boolean {
  const lower = email.toLowerCase();
  
  for (const pattern of SKIP_EMAIL_PATTERNS) {
    if (lower.includes(pattern)) return false;
  }
  
  const domain = lower.split('@')[1];
  if (!domain) return false;
  
  // Allow gmail/yahoo etc if they are likely personal business emails
  const webmailProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
  const isWebmail = webmailProviders.some(provider => domain === provider);
  
  for (const skipDomain of SKIP_DOMAINS) {
    if (domain === skipDomain || domain.endsWith('.' + skipDomain)) return false;
  }
  
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.gif')) return false;
  if (lower.includes('{') || lower.includes('}') || lower.includes('%')) return false;
  
  const localPart = lower.split('@')[0];
  if (localPart.length < 2 || localPart.length > 64) return false;
  
  // More lenient for Gmail/personal leads
  if (isWebmail) {
    if (/^\d+$/.test(localPart)) return false; // Still avoid pure number emails
    return true;
  }
  
  if (/^\d+$/.test(localPart)) return false;
  
  return true;
}

function extractNameFromEmail(email: string): string | null {
  const localPart = email.split('@')[0].toLowerCase();
  
  const genericPrefixes = ['info', 'contact', 'hello', 'sales', 'team', 'support', 'admin', 'office', 'mail', 'business'];
  if (genericPrefixes.includes(localPart)) return null;
  
  const separators = ['.', '_', '-'];
  for (const sep of separators) {
    if (localPart.includes(sep)) {
      const parts = localPart.split(sep).filter(p => p.length > 1);
      if (parts.length >= 2) {
        const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        const lastName = parts[parts.length - 1].charAt(0).toUpperCase() + parts[parts.length - 1].slice(1);
        if (!/\d/.test(firstName) && !/\d/.test(lastName)) {
          return `${firstName} ${lastName}`;
        }
      }
    }
  }
  
  if (!/\d/.test(localPart) && localPart.length > 2 && localPart.length < 20) {
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }
  
  return null;
}

function prioritizeEmails(emails: string[]): string[] {
  const scored = emails.map(email => {
    const lower = email.toLowerCase();
    const localPart = lower.split('@')[0];
    let score = 0;
    
    for (const prefix of PRIORITY_EMAIL_PREFIXES) {
      if (localPart.startsWith(prefix)) {
        score += 10;
        break;
      }
    }
    
    if (localPart.includes('.') || localPart.includes('_')) {
      score += 5;
    }
    
    if (lower.includes('gmail.com')) {
      score += 15; // Focus more on Gmail as requested
    } else if (!lower.includes('yahoo.com') && !lower.includes('hotmail.com') && !lower.includes('outlook.com')) {
      score += 8;
    }
    
    return { email, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.email);
}

function extractAllEmails(html: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const matches = html.match(emailRegex) || [];
  
  const uniqueEmails = Array.from(new Set(matches.map(e => e.toLowerCase())));
  const validEmails = uniqueEmails.filter(isValidBusinessEmail);
  
  return prioritizeEmails(validEmails);
}

function extractContactInfo(html: string, $: cheerio.CheerioAPI): { name: string | null; title: string | null; company: string | null } {
  let name: string | null = null;
  let title: string | null = null;
  let company: string | null = null;
  
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  const titleTag = $('title').text();
  
  company = ogSiteName || titleTag?.split(/[-|–]/)[0]?.trim() || null;
  if (company && company.length > 100) company = company.substring(0, 100);
  
  const teamSelectors = [
    '.team-member', '.about-author', '.author', '.founder', '.ceo',
    '[class*="team"]', '[class*="about"]', '[id*="team"]', '[id*="about"]'
  ];
  
  for (const selector of teamSelectors) {
    const element = $(selector).first();
    if (element.length) {
      const text = element.text().trim();
      const nameMatch = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
      if (nameMatch) {
        name = nameMatch[1];
        break;
      }
    }
  }
  
  const titlePatterns = ['CEO', 'Founder', 'Owner', 'Director', 'President', 'Managing Director'];
  for (const pattern of titlePatterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(html)) {
      title = pattern;
      break;
    }
  }
  
  return { name, title, company };
}

async function scrapeWebsite(url: string): Promise<{
  emails: string[];
  name: string | null;
  title: string | null;
  company: string | null;
  bio: string;
} | null> {
  try {
    const response = await rateLimitedFetch(url);
    if (!response || !response.ok) return null;
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const emails = extractAllEmails(html);
    const contactInfo = extractContactInfo(html, $);
    
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const bio = metaDesc || ogDesc || $('p').first().text().trim().substring(0, 500);
    
    const contactPages = ['/contact', '/about', '/team', '/contact-us', '/about-us'];
    
    if (emails.length === 0) {
      for (const page of contactPages) {
        try {
          const baseUrl = new URL(url);
          const contactUrl = `${baseUrl.protocol}//${baseUrl.hostname}${page}`;
          const contactResponse = await rateLimitedFetch(contactUrl);
          if (contactResponse && contactResponse.ok) {
            const contactHtml = await contactResponse.text();
            const contactEmails = extractAllEmails(contactHtml);
            if (contactEmails.length > 0) {
              emails.push(...contactEmails);
              break;
            }
          }
        } catch {
          continue;
        }
      }
    }
    
    return {
      emails: Array.from(new Set(emails)),
      ...contactInfo,
      bio
    };
  } catch (error: any) {
    return null;
  }
}

async function googleSearch(query: string): Promise<string[]> {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=30`;
  
  try {
    const response = await rateLimitedFetch(searchUrl, 15000);
    if (!response || !response.ok) {
      console.log(`Google search failed with status: ${response?.status}. Fallback to simulated result.`);
      // Simulated results for demonstration when rate limited
      return [];
    }
    
    const html = await response.text();
    return parseGoogleHtml(html);
  } catch (error: any) {
    console.error('Google search error:', error.message);
    return [];
  }
}

function parseGoogleHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    
    // Google search redirect pattern
    const urlMatch = href.match(/\/url\?q=([^&]+)/);
    if (urlMatch) {
      try {
        const decodedUrl = decodeURIComponent(urlMatch[1]);
        if (decodedUrl.startsWith('http') && !decodedUrl.includes('google.com')) {
          urls.push(decodedUrl);
        }
      } catch {}
    }
    
    // Direct link pattern (sometimes present)
    if (href.startsWith('http') && !href.includes('google.com')) {
      urls.push(href);
    }
  });
  
  // Also look for cite tags which often contain clean hostnames
  const hostnames = $('cite').map((_, el) => $(el).text()).get();
  for (const hostname of hostnames) {
    if (hostname && !hostname.includes('google')) {
      const cleanHostname = hostname.split(' ')[0].replace(/^(https?:\/\/)?/, '').trim();
      if (cleanHostname && !cleanHostname.includes(' ')) {
        urls.push(`https://${cleanHostname}`);
      }
    }
  }
  
  return Array.from(new Set(urls)).slice(0, 20);
}

function buildGoogleQueries(keywords: string[]): string[] {
  const queries: string[] = [];
  
  // Use more keywords to cast a wider net
  for (const keyword of keywords.slice(0, 20)) {
    queries.push(`"${keyword}" "@gmail.com" -site:linkedin.com -site:facebook.com`);
    queries.push(`"${keyword}" "contact" "email" site:.com`);
    queries.push(`"${keyword}" owner OR founder OR CEO "@gmail.com"`);
    queries.push(`"${keyword}" "about us" "@gmail.com"`);
  }
  
  return queries;
}

export async function scrapeLeadsVercel(
  jobId: number,
  keywords: string[],
  quantity: number,
  offering: string
): Promise<void> {
  try {
    await storage.startScrapeJob(jobId);
    await storage.addJobLog({
      jobId,
      level: 'info',
      message: `Starting Vercel-compatible scrape with ${keywords.length} keywords, target: ${quantity} leads`
    });
    
    const queries = buildGoogleQueries(keywords);
    const allUrls = new Set<string>();
    let processedUrls = 0;
    let savedLeads = 0;
    
    for (const query of queries) {
      if (savedLeads >= quantity) break;
      
      await storage.addJobLog({
        jobId,
        level: 'info',
        message: `Searching: ${query.substring(0, 60)}...`
      });
      
      const urls = await googleSearch(query);
      urls.forEach(url => allUrls.add(url));
      
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }
    
    await storage.addJobLog({
      jobId,
      level: 'info',
      message: `Found ${allUrls.size} unique URLs to scrape`
    });
    
    for (const url of Array.from(allUrls)) {
      if (savedLeads >= quantity) break;
      
      processedUrls++;
      
      try {
        const hostname = new URL(url).hostname;
        let skipUrl = false;
        for (const skipDomain of SKIP_DOMAINS) {
          if (hostname.includes(skipDomain)) {
            skipUrl = true;
            break;
          }
        }
        if (skipUrl) continue;
        
        const result = await scrapeWebsite(url);
        if (!result || result.emails.length === 0) continue;
        
        for (const email of result.emails.slice(0, 3)) {
          if (savedLeads >= quantity) break;
          
          const emailName = extractNameFromEmail(email);
          const name = emailName || result.name || null;
          
          const dedupeHash = generateDedupeHash({
            platform: 'website',
            username: email.split('@')[0],
            email
          });
          
          const lead = await storage.createLead({
            platform: 'website',
            username: email.split('@')[0],
            name,
            title: result.title,
            company: result.company,
            profileUrl: url,
            bio: result.bio,
            email,
            queryUsed: keywords.join(', '),
            jobId,
            dedupeHash,
            followerCount: 0,
          });
          
          if (lead) {
            savedLeads++;
            await storage.addJobLog({
              jobId,
              level: 'success',
              message: `Found: ${email}${name ? ` (${name})` : ''} from ${hostname}`
            });
            
            await storage.updateScrapeJobProgress(jobId, {
              processedCount: processedUrls,
              qualifiedCount: savedLeads
            });
          }
        }
        
      } catch (error: any) {
        continue;
      }
      
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
    }
    
    await storage.completeScrapeJob(jobId);
    await storage.addJobLog({
      jobId,
      level: 'success',
      message: `Scraping completed! Found ${savedLeads} leads from ${processedUrls} websites`
    });
    
  } catch (error: any) {
    console.error('Scraping error:', error);
    await storage.updateScrapeJobStatus(jobId, 'failed', error.message);
    await storage.addJobLog({
      jobId,
      level: 'error',
      message: `Scraping failed: ${error.message}`
    });
  }
}
