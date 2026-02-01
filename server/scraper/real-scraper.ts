
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import vanillaPuppeteer from 'puppeteer-core';
import path from 'path';

const puppeteer = addExtra(vanillaPuppeteer);
puppeteer.use(StealthPlugin());

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

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export function extractEmail(text: string): string | null {
  if (!text) return null;
  const gmailRegex = /[a-zA-Z0-9._%+-]+@gmail\.com/gi;
  const gmailMatch = text.match(gmailRegex);
  if (gmailMatch) return gmailMatch[0].toLowerCase();

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) return emailMatch[0].toLowerCase();

  return null;
}

export function parseFollowerCount(text: string): number {
  if (!text) return 0;
  const cleaned = text.toLowerCase().replace(/[,\s]/g, '');
  if (cleaned.includes('m')) return Math.floor(parseFloat(cleaned.replace('m', '')) * 1000000);
  if (cleaned.includes('k')) return Math.floor(parseFloat(cleaned.replace('k', '')) * 1000);
  return parseInt(cleaned, 10) || 0;
}

export function isValidUsername(username: string): boolean {
  if (!username) return false;
  if (/\d{4,}/.test(username)) return false;
  const numberCount = (username.match(/\d/g) || []).length;
  if (numberCount > username.length * 0.5) return false;
  const botPatterns = ['bot', 'spam', 'fake', 'test', 'official_', '_official'];
  if (botPatterns.some(p => username.toLowerCase().includes(p))) return false;
  return true;
}

export function isValidFollowerCount(count: number): boolean {
  return count >= 100 && count <= 500000;
}

// Scrape Instagram profiles using web search
export async function scrapeInstagramProfiles(
  keywords: string[],
  maxResults: number = 50,
  onProgress?: (msg: string) => void
): Promise<ScrapedProfile[]> {
  const profiles: ScrapedProfile[] = [];
  const seenUsernames = new Set<string>();

  let browser;

  onProgress?.(`Starting Instagram search (Yahoo+Stealth) for ${maxResults} leads...`);

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      defaultViewport: { width: 1366, height: 768 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const page = await browser.newPage();

    for (const keyword of keywords) {
      if (profiles.length >= maxResults) break;

      try {
        // Simplify query to avoid fuzzy matching on generic terms like 'followers'
        // Yahoo prefers: "keyword" site:instagram.com
        const searchQuery = encodeURIComponent(`"${keyword}" site:instagram.com`);
        const searchUrl = `https://search.yahoo.com/search?p=${searchQuery}&n=50`;  // Fetch 50 results

        onProgress?.(`Searching Yahoo: ${keyword}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
          await page.waitForSelector('h3 a', { timeout: 5000 });
        } catch (e) { }

        const instagramUrls = await page.evaluate(() => {
          const links: string[] = [];
          // Specific Yahoo selectors for organic results
          document.querySelectorAll('div.algo h3 a').forEach(el => {
            const href = el.getAttribute('href');
            if (href && href.includes('instagram.com/') && !href.includes('/p/') && !href.includes('/reel/')) {
              links.push(href);
            }
          });

          if (links.length === 0) {
            // Try fallback selector for mobile view or different layout
            document.querySelectorAll('a').forEach(el => {
              const href = el.getAttribute('href');
              if (href && href.includes('instagram.com/') && !href.includes('/p/') && !href.includes('yahoo.com')) {
                links.push(href);
              }
            });
          }

          return links;
        });

        if (instagramUrls.length === 0) {
          const safeKw = keyword.replace(/[\s\W]+/g, '-');
          await page.screenshot({ path: path.join(process.cwd(), `debug-yahoo-nores-${safeKw}.png`) });
          onProgress?.(`No results found for "${keyword}" (saved screenshot)`);
          continue;
        }

        onProgress?.(`Found ${instagramUrls.length} potential profiles for "${keyword}"`);

        // Process profiles
        for (const profileUrl of instagramUrls) {
          if (profiles.length >= maxResults) break;

          const usernameMatch = profileUrl.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
          if (!usernameMatch) continue;
          const username = usernameMatch[1];
          if (seenUsernames.has(username) || !isValidUsername(username)) continue;
          seenUsernames.add(username);

          onProgress?.(`Fetching: ${profileUrl}`);
          try {
            await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Extract Meta
            const data = await page.evaluate(() => {
              const desc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
                document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
              const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                document.title || '';
              return { desc, title };
            });

            const bioParts = data.desc.split(' - ');
            const bio = bioParts.length > 1 ? bioParts.slice(1).join(' - ') : data.desc;
            const email = extractEmail(bio) || extractEmail(data.title);
            const name = data.title.split('(@')[0].trim() || username;
            const followersMatch = data.desc.match(/([\d,.]+[KkMm]?)\s*Followers/i);
            const followerCount = followersMatch ? parseFollowerCount(followersMatch[1]) : 0;

            const profile: ScrapedProfile = {
              platform: 'instagram',
              username,
              profileUrl,
              followerCount,
              bio: bio.slice(0, 500),
              email,
              name
            };
            profiles.push(profile);
            onProgress?.(`Added: ${username} (${followerCount})`);
            await new Promise(r => setTimeout(r, 1500));

          } catch (err: any) {
            // Ignore
          }
        }

      } catch (err: any) {
        onProgress?.(`Error: ${err.message}`);
      }
    }

  } catch (e: any) {
    console.error(e);
    onProgress?.(`Browser error: ${e.message}`);
  } finally {
    if (browser) await browser.close();
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

  let browser;

  onProgress?.(`Starting LinkedIn search (Yahoo+Stealth) for ${maxResults} leads...`);

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      defaultViewport: { width: 1366, height: 768 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const page = await browser.newPage();

    for (const keyword of keywords) {
      if (profiles.length >= maxResults) break;

      try {
        const searchQuery = encodeURIComponent(`site:linkedin.com/in "${keyword}"`);
        const searchUrl = `https://search.yahoo.com/search?p=${searchQuery}&n=50`;

        onProgress?.(`Searching Yahoo (LinkedIn): ${keyword}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
          await page.waitForSelector('h3 a', { timeout: 5000 });
        } catch (e) { }

        const results = await page.evaluate(() => {
          const items: any[] = [];
          document.querySelectorAll('div.algo').forEach((el: any) => {
            const link = el.querySelector('h3 a');
            const snippet = el.querySelector('.compText') || el.querySelector('p');
            if (link && link.href && link.href.includes('linkedin.com/in/')) {
              items.push({
                href: link.href,
                title: link.innerText,
                snippet: snippet ? snippet.innerText : ''
              });
            }
          });
          if (items.length === 0) {
            // Fallback
            document.querySelectorAll('a').forEach((a: any) => {
              if (a.href && a.href.includes('linkedin.com/in/') && !a.href.includes('yahoo.com')) {
                items.push({ href: a.href, title: a.innerText, snippet: a.innerText });
              }
            })
          }
          return items;
        });

        onProgress?.(`Found ${results.length} LinkedIn results for "${keyword}"`);

        for (const item of results) {
          if (profiles.length >= maxResults) break;

          const usernameMatch = item.href.match(/linkedin\.com\/in\/([^/?]+)/);
          if (!usernameMatch) continue;
          const username = usernameMatch[1];

          if (seenUsernames.has(username) || !isValidUsername(username)) continue;
          seenUsernames.add(username);

          const email = extractEmail(item.snippet) || extractEmail(item.title);

          const titleParts = item.title.replace(' | LinkedIn', '').split(' - ');
          const name = titleParts[0]?.trim() || username;
          const jobTitle = titleParts[1]?.trim();
          const company = titleParts[2]?.trim();

          let estimatedFollowers = 5000;
          const profile: ScrapedProfile = {
            platform: 'linkedin',
            username,
            profileUrl: `https://linkedin.com/in/${username}`,
            followerCount: estimatedFollowers,
            bio: item.snippet.slice(0, 500),
            email,
            name,
            title: jobTitle,
            company,
          };

          profiles.push(profile);
          onProgress?.(`Added: ${name} (${jobTitle || 'Pro'})`);
        }

      } catch (err: any) {
        onProgress?.(`Error: ${err.message}`);
      }
    }

  } catch (e: any) {
    onProgress?.(`Browser error: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return profiles;
}
