// add-uniform-css.js — Inject uniform.css link into all HTML pages
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, 'site');
const LINK_TAG = '<link rel="stylesheet" href="%PATH%assets/uniform.css" type="text/css" media="all">';

let total = 0;

function processFile(filePath) {
  if (filePath.includes('/shamanichealinginstitute.com/')) return;

  let html = fs.readFileSync(filePath, 'utf8');

  // Skip if already injected
  if (html.includes('uniform.css')) return;

  // Calculate relative path from this file to site root
  const rel = filePath.replace(SITE + '/', '');
  const depth = rel.split('/').length - 1; // index.html = 0 depth, about/index.html = 1
  const prefix = depth > 0 ? '../'.repeat(depth) : '';

  const link = LINK_TAG.replace('%PATH%', prefix);

  // Inject right before </head> so it loads LAST and overrides everything
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${link}\n</head>`);
  } else {
    console.log(`  WARN: no </head> in ${rel}`);
    return;
  }

  fs.writeFileSync(filePath, html);
  total++;
  console.log(`  [css] ${rel}`);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && entry !== 'assets') walk(full);
    else if (entry === 'index.html') processFile(full);
  }
}

console.log('Injecting uniform.css link...\n');
walk(SITE);
console.log(`\nDone. Updated ${total} files.`);
