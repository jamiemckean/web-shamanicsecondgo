const { chromium } = require('playwright');
const fs = require('fs');

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/about/', name: 'about' },
  { path: '/sessions/', name: 'sessions' },
  { path: '/contact/', name: 'contact' },
  { path: '/blog/', name: 'blog' },
  { path: '/photos/', name: 'photos' },
];

const LIVE = 'https://shamanictrekker.com';
const VERCEL = 'https://web-shamanicsecondgo.vercel.app';
const OUT = './screenshots';
fs.mkdirSync(OUT, { recursive: true });

async function screenshot(page, url, filename) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  // Wait for challenge if needed
  for (let i = 0; i < 30; i++) {
    const title = await page.title().catch(() => '');
    if (title !== 'Robot Challenge Screen') break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${filename}.png`, fullPage: false });
  console.log(`Captured: ${filename}.png`);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  for (const { path, name } of PAGES) {
    await screenshot(page, LIVE + path, `live-${name}`);
    await screenshot(page, VERCEL + path, `vercel-${name}`);
  }

  await browser.close();
  console.log(`\nScreenshots saved to ${OUT}/`);
  console.log('Files:', fs.readdirSync(OUT).join(', '));
}

main().catch(console.error);
