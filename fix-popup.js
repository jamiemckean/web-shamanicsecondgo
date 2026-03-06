// Enable exit-intent popup on pages that have the ebook popup
const fs = require('fs');

const EXIT_INTENT_JS = `	(function () {
		// Exit-intent popup: show ebook popup when mouse leaves viewport from the top
		var STORAGE_KEY = 'st-ebook-popup-shown';
		if (sessionStorage.getItem(STORAGE_KEY)) return;

		var shown = false;
		function showPopup() {
			if (shown) return;
			shown = true;
			sessionStorage.setItem(STORAGE_KEY, '1');
			if (window.DiviArea && typeof DiviArea.show === 'function') {
				DiviArea.show('ebook');
			}
		}

		// Desktop: detect mouse leaving from the top of the viewport
		document.addEventListener('mouseleave', function (e) {
			if (e.clientY <= 0) showPopup();
		});

		// Mobile fallback: show after 45 seconds of browsing
		setTimeout(showPopup, 45000);

		// Close button handler
		document.addEventListener('click', function (e) {
			var btn = e.target.closest('.da-close, .evr-close');
			if (!btn) return;
			e.preventDefault();
			if (window.DiviArea && typeof DiviArea.close === 'function') {
				DiviArea.close('ebook');
			} else {
				var popup = document.getElementById('ebook');
				var overlay = document.querySelector('.da-overlay');
				if (popup) popup.classList.remove('is-open');
				if (overlay) overlay.style.display = 'none';
				document.body.classList.remove('da-popup-visible', 'da-overlay-visible');
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

  // 2. Restore overlay div (remove inline display:none)
  const before2 = html;
  html = html.replace(
    /<div class="da-overlay evr_fb_popup_modal" style="display:none!important;">/g,
    '<div class="da-overlay evr_fb_popup_modal">'
  );
  if (html !== before2) { console.log(`  [restored overlay] ${rel}`); changed = true; }

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
