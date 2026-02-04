
const { chromium } = require('playwright-chromium');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const NICHES = [
    'Home Remodeling', 'Roofing Contractor', 'Solar Company', 'HVAC Service',
    'Plumbing', 'MedSpa clinic', 'Fitness Coach', 'Pest Control',
    'Electrician', 'Landscaping', 'Water Damage Restoration', 'Deck Builder',
    'Fencing Contractor', 'Painting Service', 'Tree Service'
];

const LOCATIONS = [
    'Houston Texas', 'Dallas Texas', 'Austin Texas', 'San Antonio Texas',
    'Miami Florida', 'Orlando Florida', 'Tampa Florida', 'Jacksonville Florida',
    'Los Angeles California', 'San Diego California', 'Phoenix Arizona',
    'Atlanta Georgia', 'Charlotte North Carolina', 'Seattle Washington',
    'Chicago Illinois', 'Columbus Ohio',
    'London UK', 'Dubai UAE', 'Sydney Australia'
];

const TARGET_LEADS = 1500;
const CONCURRENCY = 20; // Increased
const OUTPUT_FILE = path.join(__dirname, 'ghost_leads.csv');
const EXCLUSIONS_FILE = path.join(__dirname, 'reply_flow.csv');

// Allowed "Ghost" Domains (Businesses that don't have a REAL website)
const SOCIAL_GHOST_DOMAINS = ['facebook.com', 'instagram.com', 'business.site', 'linkedin.com', 'yelp.com'];
const GENERIC_EMAILS = ['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com', '@icloud.com', '@aol.com'];

let leadsCollected = 0;
const existingNames = new Set();

// --- DEDUPLICATION ---
function loadExclusions() {
    if (fs.existsSync(EXCLUSIONS_FILE)) {
        try {
            const content = fs.readFileSync(EXCLUSIONS_FILE, 'utf-8');
            const lines = content.split('\n');
            lines.forEach(line => {
                const cols = line.split(',');
                if (cols.length > 0) existingNames.add(cols[0].trim().toLowerCase());
            });
        } catch (e) { }
    }
}

// --- DEEP SEARCH ---
async function findEmail(context, name, location) {
    const page = await context.newPage();
    let email = "Not Found";
    try {
        const q = `${name} ${location} email contact`;
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
        const results = await page.$$eval('div.VwiC3b', divs => divs.map(d => d.innerText));
        for (const text of results) {
            const words = text.split(/\s+/);
            for (const w of words) {
                if (w.includes('@') && w.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
                    const clean = w.replace(/[^a-zA-Z0-9@.]/g, '').toLowerCase();
                    if (clean.length > 5 && clean.includes('.')) {
                        email = clean;
                        break;
                    }
                }
            }
            if (email !== "Not Found") break;
        }
    } catch (e) { } finally { await page.close(); }
    return email;
}

// --- SCRAPER ---
async function scrapeQuery(context, query) {
    if (leadsCollected >= TARGET_LEADS) return;

    const page = await context.newPage();
    console.log(`Searching: ${query}`);

    try {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`);

        try {
            await page.waitForSelector('div[role="feed"]', { timeout: 8000 });
            for (let i = 0; i < 6; i++) {
                if (leadsCollected >= TARGET_LEADS) break;
                await page.evaluate(() => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) feed.scrollBy(0, 3000);
                });
                await page.waitForTimeout(1000);
            }
        } catch (e) { }

        const listings = await page.$$('div[role="article"]');

        for (const listing of listings) {
            if (leadsCollected >= TARGET_LEADS) break;

            try {
                const text = await listing.innerText();
                const lines = text.split('\n');
                if (!lines.length) continue;
                const name = lines[0].trim();

                if (existingNames.has(name.toLowerCase())) continue;

                // CHECK WEBSITE
                let websiteUrl = "No Website";
                let isGhost = true;

                try {
                    const webBtn = await listing.$('a[data-value="Website"]');
                    if (webBtn) {
                        const href = await webBtn.getAttribute('href');
                        if (href) {
                            // Check if it's a REAL website or a GHOST SITE
                            const isSocial = SOCIAL_GHOST_DOMAINS.some(d => href.includes(d));
                            if (!isSocial) {
                                isGhost = false; // It's a real website custom domain
                            } else {
                                websiteUrl = href; // It's a social link, still counts as Ghost for us
                            }
                        }
                    }
                } catch (e) { }

                if (!isGhost) continue; // Skip real websites

                // Click
                await listing.click();
                await page.waitForTimeout(500);

                let phone = "Not Listed";
                try {
                    const phoneBtn = await page.waitForSelector('button[data-item-id^="phone"]', { timeout: 1000 });
                    if (phoneBtn) {
                        const aria = await phoneBtn.getAttribute('aria-label');
                        phone = aria.replace('Phone: ', '').trim();
                    }
                } catch (e) { }

                if (phone === "Not Listed" || phone.length < 5) continue;

                // FIND EMAIL
                console.log(`[?] Checking for: ${name}...`);
                const email = await findEmail(context, name, query.split(' in ')[1]);

                if (email === "Not Found" || email.length < 5) continue;

                const csvRow = `"${name}","${query}","${websiteUrl}","${phone}","Verified","Verified","${email}","Manual Check"\n`;
                fs.appendFileSync(OUTPUT_FILE, csvRow);

                leadsCollected++;
                existingNames.add(name.toLowerCase());
                console.log(`[+] SAVED GHOST (${leadsCollected}): ${name} | ${email}`);

            } catch (e) { }
        }

    } catch (e) {
    } finally {
        await page.close();
    }
}

async function run() {
    loadExclusions();
    // Use APPEND mode now? No, user wanted "Start again from no 1".
    fs.writeFileSync(OUTPUT_FILE, 'Name,Location,Website,Phone,Reviews,Rating,Email,Instagram\n');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    let queue = [];
    LOCATIONS.forEach(loc => NICHES.forEach(n => queue.push(`${n} in ${loc}`)));
    queue = queue.sort(() => Math.random() - 0.5);

    const activePromises = new Set();

    for (const query of queue) {
        if (leadsCollected >= TARGET_LEADS) break;
        while (activePromises.size >= CONCURRENCY) { await Promise.race(activePromises); }
        const p = scrapeQuery(context, query).then(() => activePromises.delete(p));
        activePromises.add(p);
    }

    await Promise.all(activePromises);
    await browser.close();
    console.log("Done.");
}

run();
