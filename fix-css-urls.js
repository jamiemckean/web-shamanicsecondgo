// Fix absolute URLs in et-cache CSS files and suppress the popup on all pages
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const url = require('url');

const SITE = path.join(__dirname, 'site');

// ─── 1. Fix CSS files ────────────────────────────────────────────────────────

function fixCssFile(cssPath) {
  let css = fs.readFileSync(cssPath, 'utf8');
  const cssDir = path.dirname(cssPath);
  let changed = false;

  css = css.replace(/url\((https?:\/\/shamanictrekker\.com\/([^)'"]+))\)/g, (match, fullUrl, assetPath) => {
    // Build local path: assets/shamanictrekker.com/<assetPath>
    const localAssetPath = path.join(SITE, 'assets', 'shamanictrekker.com', assetPath.split('?')[0]);

    if (fs.existsSync(localAssetPath)) {
      const rel = path.relative(cssDir, localAssetPath);
      changed = true;
      return `url(${rel})`;
    }
    // File not local — return unchanged (will still load from live CDN)
    return match;
  });

  if (changed) {
    fs.writeFileSync(cssPath, css);
    return true;
  }
  return false;
}

console.log('Fixing CSS files...');
const cssFiles = [];
function walkCss(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walkCss(full);
    else if (entry.endsWith('.css')) cssFiles.push(full);
  }
}
walkCss(path.join(SITE, 'assets'));

let fixed = 0;
for (const f of cssFiles) {
  if (fixCssFile(f)) {
    fixed++;
    console.log(`  Fixed: ${f.replace(SITE + '/', '')}`);
  }
}
console.log(`CSS files fixed: ${fixed}\n`);

// ─── 2. Download any missing images referenced in CSS ─────────────────────────

async function downloadMissingImages() {
  // Collect all image URLs still pointing to shamanictrekker.com across all CSS
  // (after fix, remaining ones are images we don't have locally)
  const missing = new Set();
  for (const f of cssFiles) {
    const css = fs.readFileSync(f, 'utf8');
    const matches = css.matchAll(/url\((https?:\/\/shamanictrekker\.com\/([^)'"\s]+))\)/g);
    for (const m of matches) missing.add(m[1]);
  }

  if (missing.size === 0) {
    console.log('No missing CSS images to download.\n');
    return;
  }

  console.log(`Downloading ${missing.size} missing images via browser...`);
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

  // Warm up with homepage to get past challenge cookie
  console.log('  Warming up...');
  await page.goto('https://shamanictrekker.com/', { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < 30; i++) {
    const t = await page.title().catch(() => '');
    if (t !== 'Robot Challenge Screen') break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);

  for (const imgUrl of missing) {
    const parsed = new url.URL(imgUrl);
    const localPath = path.join(SITE, 'assets', 'shamanictrekker.com', parsed.pathname);
    if (fs.existsSync(localPath)) continue;

    console.log(`  Fetching: ${parsed.pathname}`);
    try {
      const response = await page.evaluate(async (u) => {
        const r = await fetch(u);
        if (!r.ok) return null;
        const buf = await r.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      }, imgUrl);

      if (response) {
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, Buffer.from(response));
        console.log(`    Saved.`);
      }
    } catch (e) {
      console.log(`    Error: ${e.message}`);
    }
  }

  await browser.close();

  // Re-run CSS fix now that images are downloaded
  console.log('\nRe-fixing CSS files with newly downloaded images...');
  for (const f of cssFiles) fixCssFile(f);
}

// ─── 3. Suppress popup on all HTML pages ─────────────────────────────────────

const POPUP_SUPPRESS = `
<script>
/* Suppress eBook popup on static site */
(function() {
  // Set a cookie so the popup thinks it's been shown already
  document.cookie = 'pum-2105=true; path=/; max-age=31536000';
  document.cookie = 'pum-1=true; path=/; max-age=31536000';
  // Override DiviArea to block all popups from opening
  window.addEventListener('DOMContentLoaded', function() {
    if (window.DiviArea) {
      window.DiviArea.addFilter('show_popup', function() { return false; });
    }
    // Also hide any popup sections directly
    document.querySelectorAll('.et_pb_section.popup, .da-popup-container, .pum-overlay').forEach(function(el) {
      el.style.display = 'none';
    });
  });
})();
</script>`;

console.log('\nSuppressing popup on all HTML pages...');
function walkHtml(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && entry !== 'assets') walkHtml(full);
    else if (entry.endsWith('.html')) {
      let html = fs.readFileSync(full, 'utf8');
      if (!html.includes('Suppress eBook popup')) {
        html = html.replace('</head>', POPUP_SUPPRESS + '\n</head>');
        fs.writeFileSync(full, html);
        console.log(`  Patched: ${full.replace(SITE + '/', '')}`);
      }
    }
  }
}
walkHtml(SITE);

// Run async part
downloadMissingImages().then(() => {
  console.log('\n=== All done! ===');
}).catch(console.error);
