
import { findEmailsOnWebsite } from './server/scraper/email-finder';
import fs from 'fs';
import vanillaPuppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_FILE = 'reply_flow.csv';
const START_LINE = 299; // Line where emails stopped being scraped

async function backfillEmails() {
    console.log('📧 EMAIL BACKFILL SYSTEM: Starting from line', START_LINE);

    if (!fs.existsSync(OUTPUT_FILE)) {
        console.log('❌ reply_flow.csv not found!');
        return;
    }

    const content = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    console.log(`📊 Total lines: ${lines.length}`);
    console.log(`🎯 Processing lines ${START_LINE} to ${lines.length}`);

    const browser = await vanillaPuppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    let updatedCount = 0;
    const concurrency = 20;

    // Process in batches of 20 for speed
    for (let i = START_LINE - 1; i < lines.length; i += concurrency) {
        const batch = [];
        for (let j = i; j < Math.min(i + concurrency, lines.length); j++) {
            batch.push({ index: j, line: lines[j] });
        }

        await Promise.all(batch.map(async ({ index, line }) => {
            try {
                // Parse CSV line
                const parts = line.match(/"([^"]*)"/g);
                if (!parts || parts.length < 9) return;

                const email = parts[8]?.replace(/"/g, '');
                const website = parts[2]?.replace(/"/g, '');

                // Only process if email is empty but website exists
                if (email || !website) return;

                const emails = await findEmailsOnWebsite(website, browser).catch(() => []);
                if (emails.length > 0) {
                    const gmail = emails.find(e => e.toLowerCase().includes('gmail.com'));
                    const foundEmail = gmail || emails[0];

                    // Update the line with found email
                    parts[8] = `"${foundEmail}"`;
                    lines[index] = parts.join(',');
                    updatedCount++;

                    if (updatedCount % 10 === 0) {
                        console.log(`   📧 Backfilled ${updatedCount} emails...`);
                    }
                }
            } catch (err) { }
        }));
    }

    // Write back updated content
    fs.writeFileSync(OUTPUT_FILE, lines.join('\n') + '\n');

    await browser.close();
    console.log(`\n🎉 BACKFILL COMPLETE: Updated ${updatedCount} emails in ${OUTPUT_FILE}`);
}

backfillEmails().catch(console.error);
