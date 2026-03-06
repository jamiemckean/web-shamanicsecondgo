const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const url = require('url');

const BASE_URL = 'https://shamanictrekker.com';
const OUT_DIR = path.join(__dirname, 'site');

const KNOWN_PAGES = [
  '/',
  '/about/',
  '/stones-and-crystals/',
  '/discover/',
  '/sessions/',
  '/shadow-work/',
  '/personal-spiritual-retreat/',
  '/natural-trauma-release-method/',
  '/images/',
  '/film/',
  '/blog/',
  '/contact/',
  '/shamanic-training/',
];

const SKIP_PATTERNS = [
  /wp-login\.php/,
  /wp-admin/,
  /xmlrpc\.php/,
  /\/feed\//,
  /\?replytocom/,
  /\/wp-json\//,
  /\.well-known/,
  /sgcaptcha/,
];

// Track state
const visitedPages = new Set();
const savedAssets = new Set();

function urlToLocalPath(rawUrl, isPage = false) {
  try {
    const parsed = new url.URL(rawUrl);
    let p = parsed.pathname;

    if (isPage) {
      // Strip query/hash for page paths
      if (p === '/' || p === '') return 'index.html';
      if (p.endsWith('/')) p += 'index.html';
      else if (!path.extname(p)) p += '.html';
      return p.startsWith('/') ? p.slice(1) : p;
    } else {
      // Assets keep full host in path
      const hostPath = path.join(parsed.hostname, p);
      return path.join('assets', hostPath);
    }
  } catch {
    return null;
  }
}

function shouldSkipUrl(rawUrl) {
  return SKIP_PATTERNS.some(p => p.test(rawUrl));
}

function isInternalPage(rawUrl) {
  try {
    const parsed = new url.URL(rawUrl);
    return parsed.hostname === 'shamanictrekker.com' &&
      !rawUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|ico|pdf|docx?|zip|mp4|webm|woff2?|ttf|otf|css|js)(\?|$)/i);
  } catch {
    return false;
  }
}

function isAsset(rawUrl) {
  return rawUrl.match(/\.(jpg|jpeg|png|gif|webp|svg|ico|pdf|docx?|woff2?|ttf|otf|css|js|mp4|webm)(\?|$)/i) ||
    rawUrl.includes('/wp-content/') ||
    rawUrl.includes('/wp-includes/') ||
    rawUrl.includes('fonts.gstatic') ||
    rawUrl.includes('fonts.googleapis') ||
    rawUrl.includes('cdn.') ||
    rawUrl.includes('static.');
}

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
  } catch (e) {
    // Ignore errors for individual assets
  }
}

async function rewriteHtml(htmlPath) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  const pageDir = path.dirname(htmlPath);

  // Find all URLs in HTML and replace with relative paths if we have a local copy
  const urlPattern = /(?:href|src|srcset|url|action)=["']([^"']+)["']/g;

  html = html.replace(urlPattern, (match, rawUrl) => {
    // Handle srcset (space-separated list)
    if (match.startsWith('srcset=')) {
      const parts = rawUrl.split(',').map(part => {
        const [u, ...rest] = part.trim().split(/\s+/);
        const localPath = urlToLocalPath(u, false);
        if (localPath) {
          const fullPath = path.join(OUT_DIR, localPath);
          if (fs.existsSync(fullPath)) {
            const rel = path.relative(pageDir, fullPath);
            return [rel, ...rest].join(' ');
          }
        }
        return part;
      });
      return `srcset="${parts.join(', ')}"`;
    }

    const localPath = urlToLocalPath(rawUrl, false);
    if (!localPath) return match;

    const fullPath = path.join(OUT_DIR, localPath);
    if (!fs.existsSync(fullPath)) return match;

    const attr = match.split('=')[0];
    const rel = path.relative(pageDir, fullPath);
    return `${attr}="${rel}"`;
  });

  // Also rewrite shamanictrekker.com page links to local .html files
  html = html.replace(/(href)=["'](https?:\/\/shamanictrekker\.com\/([^"'?#]*))["']/g, (match, attr, full, p) => {
    if (shouldSkipUrl(full)) return match;
    const localPath = urlToLocalPath(full, true);
    if (!localPath) return match;
    const fullLocalPath = path.join(OUT_DIR, localPath);
    if (fs.existsSync(fullLocalPath)) {
      const rel = path.relative(pageDir, fullLocalPath);
      return `${attr}="${rel}"`;
    }
    return match;
  });

  fs.writeFileSync(htmlPath, html);
}

async function scrapePage(context, pageUrl) {
  if (visitedPages.has(pageUrl) || shouldSkipUrl(pageUrl)) return [];
  visitedPages.add(pageUrl);

  const localPagePath = urlToLocalPath(pageUrl, true);
  if (!localPagePath) return [];

  const outPath = path.join(OUT_DIR, localPagePath);
  const links = [];

  console.log(`\nScraping: ${pageUrl}`);

  const page = await context.newPage();

  // Intercept ALL responses to save assets
  page.on('response', async (response) => {
    const reqUrl = response.url();
    const status = response.status();
    if (status < 200 || status >= 400) return;
    if (isAsset(reqUrl)) {
      await saveAsset(response, reqUrl);
    }
  });

  try {
    await page.goto(pageUrl, { waitUntil: 'load', timeout: 60000 });

    // Wait for any robot/PoW challenge to resolve (site uses a JS proof-of-work captcha)
    let attempts = 0;
    while (attempts < 60) {
      const title = await page.title().catch(() => '');
      const url = page.url();
      if (
        title !== 'Robot Challenge Screen' &&
        !url.includes('sgcaptcha') &&
        !url.includes('.well-known/captcha')
      ) break;
      await page.waitForTimeout(1000);
      attempts++;
    }

    // Wait for actual page content to settle
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);
  } catch (e) {
    if (!e.message.includes('Download is starting')) {
      console.log(`  Timeout/warning: continuing...`);
    }
  }

  // Collect internal links
  try {
    const found = await page.evaluate((base) => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => {
          try { return new URL(a.href).href; } catch { return null; }
        })
        .filter(h => h && h.startsWith(base));
    }, BASE_URL);
    links.push(...found);
  } catch {}

  // Save rendered HTML
  try {
    const title = await page.title().catch(() => '');
    const html = await page.content();
    if (html && html.length > 500 && title !== 'Robot Challenge Screen') {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html);
      console.log(`  Saved: ${localPagePath} (${title})`);
    } else {
      console.log(`  Skipped (challenge page or empty): ${localPagePath}`);
    }
  } catch (e) {
    console.log(`  Error saving page: ${e.message}`);
  }

  await page.close();
  return links;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Launching Chrome...');
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const queue = [...KNOWN_PAGES.map(p => BASE_URL + p)];
  const seen = new Set(queue);

  while (queue.length > 0) {
    const pageUrl = queue.shift();
    const links = await scrapePage(context, pageUrl);

    for (const link of links) {
      const clean = link.split('#')[0].split('?')[0];
      if (!seen.has(clean) && isInternalPage(clean) && !shouldSkipUrl(clean)) {
        seen.add(clean);
        queue.push(clean);
      }
    }
  }

  await browser.close();

  // Rewrite all HTML files to use local asset paths
  console.log('\nRewriting links in HTML files...');
  function walkAndRewrite(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        walkAndRewrite(full);
      } else if (entry.endsWith('.html')) {
        rewriteHtml(full);
        console.log(`  Rewrote: ${full.replace(OUT_DIR + '/', '')}`);
      }
    }
  }
  walkAndRewrite(OUT_DIR);

  console.log('\n=== Done! ===');
  console.log(`Pages: ${visitedPages.size}`);
  console.log(`Assets: ${savedAssets.size}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch(console.error);
