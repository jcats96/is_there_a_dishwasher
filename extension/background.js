/**
 * background.js — Is There a Dishwasher? browser extension (service worker)
 *
 * Handles messages from content.js:
 *  - PROCESS_LISTING: persists the row to chrome.storage.local and optionally
 *    calls the Hugging Face Inference API (Stage 2) if a token is stored and the
 *    text check drew a blank.
 *
 * Storage schema (chrome.storage.local):
 *  - "rows": Array of ListingRow objects, deduplicated by zpid
 *  - "hf_token": string | undefined
 *  - "max_images": number (default 10)
 *
 * ListingRow:
 *  { zpid, url, address, city, state, price, beds, baths,
 *    has_dishwasher, method, evidence, visitedAt, imageUrls }
 */

const DEFAULT_MAX_IMAGES = 10;
const MODEL = 'openbmb/MiniCPM-V-2';
const HF_ENDPOINT = `https://router.huggingface.co/models/${MODEL}/v1/chat/completions`;
const PROMPT = 'Does this photo show a dishwasher? Answer with exactly one word: yes or no.';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function getRows() {
  const data = await chrome.storage.local.get('rows');
  return data.rows ?? [];
}

async function upsertRow(row) {
  const rows = await getRows();
  const idx = rows.findIndex(r => r.zpid === row.zpid);
  if (idx >= 0) {
    rows[idx] = row;
  } else {
    rows.unshift(row);          // newest first
  }
  await chrome.storage.local.set({ rows });
}

async function getHfToken() {
  const data = await chrome.storage.local.get('hf_token');
  return data.hf_token ?? null;
}

async function getMaxImages() {
  const data = await chrome.storage.local.get('max_images');
  return typeof data.max_images === 'number' ? data.max_images : DEFAULT_MAX_IMAGES;
}

// ---------------------------------------------------------------------------
// Stage 2: Vision check via Hugging Face Inference API
// ---------------------------------------------------------------------------

async function checkImageForDishwasher(imageUrl, hfToken) {
  const res = await fetch(HF_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${hfToken}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
            {
              type: 'text',
              text: PROMPT,
            },
          ],
        },
      ],
      max_tokens: 5,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 401 || res.status === 403) {
    const err = new Error('Invalid Hugging Face API token.');
    err.isAuthError = true;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Hugging Face API error (HTTP ${res.status}).`);
  }

  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content ?? '';
  return /\byes\b/i.test(answer);
}

async function runVisionCheck(listing, hfToken) {
  const maxImages = await getMaxImages();
  const toCheck = listing.imageUrls.slice(0, maxImages);

  for (const imageUrl of toCheck) {
    try {
      const found = await checkImageForDishwasher(imageUrl, hfToken);
      if (found) {
        return { has_dishwasher: true, method: 'vision', evidence: imageUrl };
      }
    } catch (err) {
      if (err.isAuthError) throw err;   // propagate bad-token errors
      // Network / model errors: skip this image and continue
    }
  }

  return { has_dishwasher: false, method: 'vision', evidence: null };
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'PROCESS_LISTING') return false;

  const { listing, textResult } = message;

  (async () => {
    let finalResult = textResult;

    // Stage 2: only run vision if text check drew a blank
    if (!textResult.has_dishwasher && listing.imageUrls.length > 0) {
      const hfToken = await getHfToken();
      if (hfToken) {
        try {
          finalResult = await runVisionCheck(listing, hfToken);
        } catch {
          // Vision unavailable — keep the text result
          finalResult = textResult;
        }
      }
    }

    // Persist the row (upsert by zpid)
    const row = {
      zpid:        listing.zpid,
      url:         listing.url,
      address:     listing.address,
      city:        listing.city,
      state:       listing.state,
      price:       listing.price,
      beds:        listing.beds,
      baths:       listing.baths,
      has_dishwasher: finalResult.has_dishwasher,
      method:      finalResult.method,
      evidence:    finalResult.evidence,
      visitedAt:   listing.visitedAt,
    };

    await upsertRow(row);

    sendResponse(finalResult);
  })();

  return true;  // keep the message channel open for the async response
});
