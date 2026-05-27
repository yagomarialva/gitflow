const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost');
  
  console.log('Navigated to frontend');
  
  // Wait for search input
  await page.waitForSelector('input[name="query"]');
  await page.type('input[name="query"]', 'motorhead playlist');
  
  // Select playlist type
  await page.select('select[name="type"]', 'playlist');
  
  // Click search
  await page.click('button[type="submit"]');
  console.log('Clicked search');
  
  // Wait for results
  try {
    await page.waitForSelector('.result-card', { timeout: 30000 });
    const titles = await page.$$eval('.result-card__title', els => els.map(e => e.textContent));
    console.log('Found results:', titles);
  } catch (e) {
    console.log('No results found or timed out');
  }

  await browser.close();
})();
