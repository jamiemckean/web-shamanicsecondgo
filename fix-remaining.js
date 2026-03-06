// Fix remaining issues in static site HTML files:
// 1. &quot; encoding bug in img src attributes
// 2. data-et-multi-view JSON with absolute URLs (prevents Divi JS from overwriting local src)
// 3. href="assets/shamanictrekker.com" broken home links
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, 'site');
const ASSETS = path.join(SITE, 'assets', 'shamanictrekker.com');

let totalPatched = 0;

function patchFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  const rel = filePath.replace(SITE + '/', '');

  // 1. Fix &quot; in src attributes: src="...something&quot;"
  //    This happens when an HTML-entity quote appears inside the src
  const before1 = html;
  html = html.replace(/src="([^"]*?)&quot;"/g, (match, p1) => {
    // p1 is the path (possibly with trailing junk before &quot;)
    // The actual src ends at &quot; - so remove the &quot; suffix
    const clean = p1.replace(/&quot;$/, '');
    return `src="${clean}"`;
  });
  if (html !== before1) {
    console.log(`  [&quot; fix] ${rel}`);
    changed = true;
  }

  // 2. Remove data-et-multi-view attribute from img tags
  //    Divi's JS reads this to swap src between desktop/tablet/phone viewports.
  //    The JSON still contains absolute URLs; removing prevents JS from overwriting our local srcs.
  const before2 = html;
  html = html.replace(/\s+data-et-multi-view="[^"]*"/g, '');
  if (html !== before2) {
    console.log(`  [et-multi-view removed] ${rel}`);
    changed = true;
  }

  // 3. Fix broken home link href="assets/shamanictrekker.com" → href="/"
  //    (happens because the scraper converted https://shamanictrekker.com href to a local path)
  const before3 = html;
  // From root index.html: href="assets/shamanictrekker.com" → href="/"
  // From subpages like about/index.html: href="../assets/shamanictrekker.com" → href="/"
  html = html.replace(/href="(\.\.\/)*assets\/shamanictrekker\.com"/g, 'href="/"');
  if (html !== before3) {
    console.log(`  [home link fix] ${rel}`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, html);
    totalPatched++;
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && entry !== 'assets') walk(full);
    else if (entry.endsWith('.html')) patchFile(full);
  }
}

console.log('Fixing remaining HTML issues...\n');
walk(SITE);
console.log(`\nDone. Patched ${totalPatched} files.`);
