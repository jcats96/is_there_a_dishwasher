/**
 * content.js — Is There a Dishwasher? browser extension
 *
 * Runs on document_idle for every https://www.zillow.com/homedetails/* page.
 * 1. Parses listing data from the __NEXT_DATA__ JSON blob already in the DOM.
 * 2. Runs an instant text check for "dishwasher".
 * 3. Shows a badge overlay with the result (or "Checking…" while vision runs).
 * 4. Sends the listing data to the background service worker, which persists
 *    the row and optionally runs a vision check via the Hugging Face Inference API.
 * 5. Updates the badge once the background replies with a final result.
 */

// ---------------------------------------------------------------------------
// Parse the Zillow __NEXT_DATA__ blob from the current page
// ---------------------------------------------------------------------------

function parseListingData() {
  const script = document.getElementById('__NEXT_DATA__');
  if (!script) return null;

  let nextData;
  try {
    nextData = JSON.parse(script.textContent);
  } catch {
    return null;
  }

  // Zillow stores listing data under props.pageProps.gdpClientCache
  const cache = nextData?.props?.pageProps?.gdpClientCache ?? {};
  const key = Object.keys(cache)[0];
  const prop = cache[key]?.property ?? {};

  if (!prop.zpid) return null;

  const amenities = [];
  (prop.resoFacts?.atAGlanceFacts ?? []).forEach(f => {
    if (f.factValue) amenities.push(f.factValue);
  });
  (prop.resoFacts?.appliances ?? []).forEach(a => amenities.push(a));

  return {
    zpid:        String(prop.zpid),
    url:         location.href,
    address:     prop.address?.streetAddress ?? '',
    city:        prop.address?.city ?? '',
    state:       prop.address?.state ?? '',
    price:       prop.price ?? null,
    beds:        prop.bedrooms ?? null,
    baths:       prop.bathrooms ?? null,
    description: prop.description ?? '',
    amenities:   amenities,
    imageUrls:   extractImageUrls(prop),
    visitedAt:   new Date().toISOString(),
  };
}

function extractImageUrls(prop) {
  function pickUrl(photo) {
    return photo.mixedSources?.jpeg?.[0]?.url ?? photo.url ?? null;
  }

  let urls = (prop.photos ?? []).map(pickUrl).filter(Boolean);

  // Fallback: responsivePhotos
  if (urls.length === 0) {
    urls = (prop.responsivePhotos ?? []).map(pickUrl).filter(Boolean);
  }

  return urls;
}

// ---------------------------------------------------------------------------
// Stage 1: text check (synchronous, < 5 ms)
// ---------------------------------------------------------------------------

function checkText(listing) {
  const haystack = [listing.description, ...listing.amenities].join(' ');
  const match = haystack.match(/dishwasher/i);
  if (!match) {
    return { has_dishwasher: false, method: 'text', evidence: null };
  }

  const idx = match.index;
  const start = Math.max(0, idx - 80);
  const end = Math.min(haystack.length, idx + match[0].length + 80);
  const snippet = haystack.slice(start, end).replace(/\s+/g, ' ').trim();
  const evidence =
    (start > 0 ? '\u2026' : '') + snippet + (end < haystack.length ? '\u2026' : '');

  return { has_dishwasher: true, method: 'text', evidence };
}

// ---------------------------------------------------------------------------
// Badge overlay injected into the Zillow page
// ---------------------------------------------------------------------------

const BADGE_ID = 'dishwasher-ext-badge';

function showBadge(status) {
  let badge = document.getElementById(BADGE_ID);
  if (!badge) {
    badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.style.cssText = [
      'position: fixed',
      'bottom: 20px',
      'right: 20px',
      'z-index: 2147483647',
      'padding: 10px 16px',
      'border-radius: 24px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'font-size: 14px',
      'font-weight: 600',
      'line-height: 1.4',
      'box-shadow: 0 4px 16px rgba(0,0,0,0.25)',
      'cursor: default',
      'user-select: none',
      'transition: background 0.2s, color 0.2s',
    ].join('; ');
    document.body.appendChild(badge);
  }

  const styles = {
    checking: { bg: '#1565C0', color: '#fff', text: '⏳ Checking for dishwasher…' },
    yes_text:  { bg: '#2E7D32', color: '#fff', text: '✅ Dishwasher: Yes (text)' },
    yes_vision:{ bg: '#2E7D32', color: '#fff', text: '✅ Dishwasher: Yes (photo)' },
    no:        { bg: '#B71C1C', color: '#fff', text: '❌ Dishwasher: Not found' },
    error:     { bg: '#5D4037', color: '#fff', text: '⚠️ Dishwasher check failed' },
  };

  const s = styles[status] ?? styles.error;
  badge.style.background = s.bg;
  badge.style.color = s.color;
  badge.textContent = s.text;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const listing = parseListingData();
if (listing) {
  const textResult = checkText(listing);

  // Show an immediate result for text hits; show "Checking…" if we need vision
  if (textResult.has_dishwasher) {
    showBadge('yes_text');
  } else if (listing.imageUrls.length > 0) {
    showBadge('checking');
  } else {
    showBadge('no');
  }

  // Send the listing data + text result to the background service worker.
  // The background will persist the row and optionally run a vision check.
  chrome.runtime.sendMessage(
    {
      type: 'PROCESS_LISTING',
      listing,
      textResult,
    },
    (response) => {
      if (chrome.runtime.lastError) return; // extension was reloaded; ignore

      if (!response) return;

      if (response.has_dishwasher && response.method === 'vision') {
        showBadge('yes_vision');
      } else if (response.has_dishwasher) {
        showBadge('yes_text');
      } else {
        showBadge('no');
      }
    },
  );
}
