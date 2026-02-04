
import fs from 'fs';
import Papa from 'papaparse';

const FILE = 'reply_flow.csv';

function analyze() {
    if (!fs.existsSync(FILE)) {
        console.log('File not found.');
        return;
    }

    const content = fs.readFileSync(FILE, 'utf-8');

    // Manual parsing to handle potential CSV issues flexibly
    const lines = content.split('\n');
    let valid = 0;
    let empty = 0;
    let placeholder = 0;
    let nullType = 0;

    const placeholders = ['user@domain', 'email@domain', 'example.com', 'name@example', 'user@example'];

    console.log(`Analyzing ${lines.length} lines...`);
    console.log('--- SUSPICIOUS LEADS ---');

    lines.forEach((line, index) => {
        if (!line.trim()) return;

        // Simple distinct based on last column assuming structure: "Name",...,"Email"
        // Adjusting logic to be robust: find last quote-enclosed string
        const match = line.match(/"([^"]+)"\s*$/);
        const email = match ? match[1].toLowerCase() : '';

        if (!email || email.length < 5 || !email.includes('@')) {
            empty++;
            // console.log(`[Line ${index+1}] Empty/Invalid: ${line.substring(0, 50)}...`);
        } else if (placeholders.some(p => email.includes(p))) {
            placeholder++;
            console.log(`[Line ${index + 1}] Placeholder: ${email} -> ${line.substring(0, 30)}...`);
        } else if (email === 'null' || email === 'undefined') {
            nullType++;
            console.log(`[Line ${index + 1}] Null/Undefined: ${email}`);
        } else {
            valid++;
        }
    });

    console.log('\n--- SUMMARY ---');
    console.log(`Total Scanned: ${lines.length}`);
    console.log(`✅ Valid Emails: ${valid}`);
    console.log(`❌ Empty/Missing: ${empty}`);
    console.log(`⚠️ Placeholders (user@domain, etc.): ${placeholder}`);
    console.log(`🚫 Null/Undefined: ${nullType}`);
    console.log(`-----------------------------`);
    console.log(`TOTAL BAD LEADS TO REPAIR: ${empty + placeholder + nullType}`);
}

analyze();
