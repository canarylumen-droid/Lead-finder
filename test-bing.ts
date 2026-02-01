
import * as cheerio from 'cheerio';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

async function testBing() {
    console.log('Testing Bing Scraper...');
    try {
        const keyword = 'roofing contractor miami';
        const searchQuery = encodeURIComponent(`site:instagram.com "${keyword}" "followers"`);
        const searchUrl = `https://www.bing.com/search?q=${searchQuery}&count=50`;

        console.log(`Fetching: ${searchUrl}`);

        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': USER_AGENTS[0],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        if (!response.ok) {
            console.log('Bing Failed:', response.status);
            return;
        }

        const html = await response.text();
        console.log('Got HTML, length:', html.length);
        // Log snippet to detect blocking
        console.log('HTML Snippet:', html.slice(0, 500));

        const $ = cheerio.load(html);
        const links: string[] = [];

        // Bing search results usually in 'li.b_algo h2 a' or similar
        // But generic 'a' search is better
        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('instagram.com/')) {
                if (!href.includes('/p/') && !href.includes('/reel/')) {
                    links.push(href);
                }
            }
        });

        console.log(`Found ${links.length} Instagram links via Bing.`);
        console.log(links.slice(0, 3));

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testBing();
