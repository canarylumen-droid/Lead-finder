
import { scrapeGoogleMaps, GoogleMapsLead } from './server/scraper/google-maps-scraper';
import { findEmailsOnWebsite } from './server/scraper/email-finder';
import fs from 'fs';
import { Parser } from 'json2csv';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import vanillaPuppeteer from 'puppeteer-core';

const puppeteer = addExtra(vanillaPuppeteer);
puppeteer.use(StealthPlugin());
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runMapsWithEmails() {
    console.log('--- Phase 1: Scraping Google Maps ---');

    const cities = ['Miami, FL', 'Dallas, TX']; // Testing with 2 cities for speed
    const niches = ['Roofing Contractor', 'Water Damage Restoration'];
    const queries: string[] = [];
    cities.forEach(c => niches.forEach(n => queries.push(`${n} in ${c}`)));

    const leads = await scrapeGoogleMaps(queries, 10, (m) => console.log(m));

    console.log(`\n--- Phase 2: Deep Crawling Websites for Emails (${leads.length} leads) ---`);

    const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });

    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        if (lead.website && lead.website.startsWith('http')) {
            console.log(`[${i + 1}/${leads.length}] Scoping: ${lead.name}`);
            const foundEmails = await findEmailsOnWebsite(lead.website, browser);
            if (foundEmails.length > 0) {
                lead.email = foundEmails[0]; // Take primary email
                console.log(`   >> SUCCESS: Found ${lead.email}`);
            } else {
                console.log(`   >> No email found.`);
            }
        } else {
            console.log(`[${i + 1}/${leads.length}] Skipping (No Website): ${lead.name}`);
        }
    }

    await browser.close();

    if (leads.length > 0) {
        const parser = new Parser();
        const csv = parser.parse(leads);
        fs.writeFileSync('leads_with_emails.csv', csv);
        console.log('\nSUCCESS: Data saved to leads_with_emails.csv');
    }
}

runMapsWithEmails();
