
import { scrapeGoogleMaps } from './server/scraper/google-maps-scraper';
import fs from 'fs';
import { Parser } from 'json2csv';

async function runMapsProduction() {
    console.log('Running Google Maps Production Scrape for High-Ticket Leads...');

    // "Boring" High-Ticket Niches + Major Cities
    const cities = ['Miami, FL', 'Dallas, TX', 'Houston, TX', 'Los Angeles, CA', 'New York, NY', 'Chicago, IL', 'Phoenix, AZ'];
    const niches = [
        'Roofing Contractor',
        'Water Damage Restoration',
        'HVAC Repair',
        'Emergency Plumber',
        'Tree Service'
    ];

    const queries: string[] = [];
    cities.forEach(city => {
        niches.forEach(niche => {
            queries.push(`${niche} in ${city}`);
        });
    });

    // Limit queries to reach target approx 500 leads. 
    // 5 niches * 7 cities = 35 queries. 
    // 35 queries * 20 results = 700 leads. Perfect.

    console.log(`Prepared ${queries.length} search queries.`);

    const allLeads = await scrapeGoogleMaps(queries, 20, (msg) => console.log('[Maps]:', msg));

    console.log(`\nTotal Maps Leads Collected: ${allLeads.length}`);

    if (allLeads.length > 0) {
        try {
            const parser = new Parser();
            const csv = parser.parse(allLeads);
            fs.writeFileSync('leads_maps.csv', csv);
            console.log('Successfully saved to leads_maps.csv');
        } catch (err) {
            console.error('Error saving CSV:', err);
        }
    } else {
        console.log('No leads found.');
    }
}

runMapsProduction();
