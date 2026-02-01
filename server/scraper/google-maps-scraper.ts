
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import vanillaPuppeteer from 'puppeteer-core';

const puppeteer = addExtra(vanillaPuppeteer);
puppeteer.use(StealthPlugin());

export interface GoogleMapsLead {
    name: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    rating: string | null;
    reviews: string | null;
    query: string;
    url: string;
    email: string | null;
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export async function scrapeGoogleMaps(
    queries: string[],
    maxResultsPerQuery: number = 20,
    onProgress?: (msg: string) => void
): Promise<GoogleMapsLead[]> {
    const allLeads: GoogleMapsLead[] = [];
    let browser;

    try {
        onProgress?.(`Launching Browser...`);
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        for (const query of queries) {
            const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
            onProgress?.(`Searching: ${query}`);

            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            try {
                const consentSelector = 'button[aria-label="Accept all"]';
                if (await page.$(consentSelector)) {
                    await page.click(consentSelector);
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (e) { }

            try { await page.waitForSelector('div[role="feed"]', { timeout: 15000 }); }
            catch (e) { continue; }

            let previousHeight = 0;
            let noChangeCount = 0;

            while (allLeads.length < (queries.indexOf(query) + 1) * maxResultsPerQuery) {
                const currentLeads = await page.evaluate((currentQuery) => {
                    const items: any[] = [];
                    const cards = document.querySelectorAll('div.Nv2PK');
                    cards.forEach(card => {
                        const name = card.querySelector('div.qBF1Pd')?.textContent || '';
                        const url = card.querySelector('a.hfpxzc')?.getAttribute('href') || '';
                        const rating = card.querySelector('span.MW4etd')?.textContent || null;
                        const reviews = card.querySelector('span.UY7F9')?.textContent?.replace(/[\(\)]/g, '') || null;
                        const textNodes = Array.from(card.querySelectorAll('div.W4Evc span')).map(s => s.textContent);
                        const phone = textNodes.find(t => t && t.match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/)) || null;
                        const address = textNodes.find(t => t && t.includes(',')) || null;
                        const website = (card.querySelector('a[aria-label*="website"]') as HTMLAnchorElement)?.href || null;
                        if (name) {
                            items.push({ name, phone, website, address, rating, reviews, query: currentQuery, url, email: null });
                        }
                    });
                    return items;
                }, query);

                for (const lead of currentLeads) {
                    if (!allLeads.some(l => l.name === lead.name)) {
                        allLeads.push(lead as GoogleMapsLead);
                    }
                }

                if (allLeads.length >= (queries.indexOf(query) + 1) * maxResultsPerQuery) break;

                await page.evaluate(() => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) feed.scrollTop = feed.scrollHeight;
                });
                await new Promise(r => setTimeout(r, 1500));

                const currentHeight = await page.evaluate(() => document.querySelector('div[role="feed"]')?.scrollHeight || 0);
                if (currentHeight === previousHeight) { if (++noChangeCount > 3) break; }
                else { noChangeCount = 0; }
                previousHeight = currentHeight;
            }
        }
    } catch (e: any) {
        onProgress?.(`Error: ${e.message}`);
    } finally {
        if (browser) await browser.close();
    }
    return allLeads;
}
