
import { scrapeInstagramProfiles, scrapeLinkedInProfiles } from './server/scraper/real-scraper';

async function test() {
    console.log('Testing scraper...');
    try {
        const keywords = ['roofing contractor miami', 'water restoration dallas'];

        console.log('--- Testing Instagram Scraper ---');
        const igResults = await scrapeInstagramProfiles(keywords, 5, (msg) => console.log('[IG]:', msg));
        console.log(`igram found: ${igResults.length} leads`);
        if (igResults.length > 0) console.log(JSON.stringify(igResults[0], null, 2));

        console.log('\n--- Testing LinkedIn Scraper ---');
        const liResults = await scrapeLinkedInProfiles(keywords, 5, (msg) => console.log('[LI]:', msg));
        console.log(`LinkedIn found: ${liResults.length} leads`);
        if (liResults.length > 0) console.log(JSON.stringify(liResults[0], null, 2));

    } catch (error) {
        console.error('Test failed:', error);
    }
}

test();
