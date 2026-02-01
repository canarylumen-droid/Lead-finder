
import { scrapeInstagramProfiles, scrapeLinkedInProfiles } from './server/scraper/real-scraper';
import fs from 'fs';
import { Parser } from 'json2csv';

async function runProduction() {
    console.log('Running Production Scrape for 500 Leads...');
    const niches = [
        'roofing contractor miami',
        'water damage restoration dallas',
        'hvac repair houston',
        'plumbing service los angeles',
        'electrician new york',
        'landscaping business austin',
        'home remodeling contractor chicago',
        'solar installer phoenix',
        'pest control orlando',
        'cleaning service seattle'
    ];

    const allLeads: any[] = [];

    // Instagram
    console.log('\n--- Scraping Instagram ---');
    const igLeads = await scrapeInstagramProfiles(niches, 250, (msg) => console.log('[IG]:', msg));
    allLeads.push(...igLeads);

    // LinkedIn
    console.log('\n--- Scraping LinkedIn ---');
    const liLeads = await scrapeLinkedInProfiles(niches, 250, (msg) => console.log('[LI]:', msg));
    allLeads.push(...liLeads);

    console.log(`\nTotal Leads Collected: ${allLeads.length}`);

    if (allLeads.length > 0) {
        try {
            const parser = new Parser();
            const csv = parser.parse(allLeads);
            fs.writeFileSync('leads.csv', csv);
            console.log('Successfully saved to leads.csv');
        } catch (err) {
            console.error('Error saving CSV:', err);
        }
    } else {
        console.log('No leads found.');
    }
}

runProduction();
