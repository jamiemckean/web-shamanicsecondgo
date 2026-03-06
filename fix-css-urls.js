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

// CSS injected into <head> to nuke popups before any JS runs
const POPUP_CSS = `<style id="popup-suppress">
/* Static site: hide all Divi popups */
.et_pb_section.popup,
.area-outer-wrap[data-da-type="popup"],
.da-overlay,
.pum-overlay,
.da-popup-container { display: none !important; visibility: hidden !important; }
</style>`;

function suppressPopupInHtml(html) {
  // 1. Inject CSS at start of <head>
  html = html.replace('<head>', '<head>\n' + POPUP_CSS);

  // 2. Remove 'da-popup-visible' and 'da-overlay-visible' from <body> class
  html = html.replace(/(<body[^>]*class="[^"]*)\bda-popup-visible\b/g, '$1');
  html = html.replace(/(<body[^>]*class="[^"]*)\bda-overlay-visible\b/g, '$1');

  // 3. Remove 'is-open' class from popup sections
  html = html.replace(/(class="[^"]*\bpopup\b[^"]*)\bis-open\b/g, '$1');

  // 4. Neutralise the DiviArea.show() call that re-opens the popup
  //    Pattern: DiviArea.addAction('ready', function () { ... DiviArea.show(popupId); ... });
  html = html.replace(
    /DiviArea\.addAction\('ready'[\s\S]*?DiviArea\.show\(popupId\)[\s\S]*?\}\s*\);/g,
    '/* popup auto-open disabled on static site */'
  );

  // 5. Hide the overlay div inline styles (belt-and-suspenders)
  html = html.replace(
    /(<div[^>]*class="da-overlay[^"]*"[^>]*)(style="[^"]*")/g,
    '$1style="display:none!important;"'
  );
  html = html.replace(
    /(<div[^>]*class="da-overlay[^"]*")(?!\s+style=)/g,
    '$1 style="display:none!important;"'
  );

  return html;
}

console.log('\nSuppressing popup on all HTML pages...');
function walkHtml(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && entry !== 'assets') walkHtml(full);
    else if (entry.endsWith('.html')) {
      let html = fs.readFileSync(full, 'utf8');
      // Re-apply every time (idempotent since we check for duplicates via CSS id)
      if (html.includes('popup-suppress')) {
        // Already has new suppressor; re-apply structural fixes only
        html = suppressPopupInHtml(html.replace(/<head>\n<style id="popup-suppress">[\s\S]*?<\/style>/, '<head>'));
      } else {
        // Remove old JS suppressor if present
        html = html.replace(/<script>\n\/\* Suppress eBook popup[\s\S]*?<\/script>/g, '');
        html = suppressPopupInHtml(html);
      }
      fs.writeFileSync(full, html);
      console.log(`  Patched: ${full.replace(SITE + '/', '')}`);
    }
  }
}
walkHtml(SITE);

// Run async part
downloadMissingImages().then(() => {
  console.log('\n=== All done! ===');
}).catch(console.error);
