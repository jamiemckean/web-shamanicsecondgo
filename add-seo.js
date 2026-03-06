// add-seo.js — Inject SEO/GEO meta tags into all static site HTML pages
// Does NOT change any page content, design, or on-page text.
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, 'site');
const BASE_URL = 'https://shamanictrekker.com';
const OG_IMAGE = `${BASE_URL}/wp-content/uploads/2022/04/Shamanic-Healing-For-Stress-John-Whitehorse-Santa-Monica-scaled-1.jpg`;

// ─── Page-specific meta descriptions ──────────────────────────────────────────

const DESCRIPTIONS = {
  '/': "Experience authentic Andean shamanic healing with John Whitehorse in New Mexico and Colorado. Personal healing sessions, shadow work, spiritual retreats, and shamanic training rooted in the Q'ero lineage.",
  '/about/': "Meet John Whitehorse and the Shamanic Trekker team. Authentic Andean shamanic healers bringing the Q'ero tradition of Peru to personal healing in New Mexico and Colorado.",
  '/sessions/': "Book a personal shamanic healing session with John Whitehorse. In-person sessions in New Mexico and remote sessions worldwide for soul retrieval, energy clearing, and spiritual guidance.",
  '/shamanic-training/': "Learn authentic Andean shamanic practices with John Whitehorse. Shamanic rites and initiations rooted in the Q'ero tradition — the living lineage of Peruvian mountain shamans.",
  '/training/': "Shamanic training in the Andean tradition with John Whitehorse. Experience the rites, initiations, and ceremonies of authentic Q'ero shamanism from the mountains of Peru.",
  '/natural-trauma-release-method/': "The Natural Trauma Release Method™ — a modern shamanic approach to healing trauma and feeling whole again, developed by John Whitehorse.",
  '/shadow-work/': "Shadow work counseling with John Whitehorse. Explore and integrate unconscious emotional patterns using shamanic methods for deep healing and transformation.",
  '/personal-spiritual-retreat/': "Personal spiritual retreats in New Mexico with John Whitehorse. Immerse in shamanic ceremony, land healing, and transformative spiritual practice in a sacred setting.",
  '/stones-and-crystals/': "Discover sacred stones and crystals used in shamanic healing traditions. Explore khuyas, Andean medicine bundles, and the spiritual significance of crystal healing.",
  '/discover/': "Book a free discovery session with John Whitehorse to explore how shamanic healing can support your journey toward wholeness, clarity, and lasting well-being.",
  '/contact/': "Contact Shamanic Trekker to book a session, ask questions, or learn more about shamanic healing and training with John Whitehorse in New Mexico and Colorado.",
  '/blog/': "Shamanic healing insights, teachings, and wisdom from John Whitehorse. Explore articles on energy healing, soul retrieval, shadow work, and Andean shamanism.",
  '/john-whitehorse/': "John Whitehorse is an experienced shamanic healer trained in the Q'ero Andean tradition. Learn about his healing path, practice, and approach to personal transformation.",
  '/photos/': "Photos from shamanic healing journeys, ceremonies, and spiritual retreats with John Whitehorse and Shamanic Trekker in New Mexico, Colorado, and Peru.",
  '/film/': "Shamanic Trekker film — documentary footage of shamanic healing journeys, Andean ceremonies, and spiritual retreats with John Whitehorse.",
  '/perufilm/': "Shamanic Trekker: Journey to the Source — a documentary following John Whitehorse to the mountains of Peru to study with Q'ero shamans.",
  '/ebook/': "Download the free eBook: Why You're Not Healing After Years of Therapy. Discover how shamanic energy healing addresses the root causes therapy can't reach.",
  '/therapy-ebook/': "Why You're Not Healing After Years of Therapy — a free eBook by John Whitehorse exploring the energetic roots of emotional patterns and shamanic healing.",
  '/the-missing-layer/': "Discover the missing layer in healing — the energetic dimension that therapy and conventional medicine often overlook, according to shamanic healing traditions.",
  '/discovery-call-with-john-whitehorse/': "Schedule a discovery call with John Whitehorse to explore how shamanic healing can help you release emotional blocks, heal trauma, and reconnect with your true self.",
  '/shamanic-training-rites-and-initiations-sign-up/': "Sign up for shamanic training rites and initiations with John Whitehorse. Learn the authentic Q'ero practices of the Andean tradition.",
};

// ─── GEO meta tags (New Mexico primary location) ──────────────────────────────

const GEO_BLOCK = `<meta name="geo.region" content="US-NM">
<meta name="geo.placename" content="New Mexico, USA">
<meta name="geo.position" content="34.5199;-105.8701">
<meta name="ICBM" content="34.5199, -105.8701">`;

// ─── Homepage JSON-LD structured data ─────────────────────────────────────────

const HOME_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": "https://shamanictrekker.com/#business",
  "name": "Shamanic Trekker",
  "description": "Personal shamanic healing and training in New Mexico and Colorado with John Whitehorse, rooted in the Q'ero Andean tradition.",
  "url": "https://shamanictrekker.com",
  "image": OG_IMAGE,
  "address": {
    "@type": "PostalAddress",
    "addressRegion": "NM",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 34.5199,
    "longitude": -105.8701
  },
  "areaServed": [
    { "@type": "State", "name": "New Mexico" },
    { "@type": "State", "name": "Colorado" }
  ],
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "Shamanic Services",
    "itemListElement": [
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Shamanic Healing Sessions" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Shadow Work Counseling" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Personal Spiritual Retreat" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Shamanic Training & Initiations" } },
      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Natural Trauma Release Method" } }
    ]
  },
  "sameAs": []
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escape(str) {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cleanTitle(raw) {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function getDesc(url, title) {
  if (DESCRIPTIONS[url]) return DESCRIPTIONS[url];
  // Blog post fallback: use title + site tagline
  const t = cleanTitle(title).replace(/\|.*$/, '').trim();
  return `${t} — Shamanic Trekker. Insights on shamanic healing, energy work, and spiritual growth from John Whitehorse.`;
}

function buildSeoBlock(url, rawTitle, desc, isHome, is404) {
  if (is404) {
    return '<meta name="robots" content="noindex, follow">';
  }

  const fullUrl = BASE_URL + url;
  const t = escape(cleanTitle(rawTitle).replace(/\|.*$/, '').trim());
  const d = escape(desc);

  const lines = [
    `<meta name="description" content="${d}">`,
    `<meta property="og:type" content="${isHome ? 'website' : 'article'}">`,
    `<meta property="og:url" content="${fullUrl}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    `<meta property="og:site_name" content="Shamanic Trekker">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${OG_IMAGE}">`,
    GEO_BLOCK,
  ];

  if (isHome) {
    lines.push(`<script type="application/ld+json">\n${JSON.stringify(HOME_SCHEMA, null, 2)}\n</script>`);
  }

  return lines.join('\n');
}

// ─── Main walk ────────────────────────────────────────────────────────────────

let total = 0;

function processFile(filePath) {
  // Skip different-domain pages
  if (filePath.includes('/shamanichealinginstitute.com/')) return;

  let html = fs.readFileSync(filePath, 'utf8');

  // Skip if already injected
  if (html.includes('<meta name="description"') || html.includes('og:type')) return;

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  if (!titleMatch) return;

  const rawTitle = titleMatch[1];
  const is404 = rawTitle.includes('404');

  // Derive the URL path
  const rel = filePath
    .replace(SITE, '')
    .replace(/\/index\.html$/, '/')
    || '/';
  const url = rel || '/';
  const isHome = url === '/';

  const desc = is404 ? '' : getDesc(url, rawTitle);
  const seoBlock = buildSeoBlock(url, rawTitle, desc, isHome, is404);

  // Fix canonical URLs from relative to absolute
  html = html
    .replace(/<link rel="canonical" href="\/">/g, `<link rel="canonical" href="${BASE_URL}/">`)
    .replace(/<link rel="canonical" href="\/([^"]+)">/g, `<link rel="canonical" href="${BASE_URL}/$1">`);

  // Inject SEO block immediately after </title>
  html = html.replace(/<\/title>/, `</title>\n${seoBlock}`);

  fs.writeFileSync(filePath, html);
  total++;
  console.log(`  [seo] ${url}`);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (entry === 'index.html') processFile(full);
  }
}

console.log('Adding SEO/GEO meta tags...\n');
walk(SITE);
console.log(`\nDone. Updated ${total} files.`);
