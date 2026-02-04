
import fs from 'fs';
import vanillaPuppeteer from 'puppeteer-core';
// import { Cluster } from 'puppeteer-cluster'; // Removed to fix error
// Since I don't know if puppeteer-cluster is installed, I will use p-limit pattern with vanilla Promises for max compatibility
// User asked for "90 per 3 seconds". I will aim for high concurrency (50) to avoid crashing the system.

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const INPUT_FILE = 'reply_flow.csv';
const FAILED_FILE = 'no_emails.csv';
const CONCURRENCY = 15; // Reduced to prevent browser crashes

// Placeholders to detect
const PLACEHOLDERS = ['user@domain', 'email@domain', 'example.com', 'name@example', 'user@example', 'email@email', 'domain.com'];

interface Lead {
    originalLine: string;
    name: string;
    phone: string;
    website: string;
    address: string;
    rating: string;
    reviews: string;
    query: string;
    url: string;
    email: string;
    isValid: boolean;
}

function parseCSVLine(line: string): Lead | null {
    // Regex to handle CSV parsing with quotes
    const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    // Simple split for now, assuming standard format from previous scripts
    // Format: "Name","Phone","Website","Address","Rating","Reviews","Query","Url","Email"
    // But sometimes fields might be empty or contain commas.

    // Robust parsing
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuote = !inQuote;
        } else if (char === ',' && !inQuote) {
            parts.push(current.replace(/^"|"$/g, '')); // Remove surrounding quotes
            current = '';
            continue;
        }
        current += char;
    }
    parts.push(current.replace(/^"|"$/g, ''));

    if (parts.length < 8) return null;

    let email = parts[8] || '';
    if (email.includes('"')) email = email.replace(/"/g, '');
    email = email.trim().toLowerCase();

    const isPlaceholder = PLACEHOLDERS.some(p => email.includes(p));
    const isValid = email.length > 5 && email.includes('@') && !isPlaceholder && email !== 'null' && email !== 'undefined';

    return {
        originalLine: line,
        name: parts[0],
        phone: parts[1],
        website: parts[2],
        address: parts[3],
        rating: parts[4],
        reviews: parts[5],
        query: parts[6],
        url: parts[7],
        email: email,
        isValid
    };
}

async function scrapeEmail(url: string, browser: any): Promise<string | null> {
    if (!url || !url.startsWith('http')) return null;

    const page = await browser.newPage();
    try {
        await page.setRequestInterception(true);
        page.on('request', (req: any) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        // Fast timeout
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });

        const content = await page.content();
        const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
        let emails = content.match(emailRegex) || [];

        // Filter garbage
        emails = emails.filter((e: string) => !PLACEHOLDERS.some(p => e.includes(p)) && !e.includes('.png') && !e.includes('.jpg'));

        if (emails.length > 0) return emails[0];

        // Try contact page if main failed
        const links = await page.$$eval('a', (as: any[]) => as.map((a: any) => a.href));
        const contactLink = links.find((l: string) => l.includes('contact') || l.includes('about'));

        if (contactLink) {
            await page.goto(contactLink, { waitUntil: 'domcontentloaded', timeout: 8000 });
            const contactContent = await page.content();
            const contactEmails = contactContent.match(emailRegex) || [];
            const validContactEmails = contactEmails.filter((e: string) => !PLACEHOLDERS.some(p => e.includes(p)));
            if (validContactEmails.length > 0) return validContactEmails[0];
        }

        return null;
    } catch (e: any) {
        return null;
    } finally {
        await page.close();
    }
}

async function runRepair() {
    console.log('🔧 Starting TURBO REPAIR...');
    console.log(`🚀 Concurrency: ${CONCURRENCY}`);

    const content = fs.readFileSync(INPUT_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    const goodLeads: string[] = [];
    const badLeads: Lead[] = [];
    const failedLeads: string[] = [];

    // 1. Separate Good vs Bad
    for (const line of lines) {
        const lead = parseCSVLine(line);
        if (lead) {
            if (lead.isValid) {
                goodLeads.push(line);
            } else {
                badLeads.push(lead);
            }
        }
    }

    console.log(`📊 Analysis: ${goodLeads.length} Good, ${badLeads.length} To Repair.`);

    // 2. Launch Browser
    const browser = await vanillaPuppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    // 3. Repair Loop (Batched)
    let repairedCount = 0;
    const START_INDEX = 0; // Set this to > 0 if you want to skip the first N bad leads

    // We filter badLeads to start from START_INDEX if needed, but usually we want to retry all
    const leadsToProcess = badLeads.slice(START_INDEX);
    console.log(`\nProcessing ${leadsToProcess.length} leads (Skipped first ${START_INDEX})...`);

    for (let i = 0; i < leadsToProcess.length; i += CONCURRENCY) {
        const chunk = leadsToProcess.slice(i, i + CONCURRENCY);
        console.log(`\n🔄 Processing Batch ${i + 1}-${Math.min(i + CONCURRENCY, leadsToProcess.length)} (Lead #${START_INDEX + i + 1})...`);

        await Promise.all(chunk.map(async (lead) => {
            const email = await scrapeEmail(lead.website, browser);
            if (email) {
                repairedCount++;
                // Update the specific line in the full lines array
                // We need to find the line index. Since we separated them, it's tricky.
                // Better approach: We stored originalLine. Let's find it in 'lines' and replace it.
                // Ideally we should have stored the index. 
                // Simple fix: reconstruct the line and add to a 'fixed' map, then rebuild file at save.

                // Reconstruct CSV line properly
                const newLine = `"${lead.name}","${lead.phone}","${lead.website}","${lead.address}","${lead.rating}","${lead.reviews}","${lead.query}","${lead.url}","${email}"`;

                // Find and replace in the main 'lines' array
                const lineIndex = lines.indexOf(lead.originalLine);
                if (lineIndex !== -1) {
                    lines[lineIndex] = newLine;
                    console.log(`   ✅ FIXED: ${lead.name} -> ${email}`);
                }
            } else {
                // console.log(`   ❌ FAILED: ${lead.name}`);
            }
        }));

        // SAVE PROGRESS AFTER EVERY BATCH
        fs.writeFileSync(INPUT_FILE, lines.join('\n') + '\n');
        console.log(`   💾 Progress Saved. (${repairedCount} repaired so far)`);
    }

    await browser.close();

    // 4. Save (Final pass to separate failed leads if needed, or just rely on the in-place updates)
    // Re-evaluate all lines to determine final good and failed leads
    const finalGoodLeads: string[] = [];
    const finalFailedLeads: string[] = [];

    for (const line of lines) {
        const lead = parseCSVLine(line);
        if (lead && lead.isValid) {
            finalGoodLeads.push(line);
        } else {
            finalFailedLeads.push(line);
        }
    }

    fs.writeFileSync(INPUT_FILE, finalGoodLeads.join('\n') + '\n');
    if (finalFailedLeads.length > 0) {
        fs.writeFileSync(FAILED_FILE, finalFailedLeads.join('\n') + '\n');
    }

    console.log(`\n🎉 REPAIR COMPLETE!`);
    console.log(`✅ Total Valid in ${INPUT_FILE}: ${finalGoodLeads.length} (+${repairedCount} repaired)`);
    console.log(`🚫 Total Failed moved to ${FAILED_FILE}: ${finalFailedLeads.length}`);
}

runRepair();
