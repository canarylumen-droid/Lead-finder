
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load .env if present

// --- CONFIGURATION ---
// User: Copy your key here or set GEMINI_API_KEY in .env
const API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_KEY_HERE";

const BRAND_CONTEXT_FILE = path.join(__dirname, 'agency_brand_context.txt');
const EMAIL_TEMPLATES_FILE = path.join(__dirname, 'outreach_emails.txt');

// --- SIMULATED INBOX ---
const SAMPLE_LEAD_REPLY = "Hey, thanks for the video. I watched it. How much does something like this cost? And do you handle the hosting?";

async function runBot() {
    console.log("🤖 GEMINI OUTREACH BOT STARTING...");

    if (!API_KEY || API_KEY.includes("YOUR_")) {
        console.error("❌ ERROR: Please set your GEMINI_API_KEY in this script or .env file!");
        return;
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Load Context
    let brandContext = "";
    if (fs.existsSync(BRAND_CONTEXT_FILE)) {
        brandContext = fs.readFileSync(BRAND_CONTEXT_FILE, 'utf-8');
    } else {
        console.warn("⚠️ Warning: agency_brand_context.txt not found.");
    }

    // Construct Prompt
    const prompt = `
    You are an AI Sales Assistant for "The Authority Architects".
    
    RELATIONSHIP CONTEXT:
    We sent a cold email about a "Positioning Package" website revamp.
    The lead just replied.
    
    AGENCY KNOWLEDGE BASE:
    ${brandContext}
    
    INSTRUCTIONS:
    - Write a short, professional reply to the lead.
    - Answer their questions directly based on the Knowledge Base.
    - Proposed Deal: $300 one-time fee.
    - Hosting: We handle it (implied in setup, or just say yes).
    - Goal: Get them to book a quick call or say "Let's do it".
    - Keep it under 100 words.
    
    INCOMING LEAD MESSAGE:
    "${SAMPLE_LEAD_REPLY}"
    
    YOUR REPLY:
    `;

    try {
        console.log(`\n📩 Incoming: "${SAMPLE_LEAD_REPLY}"`);
        console.log("🧠 Thinking (Gemini Free Tier)...");

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log("\n📤 AI Reply Generated:\n");
        console.log("------------------------------------------------");
        console.log(text.trim());
        console.log("------------------------------------------------");
        console.log("\n✅ Success! Gemini is working as your Outreach Bot.");

    } catch (error) {
        console.error("❌ AI Error:", error.message);
    }
}

// Run if called directly
runBot();
