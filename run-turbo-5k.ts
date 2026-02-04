
import { scrapeGoogleMaps } from './server/scraper/google-maps-scraper';
import { findEmailsOnWebsite } from './server/scraper/email-finder';
import fs from 'fs';
import vanillaPuppeteer from 'puppeteer-core';

// Configuration
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_FILE = 'reply_flow.csv'; // STRICTLY saving here
const TARGET_LEADS = 5000;
const CONCURRENCY_LIMIT = 25; // High concurrency for speed

async function runTurbo5k() {
    console.log('⚡ TURBO SCRAPER 5000: Initializing...');
    console.log(`🎯 Target: ${TARGET_LEADS} leads WITH EMAILS.`);
    console.log(`📁 Output: ${OUTPUT_FILE}`);
    console.log(`🚀 Concurrency: ${CONCURRENCY_LIMIT} threads`);

    // Niches from user request (HVAC, Roofing, etc.) - NO DENTISTS
    const niches = [
        'HVAC Service', 'Roofing Contractor', 'Solar Energy Contractor', 'Home Remodeling',
        'Plumbing Service', 'Electrician', 'Landscaping Company', 'Pest Control Service',
        'General Contractor', 'Water Damage Restoration', 'Foundation Repair', 'Fencing Contractor',
        'Window Installation', 'Flooring Store', 'Painting Contractor', 'Siding Contractor'
    ];

    const locations = [
        'Harris County, TX', 'Dallas County, TX', 'Travis County, TX', 'Bexar County, TX',
        'Miami-Dade County, FL', 'Broward County, FL', 'Orange County, FL', 'Hillsborough County, FL',
        'Palm Beach County, FL', 'Duval County, FL',
        'Los Angeles County, CA', 'San Diego County, CA', 'Orange County, CA', 'Riverside County, CA',
        'Maricopa County, AZ', 'Clark County, NV',
        'King County, WA', 'Cook County, IL', 'Fulton County, GA', 'Mecklenburg County, NC',
        'Wake County, NC', 'Fairfax County, VA', 'Montgomery County, MD', 'Suffolk County, NY'
    ];

    // Deduplication setup
    const getExistingData = () => {
        if (!fs.existsSync(OUTPUT_FILE)) return { count: 0, urls: new Set() };
        const content = fs.readFileSync(OUTPUT_FILE, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);
        const urls = new Set();
        let emailCount = 0;

        lines.forEach(line => {
            // CSV parsing attempt (simple)
            const parts = line.split('","');
            if (parts.length > 7) {
                const url = parts[7].replace(/"/g, ''); // Adjust index based on CSV structure
                if (url) urls.add(url);
            }
            if (line.includes('@')) emailCount++;
        });
        return { count: emailCount, urls };
    };

    let { count, urls: existingUrls } = getExistingData();
    console.log(`📊 Current Progress: ${count}/${TARGET_LEADS} verified leads loaded.`);

    // Browser setup
    const browser = await vanillaPuppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-extensions'
        ]
    });

    // Main Loop
    mainLoop:
    for (const location of locations) {
        for (const niche of niches) {
            if (count >= TARGET_LEADS) break mainLoop;

            const query = `${niche} in ${location}`;
            console.log(`\n🔍 Searching: "${query}"`);

            try {
                // Scrape Maps (Limit 60 per query to keep it fast and fresh)
                const leads = await scrapeGoogleMaps([query], 60, (msg) => {
                    // Optional: console.log(`   [Maps] ${msg}`);
                });

                // Filter duplicates immediately
                const newLeads = leads.filter(l => l.url && !existingUrls.has(l.url));
                console.log(`   Found ${leads.length} raw leads. ${newLeads.length} are new.`);

                // Process in chunks (Concurrency)
                for (let i = 0; i < newLeads.length; i += CONCURRENCY_LIMIT) {
                    if (count >= TARGET_LEADS) break mainLoop;

                    const chunk = newLeads.slice(i, i + CONCURRENCY_LIMIT);

                    await Promise.all(chunk.map(async (lead) => {
                        if (count >= TARGET_LEADS) return;
                        if (!lead.website) return;

                        try {
                            const emails = await findEmailsOnWebsite(lead.website, browser).catch(() => []);

                            // STRICT: Only save if email found
                            if (emails && emails.length > 0) {
                                // Prefer Gmail/Outlook but take any
                                const bestEmail = emails.find(e => e.includes('gmail') || e.includes('outlook')) || emails[0];

                                // Double check duplicate just in case (race condition protection)
                                if (existingUrls.has(lead.url!)) return;
                                existingUrls.add(lead.url!);

                                // Format CSV Line
                                // "Name","Phone","Website","Address","Rating","Reviews","Query","Url","Email"
                                const line = `"${lead.name}","${lead.phone || ''}","${lead.website || ''}","${lead.address || ''}","${lead.rating || ''}","${lead.reviews || ''}","${query}","${lead.url}","${bestEmail}"\n`;

                                fs.appendFileSync(OUTPUT_FILE, line);
                                count++;
                                console.log(`   ✅ [${count}/${TARGET_LEADS}] FOUND: ${lead.name} -> ${bestEmail}`);
                            }
                        } catch (e) {
                            // Ignore individual scraping errors
                        }
                    }));
                }

            } catch (err) {
                console.error(`   ❌ critical error for query ${query}:`, err);
            }
        }
    }

    await browser.close();
    console.log(`\n🎉 JOB COMPLETE. Final Count: ${count} verified leads in ${OUTPUT_FILE}`);
}

runTurbo5k().catch(console.error);
