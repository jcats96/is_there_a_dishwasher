# Browser Extension Concept — "Is There a Dishwasher?" Spreadsheet Tracker

## 1. The Idea

Instead of (or in addition to) a standalone web app where users paste a URL,
ship a **Chrome / Edge / Firefox browser extension** that runs passively as
the user browses Zillow. Every listing page the user visits is automatically:

1. **Parsed in-browser** — no separate HTTP request is made; the data is already
   on the page.
2. **Checked for a dishwasher** — first by scanning the listing text, then (if
   the text is silent) by sending the listing photos to a vision API.
3. **Recorded in a running spreadsheet** — address, price, bedrooms, dishwasher
   status, and the evidence (text snippet or photo URL) are appended to a
   persistent table the user can review, filter, and export to CSV.

The user never leaves Zillow, never copies a URL, and ends each browsing
session with a ready-made comparison sheet of every listing they looked at.

---

## 2. How the Spreadsheet Idea Solves the Scraping Problem

The scraping problem with the current web app is not that fetching a page is
technically hard — it is that Zillow aggressively blocks requests originating
from cloud servers, and any automated crawl violates their Terms of Service.

A browser extension sidesteps both concerns entirely:

| Concern | Web App / Scraper | Browser Extension |
|---------|-------------------|-------------------|
| **Request origin** | Cloud server IP — easily flagged | User's own browser — indistinguishable from normal traffic |
| **Bot detection** | Cloudflare WAF blocks cloud IPs | No outbound request to Zillow at all; data already in the DOM |
| **Terms of Service** | Systematic crawling is prohibited | User is reading a page they already loaded; no automated crawl occurs |
| **Authentication / cookies** | Cannot access user's session | Has full access to the authenticated page the user is viewing |
| **Bot challenge pages** | CAPTCHAs halt the scraper | Never triggered; the user's browser passed all checks naturally |
| **JavaScript rendering** | Requires headless browser | DOM is fully rendered before the content script runs |

Because the extension reads data the user's browser has already fetched and
rendered, it is not scraping in any meaningful sense — it is parsing.

---

## 3. Technical Architecture

### 3.1 High-Level Flow

```
User navigates to a Zillow listing page
        │
        ▼
Content script fires on document_idle
        │
        ▼
Parse __NEXT_DATA__ JSON already in the DOM
  → extract: address, price, beds/baths, description,
             amenities list, photo URLs
        │
        ▼
Stage 1 — Text check (synchronous, in-page, < 5 ms)
  search description + amenities for "dishwasher" (case-insensitive)
        │
        ├── found
        │     → record row: { …listing, has_dishwasher: true,
        │                     method: "text", evidence: <snippet> }
        │     → show badge: "🍽️ Dishwasher: Yes"
        │
        └── not found
              │
              ▼
        Stage 2 — Vision check (async, requires API key)
          send photo URLs to Vision API one by one
                │
                ├── "yes" on image N
                │     → record row: { …listing, has_dishwasher: true,
                │                     method: "vision", evidence: <url> }
                │     → show badge: "🍽️ Dishwasher: Yes (photo)"
                │
                └── all images checked, none found
                      → record row: { …listing, has_dishwasher: false,
                                      method: "vision", evidence: null }
                      → show badge: "🚫 Dishwasher: No"
        │
        ▼
Append row to persistent spreadsheet (chrome.storage.local)
        │
        ▼
User can open extension popup to view table, filter, and export CSV
```

### 3.2 Extension Components

| Component | Technology | Responsibility |
|-----------|-----------|---------------|
| `manifest.json` (v3) | JSON | Declares permissions, content-script URL patterns, service worker |
| `content.js` | Vanilla JS / TypeScript | Parses `__NEXT_DATA__`, runs text check, messages the background worker |
| `background.js` (service worker) | Vanilla JS / TypeScript | Stores the spreadsheet in `chrome.storage.local`; calls the Vision API (keeps API key off the content-script context); handles de-duplication |
| `popup.html/js` | React or Vanilla | Main UI: live spreadsheet table, filter controls, CSV export, API key entry |
| `icons/` | PNG | Extension toolbar icon; badge shows listing count |

### 3.3 Manifest v3 (abridged)

```json
{
  "manifest_version": 3,
  "name": "Is There a Dishwasher?",
  "version": "0.1.0",
  "description": "Tracks dishwasher status across every Zillow listing you visit.",
  "permissions": ["storage", "activeTab", "unlimitedStorage"],
  "host_permissions": [
    "https://*.zillow.com/*",
    "https://api.openai.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://www.zillow.com/homedetails/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html", "default_icon": "icons/icon48.png" }
}
```

### 3.4 Extracting Listing Data from the Page

Zillow embeds all listing data in a `<script id="__NEXT_DATA__">` tag as a
JSON blob. No extra HTTP request is needed:

```js
// content.js
const raw = document.getElementById("__NEXT_DATA__")?.textContent;
if (!raw) return; // page structure changed — bail gracefully

const nextData = JSON.parse(raw);
const cache    = nextData.props?.pageProps?.gdpClientCache ?? {};
const key      = Object.keys(cache)[0];
const prop     = cache[key]?.property ?? {};

const listing = {
  zpid:        prop.zpid,
  url:         location.href,
  address:     prop.address?.streetAddress ?? "",
  city:        prop.address?.city ?? "",
  state:       prop.address?.state ?? "",
  price:       prop.price ?? null,
  beds:        prop.bedrooms ?? null,
  baths:       prop.bathrooms ?? null,
  description: prop.description ?? "",
  amenities:   (prop.homeFactsV2?.atAGlanceFacts ?? [])
                 .map(f => f.factLabel ?? "").join(" "),
  photoUrls:   (prop.photos ?? [])
                 .map(p => p.mixedSources?.jpeg?.[0]?.url ?? p.url)
                 .filter(Boolean),
};
```

This approach is resilient to Zillow's frequently changing CSS class names
because it reads the data layer rather than the rendered HTML.

### 3.5 Stage 1 — Text Check

```js
// content.js (continued)
const PATTERN = /\bdishwasher\b/i;
const haystack = `${listing.description} ${listing.amenities}`;
const textMatch = PATTERN.exec(haystack);

if (textMatch) {
  const start  = Math.max(0, textMatch.index - 30);
  const end    = Math.min(haystack.length, textMatch.index + 40);
  const snippet = haystack.slice(start, end).trim();

  chrome.runtime.sendMessage({
    type: "LISTING_RESULT",
    payload: { ...listing, has_dishwasher: true, method: "text", evidence: snippet },
  });
  injectBadge({ has_dishwasher: true });
  return;  // skip Stage 2
}
```

### 3.6 Stage 2 — Vision Inference

When the text check finds nothing, the content script sends a `VISION_NEEDED`
message. The background service worker handles the API call so the API key
never touches the content-script context:

```js
// background.js
chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  if (msg.type !== "VISION_NEEDED") return;

  const { key } = await chrome.storage.local.get("openai_key");
  if (!key) {
    saveRow({ ...msg.listing, has_dishwasher: null,
              method: "vision_skipped", evidence: "no_api_key" });
    return;
  }

  const MAX_IMAGES = 10; // default; read from chrome.storage.local "settings.maxImages" in production
  for (const url of msg.listing.photoUrls.slice(0, MAX_IMAGES)) {
    const found = await askVision(key, url);
    if (found) {
      saveRow({ ...msg.listing, has_dishwasher: true, method: "vision", evidence: url });
      chrome.tabs.sendMessage(msg.tabId, { type: "BADGE", result: true });
      return;
    }
  }

  saveRow({ ...msg.listing, has_dishwasher: false, method: "vision", evidence: null });
  chrome.tabs.sendMessage(msg.tabId, { type: "BADGE", result: false });
});
```

The `askVision` helper sends a single image to the OpenAI Vision API with a
compact yes/no prompt (see `EXTERNAL_API_VISION_PLAN.md` for the full request
schema). Using `"detail": "low"` keeps cost to roughly **$0.001 per image**
(based on OpenAI pricing as of early 2025 — verify current rates at
[openai.com/pricing](https://openai.com/pricing) before deploying).

### 3.7 Spreadsheet Storage and Export

Each row is appended to an array stored in `chrome.storage.local`:

```js
// background.js
async function saveRow(row) {
  const { rows = [] } = await chrome.storage.local.get("rows");
  const idx = rows.findIndex(r => r.zpid === row.zpid);
  if (idx >= 0) {
    // Preserve the original visited_at; only update detection fields
    rows[idx] = { ...row, visited_at: rows[idx].visited_at, last_updated: new Date().toISOString() };
  } else {
    rows.push({ ...row, visited_at: new Date().toISOString() });
  }
  await chrome.storage.local.set({ rows });
}
```

The popup renders the table and provides a **Download CSV** button:

```js
// popup.js
const COLUMNS = ["zpid","address","city","state","price","beds","baths",
                 "has_dishwasher","method","evidence","url","visited_at","last_updated"];

function exportCsv(rows) {
  const header = COLUMNS.join(",");
  const body   = rows.map(r => COLUMNS.map(c => JSON.stringify(r[c] ?? "")).join(","));
  const blob   = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
  const a      = Object.assign(document.createElement("a"),
                   { href: URL.createObjectURL(blob), download: "listings.csv" });
  a.click();
}
```

---

## 4. The Spreadsheet — Column Design

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `zpid` | string | `__NEXT_DATA__` | Zillow property ID — **primary key** used for de-duplication |
| `address` | string | `__NEXT_DATA__` | Street address |
| `city` | string | `__NEXT_DATA__` | |
| `state` | string | `__NEXT_DATA__` | |
| `price` | number | `__NEXT_DATA__` | Monthly rent or list price |
| `beds` | number | `__NEXT_DATA__` | |
| `baths` | number | `__NEXT_DATA__` | |
| `has_dishwasher` | bool / null | detection pipeline | `null` = vision check pending or skipped |
| `method` | string | detection pipeline | `"text"`, `"vision"`, `"vision_skipped"` |
| `evidence` | string / null | detection pipeline | Text snippet or photo URL that triggered the result |
| `url` | string | `location.href` | Full Zillow listing URL for easy revisit |
| `visited_at` | ISO timestamp | extension | When the listing was **first** seen (preserved on re-visit) |
| `last_updated` | ISO timestamp | extension | When the row was most recently updated |

This structure maps cleanly to a CSV or a Google Sheets import.

---

## 5. User Experience Walkthrough

1. **Install extension** → grant permissions for `zillow.com`.
2. **Open the popup** → paste in an OpenAI API key (or skip to use text-only
   mode).
3. **Browse Zillow normally** — open listing pages at any pace; the extension
   runs in the background.
4. Each listing shows a small **badge** in the corner: ✅ Yes / ❌ No /
   ⏳ Checking…
5. After browsing 10 listings, **open the popup** to see a compact table with
   dishwasher status highlighted.
6. Click **Download CSV** to open the spreadsheet in Excel or Google Sheets
   for sorting, filtering, and comparison.
7. Re-visit a listing later → the row is updated if the result changes.

---

## 6. Security and Privacy

### 6.1 API Key Handling

| Option | Security | Notes |
|--------|----------|-------|
| **User supplies own key** (`chrome.storage.local`) | ✅ Key never leaves the user's machine | User pays ~$0.001/image (verify current pricing); clear setup instructions needed |
| **Shared key bundled in extension** | ❌ Extractable by anyone | Never do this |
| **Proxy through a hosted backend** | ✅ Key never in the extension | Adds server cost and a new point of failure |

**Recommendation:** User-supplied key for v1. The popup provides a clear
"Enter OpenAI API key" field, and the key is stored in `chrome.storage.local`
(not `chrome.storage.sync`, to avoid cloud sync).

### 6.2 Data Stored Locally

`chrome.storage.local` is scoped to the extension and is not readable by
websites or other extensions. The stored listing rows contain only public
information already visible on the Zillow page. No authentication tokens,
session data, or personally identifiable information are collected.

### 6.3 Network Requests Made by the Extension

| Destination | When | Data Sent |
|-------------|------|-----------|
| `api.openai.com` | Stage 2 only, per listing | Photo URL + text prompt; no user PII |
| `zillow.com` | Never — DOM only | (none) |

---

## 7. Advantages of This Approach

- **Eliminates scraping entirely.** The extension reads data the browser has
  already fetched. No automated HTTP request to Zillow is ever made by the
  extension, so bot detection and ToS risk are effectively zero.
- **Zero user friction.** No URL copy-paste, no separate tool. The user just
  browses normally.
- **Aggregates across a search session.** The web app answers one listing at a
  time. The extension builds a comparison sheet as the user browses dozens of
  listings.
- **Offline text check is instant and free.** Stage 1 runs synchronously on the
  already-loaded page. Most listings that mention a dishwasher are resolved in
  under 5 ms with no API cost.
- **Authenticated page access.** If a listing requires the user to be logged
  in, the extension sees the full page automatically — no credentials need to
  be shared with a backend.
- **No backend to host or maintain.** The vision API call goes directly from
  the extension to OpenAI. No server, no deployment, no uptime concerns.
- **Privacy-respecting.** All data stays in the user's browser. Nothing is
  sent to a third party except photo URLs to OpenAI for vision inference.

---

## 8. Disadvantages and Risks

### 8.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Zillow changes the `__NEXT_DATA__` schema | Medium (happens 1–3×/year) | Extension stops parsing data | Graceful fallback: log a parse error; re-parse on next listing load; keep field access defensive (`?.` chaining) |
| `__NEXT_DATA__` tag removed entirely | Low | Extension breaks completely | Monitor for breakage; fall back to HTML parsing as a backup |
| Zillow adds a `Content-Security-Policy` blocking content scripts | Very low (CSP does not affect content scripts in MV3) | N/A | MV3 content scripts are injected by the browser, not by the page |
| Vision API key leaked via shared storage | Very low | User's key abused | Use `chrome.storage.local` (not sync); remind user not to use a shared machine |

### 8.2 UX / Adoption Risks

- **API key onboarding friction**: Non-technical users may struggle with
  obtaining and entering an OpenAI key. Offering a text-only mode (no key
  required) ensures the extension is still useful without one.
- **Vision cost surprise**: If a user browses 100 listings with no dishwasher
  text, Stage 2 runs up to 1,000 image checks. A per-session cost
  estimate in the popup and a per-session image-check cap prevent surprises
  (verify current OpenAI Vision pricing at [openai.com/pricing](https://openai.com/pricing)).
- **Chrome Web Store approval**: Extensions that call AI APIs or handle keys
  are subject to heightened review. Privacy disclosures must clearly explain
  what data is sent to OpenAI.

### 8.3 Platform Limitations

- **Zillow only (v1).** Adding Apartments.com requires a separate content
  script and DOM parser. Covered in `LISTING_PLATFORM_RESEARCH.md`.
- **MV3 service worker lifecycle.** Background service workers can be
  terminated by the browser between listings. The spreadsheet must be
  persisted to `chrome.storage.local` after every row write (not cached in
  memory), or data will be lost.
- **`chrome.storage.local` quota.** The default quota is 5 MB (10 MB with the
  `unlimitedStorage` permission). At ~500 bytes per row, this supports
  ~10,000 listings before hitting the limit. A row-rotation or export-and-clear
  mechanism handles long-term use.

---

## 9. Comparison: Spreadsheet Extension vs. Web App vs. Badge-Only Extension

| Dimension | Web App | Badge-Only Extension | Spreadsheet Extension |
|-----------|---------|---------------------|----------------------|
| Friction to use | High (copy URL, switch tabs) | Zero | Zero |
| Aggregates multiple listings | ❌ One at a time | ❌ One at a time | ✅ All visited listings |
| Comparison / export | ❌ | ❌ | ✅ CSV download |
| Scraping risk | High (cloud server) | None | None |
| Vision API needed | Optional (Stage 2) | Optional | Optional |
| Backend required | ✅ Yes | ❌ No | ❌ No |
| Works on Apartments.com | ✅ Extensible | With extra script | With extra script |
| Offline / no-key mode | Stage 1 only | Stage 1 only | Stage 1 only |
| Best for | Power user / testing | Casual checking | Apartment hunting sessions |

---

## 10. Suggested Feature Set

### Must Have (v1 — text-only, no API key required)

| Feature | Notes |
|---------|-------|
| Parse `__NEXT_DATA__` on every `zillow.com/homedetails/*` page | Core data extraction |
| Stage 1 text check (no API key required) | Instant, free |
| Append row to local spreadsheet | De-duplicate by `zpid` |
| Popup table view of all visited listings | Sortable by dishwasher status |
| CSV export | Download all rows |
| Badge overlay: ✅ Yes / ❌ No / ⏳ Checking | Per-listing visual feedback |
| "Clear all" button | Reset the spreadsheet |

### Should Have (v1 — with optional API key)

| Feature | Notes |
|---------|-------|
| Stage 2 vision check via OpenAI API | Falls back gracefully if no key |
| API key entry in popup | Stored in `chrome.storage.local` |
| Per-session cost estimate | Based on images checked × current OpenAI Vision rate |
| Image-check cap setting | Default: 10 images per listing |
| Mark which photo contained the dishwasher | Link in spreadsheet row |

### Nice to Have (v2)

| Feature | Notes |
|---------|-------|
| Highlight the matching kitchen photo with a green border | In-page annotation |
| Google Sheets sync | `sheets.googleapis.com` API, OAuth2 |
| Apartments.com support | Separate content script |
| Confidence score column | From VLM extended prompt |
| Push a listing to the web app for deeper analysis | Cross-tool integration |

---

## 11. Implementation Roadmap

1. **Prototype content script** — confirm `__NEXT_DATA__` extraction works on
   live Zillow listings. This is the highest-risk assumption and should be
   validated before any other work.
2. **Stage 1 text check + badge** — no API key needed; provides immediate value
   for users who only want text-based results.
3. **Persistent spreadsheet + popup table** — `chrome.storage.local` write on
   each visit; React (or plain HTML table) in `popup.html`.
4. **CSV export** — Blob + anchor download; simple to implement once the data
   model is stable.
5. **Stage 2 vision check** — background service worker calls OpenAI API; key
   stored in `chrome.storage.local`.
6. **Cost guard** — per-session image-check counter and cap; show estimated
   spend in popup.
7. **Publish to Chrome Web Store** as an unlisted extension for early testing.
8. **Evaluate extending to Apartments.com** once the Zillow content script is
   stable.

---

## 12. Verdict

This is a strong and practical idea. The spreadsheet-builder concept solves
the scraping problem cleanly (no scraping at all), adds a comparison workflow
that the web app cannot provide, and requires no backend infrastructure. The
core text-check functionality can ship with zero API cost. Vision inference is
an optional enhancement that slots in behind an API-key gate.

The main engineering risks are `__NEXT_DATA__` schema drift (manageable with
defensive parsing) and MV3 service worker lifecycle (manageable with
synchronous storage writes). Neither is a showstopper.

**Recommended priority:** Build this extension as the primary user-facing
product for the apartment-hunting use case. Keep the web app as a developer
and testing tool, and as the foundation for supporting non-Zillow platforms.
