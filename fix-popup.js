// Enable exit-intent popup on pages that have the ebook popup
const fs = require('fs');

const EXIT_INTENT_JS = `	(function () {
		// Exit-intent popup
		var STORAGE_KEY = 'st-ebook-popup-shown';
		var wrapper = document.querySelector('.area-outer-wrap[data-da-area="ebook"]');
		var overlay = document.querySelector('.da-overlay.evr_fb_popup_modal');

		function hide() {
			if (wrapper) wrapper.style.display = 'none';
			if (overlay) overlay.style.display = 'none';
			document.body.classList.remove('da-popup-visible', 'da-overlay-visible');
		}

		function show() {
			if (wrapper) wrapper.style.display = 'block';
			if (overlay) overlay.style.display = 'block';
			document.body.classList.add('da-popup-visible', 'da-overlay-visible');
		}

		// Hide immediately on page load (scraped HTML has popup in visible position)
		hide();

		if (sessionStorage.getItem(STORAGE_KEY)) return;

		var triggered = false;
		function trigger() {
			if (triggered) return;
			triggered = true;
			sessionStorage.setItem(STORAGE_KEY, '1');
			show();
		}

		// Desktop: detect mouse leaving from the top of the viewport
		document.addEventListener('mouseleave', function (e) {
			if (e.clientY <= 0) trigger();
		});

		// Mobile fallback: show after 45 seconds of browsing
		setTimeout(trigger, 45000);

		// Close on X button or overlay click
		document.addEventListener('click', function (e) {
			if (e.target.closest('.da-close, .evr-close') || e.target === overlay) {
				e.preventDefault();
				hide();
			}
		});
	})();`;

const PAGES = [
  'site/index.html',
  'site/about/index.html',
  'site/ebook/index.html',
  'site/therapy-ebook/index.html',
];

for (const rel of PAGES) {
  const full = require('path').join(__dirname, rel);
  if (!fs.existsSync(full)) { console.log(`SKIP (not found): ${rel}`); continue; }

  let html = fs.readFileSync(full, 'utf8');

  // Only process pages that actually have the ebook popup
  if (!html.includes('data-da-area="ebook"')) { console.log(`SKIP (no popup): ${rel}`); continue; }

  let changed = false;

  // 1. Remove popup-suppress CSS block
  const before1 = html;
  html = html.replace(/<style id="popup-suppress">[\s\S]*?<\/style>/g, '');
  if (html !== before1) { console.log(`  [removed popup-suppress] ${rel}`); changed = true; }

  // 2. Add display:none to wrapper and overlay inline styles (hides before JS runs)
  const before2 = html;
  html = html
    .replace(
      /(<div[^>]+area-outer-wrap[^>]+data-da-area="ebook"[^>]+style=")(?!display:none)/g,
      '$1display:none;'
    )
    .replace(
      /<div class="da-overlay evr_fb_popup_modal"(?! style="display:none)>/g,
      '<div class="da-overlay evr_fb_popup_modal" style="display:none;">'
    )
    // Remove old !important display:none that was previously set (now replaced by plain display:none)
    .replace(
      /<div class="da-overlay evr_fb_popup_modal" style="display:none!important;">/g,
      '<div class="da-overlay evr_fb_popup_modal" style="display:none;">'
    );
  if (html !== before2) { console.log(`  [hidden popup elements] ${rel}`); changed = true; }

  // 3. Replace disabled popup comment with exit-intent JS
  const before3 = html;
  html = html.replace(
    /\t\(function \(\) \{\n\t\t\/\* popup auto-open disabled on static site \*\/\n\t\}\)\(\);/g,
    EXIT_INTENT_JS
  );
  if (html !== before3) { console.log(`  [added exit-intent] ${rel}`); changed = true; }

  if (changed) {
    fs.writeFileSync(full, html);
    console.log(`  -> Saved: ${rel}`);
  } else {
    console.log(`  Already done: ${rel}`);
  }
}

console.log('\nDone.');
