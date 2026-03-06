// Download all missing images referenced in HTML files and fix the src/srcset URLs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, 'site');
const ASSETS = path.join(SITE, 'assets', 'shamanictrekker.com');

// ─── 1. Collect all missing image URLs from HTML files ────────────────────────

const missing = new Set();

function walkHtml(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && entry !== 'assets') walkHtml(full);
    else if (entry.endsWith('.html')) {
      const html = fs.readFileSync(full, 'utf8');
      // Match src="https://shamanictrekker.com/..." and srcset entries
      const re = /https?:\/\/shamanictrekker\.com\/(wp-content\/uploads\/[^\s"'&)>]+)/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const assetPath = m[1].split('?')[0];
        const localPath = path.join(ASSETS, assetPath);
        if (!fs.existsSync(localPath)) {
          missing.add('https://shamanictrekker.com/' + assetPath);
        }
      }
    }
  }
}

console.log('Scanning HTML files for missing images...');
walkHtml(SITE);
console.log(`Found ${missing.size} missing images.\n`);

if (missing.size === 0) {
  console.log('Nothing to download.');
  process.exit(0);
}

// ─── 2. Download via Playwright ───────────────────────────────────────────────

async function download() {
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  // Warm up to get past challenge cookie
  console.log('Warming up (solving challenge)...');
  await page.goto('https://shamanictrekker.com/', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 60; i++) {
    const t = await page.title().catch(() => '');
    const u = page.url();
    if (t !== 'Robot Challenge Screen' && !u.includes('sgcaptcha') && !u.includes('.well-known/captcha')) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);
  console.log('Challenge passed.\n');

  let saved = 0;
  let failed = 0;

  for (const imgUrl of missing) {
    const assetPath = imgUrl.replace('https://shamanictrekker.com/', '');
    const localPath = path.join(ASSETS, assetPath);
    if (fs.existsSync(localPath)) continue;

    process.stdout.write(`  ${assetPath} ... `);
    try {
      const bytes = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) return null;
        const buf = await r.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      }, imgUrl);

      if (bytes && bytes.length > 0) {
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, Buffer.from(bytes));
        process.stdout.write(`saved (${bytes.length} bytes)\n`);
        saved++;
      } else {
        process.stdout.write('empty/null response\n');
        failed++;
      }
    } catch (e) {
      process.stdout.write(`ERROR: ${e.message}\n`);
      failed++;
    }
  }

  await browser.close();
  console.log(`\nDone: ${saved} saved, ${failed} failed.`);
}

// ─── 3. Patch HTML files to use relative paths ───────────────────────────────

function patchHtmlFiles() {
  console.log('\nPatching HTML files to use relative paths...');
  let totalFixed = 0;

  function walkHtmlPatch(dir, htmlDir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && entry !== 'assets') walkHtmlPatch(full, path.join(htmlDir, entry));
      else if (entry.endsWith('.html')) {
        let html = fs.readFileSync(full, 'utf8');
        let changed = false;

        html = html.replace(
          /https?:\/\/shamanictrekker\.com\/(wp-content\/uploads\/[^\s"'&)>]+)/g,
          (match, assetPath) => {
            const clean = assetPath.split('?')[0];
            const localPath = path.join(ASSETS, clean);
            if (fs.existsSync(localPath)) {
              const rel = path.relative(path.dirname(full), localPath);
              changed = true;
              return rel;
            }
            return match; // not downloaded, leave absolute
          }
        );

        if (changed) {
          fs.writeFileSync(full, html);
          totalFixed++;
        }
      }
    }
  }

  walkHtmlPatch(SITE, SITE);
  console.log(`Patched ${totalFixed} HTML files.\n`);
}

download()
  .then(() => {
    patchHtmlFiles();
    console.log('=== All done! ===');
  })
  .catch(console.error);
