// Scrape the Peru retreat page from a different domain
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const url = require('url');

const OUT_DIR = path.join(__dirname, 'site');
const PERU_URL = 'https://shamanichealinginstitute.com/peruretreat/';

function urlToLocalPath(rawUrl, isPage = false) {
  try {
    const parsed = new url.URL(rawUrl);
    let p = parsed.pathname;
    if (isPage) {
      if (p === '/' || p === '') return path.join(parsed.hostname, 'index.html');
      if (p.endsWith('/')) p += 'index.html';
      else if (!path.extname(p)) p += '.html';
      return path.join(parsed.hostname, p.startsWith('/') ? p.slice(1) : p);
    } else {
      return path.join('assets', parsed.hostname, p);
    }
  } catch { return null; }
}

function isAsset(rawUrl) {
  return rawUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf|otf|css|js|mp4|webm)(\?|$)/i) ||
    rawUrl.includes('/wp-content/') || rawUrl.includes('/wp-includes/');
}

const savedAssets = new Set();

async function saveAsset(response, rawUrl) {
  if (savedAssets.has(rawUrl)) return;
  savedAssets.add(rawUrl);
  const localPath = urlToLocalPath(rawUrl, false);
  if (!localPath) return;
  const fullPath = path.join(OUT_DIR, localPath);
  if (fs.existsSync(fullPath)) return;
  try {
    const body = await response.body();
    if (!body || body.length === 0) return;
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body);
  } catch {}
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1440,900'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  page.on('response', async (response) => {
    const reqUrl = response.url();
    if (response.status() >= 200 && response.status() < 400 && isAsset(reqUrl)) {
      await saveAsset(response, reqUrl);
    }
  });

  console.log(`Scraping: ${PERU_URL}`);
  await page.goto(PERU_URL, { waitUntil: 'load', timeout: 60000 });

  // Wait for any PoW challenge
  for (let i = 0; i < 120; i++) {
    const title = await page.title().catch(() => '');
    const currentUrl = page.url();
    if (title !== 'Robot Challenge Screen' && !currentUrl.includes('sgcaptcha') && !currentUrl.includes('.well-known/captcha')) {
      console.log(`Ready after ${i}s: "${title}"`);
      break;
    }
    if (i % 10 === 0) console.log(`  Waiting... ${i}s`);
    await page.waitForTimeout(1000);
  }

  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const title = await page.title().catch(() => '');
  const html = await page.content();

  if (title !== 'Robot Challenge Screen' && html.length > 1000) {
    const localPath = urlToLocalPath(PERU_URL, true);
    const outPath = path.join(OUT_DIR, localPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // Rewrite asset links to local paths
    const pageDir = path.dirname(outPath);
    let rewritten = html.replace(/(?:href|src|srcset|url|action)=["']([^"']+)["']/g, (match, rawUrl) => {
      const assetLocal = urlToLocalPath(rawUrl, false);
      if (!assetLocal) return match;
      const fullPath = path.join(OUT_DIR, assetLocal);
      if (!fs.existsSync(fullPath)) return match;
      const attr = match.split('=')[0];
      const rel = path.relative(pageDir, fullPath);
      return `${attr}="${rel}"`;
    });

    fs.writeFileSync(outPath, rewritten);
    console.log(`Saved: ${localPath} (${title})`);
  } else {
    console.log(`Failed - still on challenge page`);
  }

  await browser.close();
  console.log(`\nAssets downloaded: ${savedAssets.size}`);
}

main().catch(console.error);
