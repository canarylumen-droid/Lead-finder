
import vanillaPuppeteer from 'puppeteer-core';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function test() {
    console.log('Testing browser launch...');
    try {
        const browser = await vanillaPuppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true,
            args: ['--no-sandbox']
        });
        console.log('SUCCESS: Browser launched.');
        await browser.close();
    } catch (e) {
        console.error('FAILURE:', e);
    }
}
test();
