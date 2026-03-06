// Re-scrape pages that were skipped due to PoW challenge timing
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const url = require('url');

const OUT_DIR = path.join(__dirname, 'site');

const MISSING_PAGES = [
  'https://shamanictrekker.com/',
  'https://shamanictrekker.com/about/',
  'https://shamanictrekker.com/stones-and-crystals/',
];

function urlToLocalPath(rawUrl, isPage = false) {
  try {
    const parsed = new url.URL(rawUrl);
    let p = parsed.pathname;
    if (isPage) {
      if (p === '/' || p === '') return 'index.html';
      if (p.endsWith('/')) p += 'index.html';
      else if (!path.extname(p)) p += '.html';
      return p.startsWith('/') ? p.slice(1) : p;
    } else {
      return path.join('assets', parsed.hostname, p);
    }
  } catch { return null; }
}

function isAsset(rawUrl) {
  return rawUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|ico|woff2?|ttf|otf|css|js|mp4|webm)(\?|$)/i) ||
    rawUrl.includes('/wp-content/') || rawUrl.includes('/wp-includes/') ||
    rawUrl.includes('fonts.gstatic') || rawUrl.includes('fonts.googleapis') ||
    rawUrl.includes('cdn.') || rawUrl.includes('static.');
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

function rewriteHtml(htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  const pageDir = path.dirname(htmlPath);

  html = html.replace(/(?:href|src|srcset|url|action)=["']([^"']+)["']/g, (match, rawUrl) => {
    const localPath = urlToLocalPath(rawUrl, false);
    if (!localPath) return match;
    const fullPath = path.join(OUT_DIR, localPath);
    if (!fs.existsSync(fullPath)) return match;
    const attr = match.split('=')[0];
    const rel = path.relative(pageDir, fullPath);
    return `${attr}="${rel}"`;
  });

  // Rewrite internal page links
  html = html.replace(/(href)=["'](https?:\/\/shamanictrekker\.com\/([^"'?#]*))["']/g, (match, attr, full, p) => {
    const localPath = urlToLocalPath(full, true);
    if (!localPath) return match;
    const fullLocalPath = path.join(OUT_DIR, localPath);
    if (fs.existsSync(fullLocalPath)) {
      const rel = path.relative(path.dirname(htmlPath), fullLocalPath);
      return `${attr}="${rel}"`;
    }
    return match;
  });

  fs.writeFileSync(htmlPath, html);
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

  // Intercept assets
  page.on('response', async (response) => {
    const reqUrl = response.url();
    if (response.status() >= 200 && response.status() < 400 && isAsset(reqUrl)) {
      await saveAsset(response, reqUrl);
    }
  });

  // First, warm up by solving the challenge on the homepage
  console.log('Warming up (solving PoW challenge on homepage)...');
  await page.goto('https://shamanictrekker.com/', { waitUntil: 'load', timeout: 60000 });

  // Wait up to 120s for challenge to resolve
  for (let i = 0; i < 120; i++) {
    const title = await page.title().catch(() => '');
    const currentUrl = page.url();
    if (title !== 'Robot Challenge Screen' && !currentUrl.includes('sgcaptcha') && !currentUrl.includes('.well-known/captcha')) {
      console.log(`Challenge solved after ${i}s! Title: "${title}"`);
      break;
    }
    if (i % 10 === 0) console.log(`  Waiting... ${i}s (${title})`);
    await page.waitForTimeout(1000);
  }

  // Wait for networkidle after challenge resolves
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Save homepage
  const title = await page.title().catch(() => '');
  const html = await page.content();
  if (title !== 'Robot Challenge Screen' && html.length > 1000) {
    const outPath = path.join(OUT_DIR, 'index.html');
    fs.writeFileSync(outPath, html);
    console.log(`Saved: index.html (${title})`);
  } else {
    console.log(`Homepage still showing challenge - skipping`);
  }

  // Now scrape the other missing pages (cookie should be set now)
  for (const pageUrl of MISSING_PAGES.slice(1)) {
    const localPagePath = urlToLocalPath(pageUrl, true);
    const outPath = path.join(OUT_DIR, localPagePath);

    if (fs.existsSync(outPath)) {
      console.log(`Already exists: ${localPagePath}`);
      continue;
    }

    console.log(`\nScraping: ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'load', timeout: 60000 });

    // Wait for any challenge
    for (let i = 0; i < 30; i++) {
      const t = await page.title().catch(() => '');
      const u = page.url();
      if (t !== 'Robot Challenge Screen' && !u.includes('sgcaptcha') && !u.includes('.well-known/captcha')) break;
      await page.waitForTimeout(1000);
    }

    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const t = await page.title().catch(() => '');
    const h = await page.content();
    if (t !== 'Robot Challenge Screen' && h.length > 1000) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, h);
      console.log(`  Saved: ${localPagePath} (${t})`);
    } else {
      console.log(`  Still challenge page - skipping`);
    }
  }

  await browser.close();

  // Rewrite links in the newly saved pages
  console.log('\nRewriting links...');
  for (const pageUrl of MISSING_PAGES) {
    const localPagePath = urlToLocalPath(pageUrl, true);
    const htmlPath = path.join(OUT_DIR, localPagePath);
    if (fs.existsSync(htmlPath)) {
      rewriteHtml(htmlPath);
      console.log(`  Rewrote: ${localPagePath}`);
    }
  }

  console.log(`\nDone! Assets downloaded: ${savedAssets.size}`);
}

main().catch(console.error);
