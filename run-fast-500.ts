
import { scrapeGoogleMaps } from './server/scraper/google-maps-scraper';
import { findEmailsOnWebsite } from './server/scraper/email-finder';
import fs from 'fs';
import vanillaPuppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runTurboScrape() {
    console.log('🚀 Starting TURBO Lead Generation Target: 500 Total Leads');
    console.log('🎯 Focus: MedSpas, Property Management, Event Venues, Equipment Rentals');

    const niches = [
        'MedSpa Botox',
        'Medical Aesthetics',
        'CoolSculpting MedSpa',
        'Commercial Property Management',
        'Apartment Leasing Office',
        'Wedding Venue',
        'Event Space Rental',
        'Equipment Rental Service'
    ];

    const locations = [
        'Orange County, CA',
        'Maricopa County, AZ',
        'Harris County, TX',
        'Cook County, IL',
        'Miami-Dade County, FL',
        'King County, WA',
        'Dallas County, TX',
        'Fulton County, GA',
        'Los Angeles County, CA',
        'San Diego County, CA',
        'Clark County, NV',
        'Hillsborough County, FL',
        'Wayne County, MI',
        'Oakland County, MI',
        'Franklin County, OH'
    ];

    const getExistingNames = () => {
        if (!fs.existsSync('leads_with_emails.csv')) return new Set();
        const content = fs.readFileSync('leads_with_emails.csv', 'utf-8');
        const lines = content.split('\n');
        return new Set(lines.map(line => {
            const match = line.match(/^"([^"]+)"/);
            return match ? match[1] : null;
        }).filter(n => n !== null));
    };

    let existingNames = getExistingNames();
    console.log(`📊 Current unique leads in file: ${existingNames.size - 1}`);

    const target = 500;
    let leadsFound = existingNames.size - 1;

    const browser = await vanillaPuppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const concurrency = 5;

    for (const location of locations) {
        if (leadsFound >= target) break;

        for (const niche of niches) {
            if (leadsFound >= target) break;

            const query = `${niche} in ${location}`;
            console.log(`\n🔎 [Query]: ${query} (${leadsFound}/${target})`);

            try {
                const leads = await scrapeGoogleMaps([query], 50, (m) => console.log(`   ${m}`));

                const newVisibleLeads = leads.filter(l => !existingNames.has(l.name));

                for (let i = 0; i < newVisibleLeads.length; i += concurrency) {
                    if (leadsFound >= target) break;

                    const batch = newVisibleLeads.slice(i, i + concurrency);
                    await Promise.all(batch.map(async (lead) => {
                        if (lead.website) {
                            const emails = await findEmailsOnWebsite(lead.website, browser).catch(() => []);
                            if (emails.length > 0) {
                                // Prioritize Gmail if present
                                const gmail = emails.find(e => e.includes('gmail.com'));
                                lead.email = gmail || emails[0];
                            }
                        }

                        if (lead.email) {
                            const csvLine = `"${lead.name}","${lead.phone || ''}","${lead.website || ''}","${lead.address || ''}","${lead.rating || ''}","${lead.reviews || ''}","${lead.query}","${lead.url}","${lead.email || ''}"\n`;
                            fs.appendFileSync('leads_with_emails.csv', csvLine);
                            existingNames.add(lead.name);
                            leadsFound++;
                            console.log(`   🚀 #${leadsFound}: ${lead.name} [${lead.email}]`);
                        }
                    }));
                }
            } catch (err: any) {
                console.error(`   ❌ Query Error: ${err.message}`);
            }
        }
    }

    await browser.close();
    console.log(`\n🎉 Goal Reached: ${leadsFound} leads.`);
}

runTurboScrape().catch(console.error);
