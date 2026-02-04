
import { scrapeGoogleMaps } from './server/scraper/google-maps-scraper';
import { findEmailsOnWebsite } from './server/scraper/email-finder';
import fs from 'fs';
import vanillaPuppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_FILE = 'reply_flow.csv';

async function runHyperLeadScraper() {
    console.log('⚡ HYPER LEAD SCRAPER: 5,000 Target WITH Emails');
    console.log('🚀 Speed: 10 Parallel Browsers | 20 Email Concurrency');

    const niches = [
        'Home Remodeling', 'Roofing Contractor', 'Solar Company', 'HVAC Service',
        'Plumbing', 'MedSpa clinic', 'Fitness Coach', 'Pest Control'
    ];

    const locations = [
        'Texas', 'Florida', 'California', 'Arizona', 'Georgia', 'North Carolina',
        'Washington', 'Illinois', 'Ohio', 'London', 'Dubai', 'Sydney'
    ];

    const getExistingCount = () => {
        if (!fs.existsSync(OUTPUT_FILE)) return 0;
        return fs.readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(l => l.trim()).length;
    };

    let count = getExistingCount();
    const target = 5000;

    console.log(`📊 Current: ${count} | Target: ${target}`);

    const browser = await vanillaPuppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const queryPool = [];
    for (const location of locations) {
        for (const niche of niches) {
            queryPool.push(`${niche} in ${location}`);
        }
    }

    for (let i = queryPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queryPool[i], queryPool[j]] = [queryPool[j], queryPool[i]];
    }

    const batchSize = 5;
    for (let i = 0; i < queryPool.length; i += batchSize) {
        if (count >= target) break;

        const queries = queryPool.slice(i, i + batchSize);
        console.log(`\n🌊 Wave: ${queries.length} queries...`);

        await Promise.all(queries.map(async (query) => {
            try {
                const leads = await scrapeGoogleMaps([query], 100, () => { });

                for (const lead of leads) {
                    if (count >= target) return;

                    // ONLY save leads WITH valid emails
                    if (!lead.website) continue;

                    const emails = await findEmailsOnWebsite(lead.website, browser).catch(() => []);
                    if (emails.length === 0) continue; // SKIP leads without emails

                    const gmail = emails.find(e => e.toLowerCase().includes('gmail.com'));
                    const email = gmail || emails[0];

                    const csvLine = `"${lead.name}","${lead.phone || ''}","${lead.website || ''}","${lead.address || ''}","${lead.rating || ''}","${lead.reviews || ''}","${lead.query}","${lead.url}","${email}"\n`;
                    fs.appendFileSync(OUTPUT_FILE, csvLine);
                    count++;
                    console.log(`   ✅ #${count} | ${lead.name} [${email}]`);

                    if (count % 100 === 0) {
                        console.log(`   🚀 Milestone: ${count}/5000 leads WITH emails`);
                    }
                }
            } catch (err) { }
        }));
    }

    await browser.close();
    console.log(`\n🎉 COMPLETE: ${count} leads with emails.`);
}

runHyperLeadScraper().catch(console.error);
