
import { scrapeGoogleMaps } from './server/scraper/google-maps-scraper';
import { findEmailsOnWebsite } from './server/scraper/email-finder';
import fs from 'fs';
import vanillaPuppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runHighSpeedScrape() {
    console.log('⚡ Starting High-Speed Lead Generation Target: 500 Total Leads');

    const niches = [
        'Roofing Contractor',
        'Water Damage Restoration',
        'HVAC Repair',
        'Emergency Plumber',
        'Landscaping Service',
        'Tree Removal Service',
        'Personal Injury Lawyer',
        'MedSpa Botox',
        'Medical Aesthetics',
        'Auto Detail Shop',
        'Auto Repair Shop',
        'Wedding Venue',
        'Event Space Rental',
        'Equipment Rental Service',
        'Commercial Property Management',
        'Apartment Leasing Office'
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
        'Wayne County, MI'
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
    console.log(`📊 Initial leads count: ${existingNames.size - 1}`);

    const target = 500;
    let leadsFound = existingNames.size - 1; // Subtract header

    const launchBrowser = async () => {
        return await vanillaPuppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });
    };

    let browser = await launchBrowser();

    for (const location of locations) {
        if (leadsFound >= target) break;

        for (const niche of niches) {
            if (leadsFound >= target) break;

            const query = `${niche} in ${location}`;
            console.log(`\n🔎 [Query]: ${query} (Progress: ${leadsFound}/${target})`);

            try {
                const leads = await scrapeGoogleMaps([query], 100, (m) => console.log(`   ${m}`));

                for (const lead of leads) {
                    if (leadsFound >= target) break;
                    if (existingNames.has(lead.name)) continue;

                    if (lead.website) {
                        try {
                            const emails = await findEmailsOnWebsite(lead.website, browser);
                            if (emails.length > 0) {
                                lead.email = emails[0];
                            }
                        } catch (e: any) {
                            if (e.message.includes('Connection closed')) {
                                console.log('   ⚠️ Browser connection closed. Restarting...');
                                await browser.close().catch(() => { });
                                browser = await launchBrowser();
                            }
                        }
                    }

                    const csvLine = `"${lead.name}","${lead.phone || ''}","${lead.website || ''}","${lead.address || ''}","${lead.rating || ''}","${lead.reviews || ''}","${lead.query}","${lead.url}","${lead.email || ''}"\n`;
                    fs.appendFileSync('leads_with_emails.csv', csvLine);
                    existingNames.add(lead.name);
                    leadsFound++;
                    console.log(`   🚀 #${leadsFound}: ${lead.name} ${lead.email ? `[${lead.email}]` : ''}`);
                }
            } catch (err: any) {
                console.error(`   ❌ Error processing query: ${err.message}`);
                if (err.message.includes('Connection closed')) {
                    await browser.close().catch(() => { });
                    browser = await launchBrowser();
                }
            }
        }
    }

    await browser.close();
    console.log(`\n✅ Finished: Reached ${leadsFound} leads.`);
}

runHighSpeedScrape().catch(async (e) => {
    console.error('CRITICAL ERROR:', e);
});
