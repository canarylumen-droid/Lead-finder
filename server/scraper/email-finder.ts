
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import vanillaPuppeteer from 'puppeteer-core';

const puppeteer = addExtra(vanillaPuppeteer);
puppeteer.use(StealthPlugin());

/**
 * Fast Email Finder - scrapes home page only for speed.
 */
export async function findEmailsOnWebsite(websiteUrl: string, browser: any): Promise<string[]> {
    const emails = new Set<string>();
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

        // Fast intercept
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const content = await page.content();
        const matches = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);

        if (matches) {
            matches.forEach((m: string) => {
                const clean = m.toLowerCase().trim();
                if (!clean.match(/\.(png|jpg|jpeg|gif|svg|webp|js|css|pdf)$/i) && clean.length < 50) {
                    emails.add(clean);
                }
            });
        }
    } catch (e) {
        // Skip
    } finally {
        await page.close();
    }

    return Array.from(emails);
}
