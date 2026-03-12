# Browser Extension Concept — "Is There a Dishwasher?" for Zillow

## 1. The Idea

Instead of (or in addition to) a standalone web app where users paste a URL,
ship a **Chrome / Edge / Firefox browser extension** that activates
automatically when a user is viewing a Zillow listing page and adds a visible
badge or overlay answering:

> **"🍽️ Dishwasher: Yes / No / Checking…"**

The user never leaves Zillow, never copies a URL, and gets the answer in
seconds.

---

## 2. Why This Could Be More Useful Than the Web App

| Factor | Web App | Browser Extension |
|--------|---------|-------------------|
| Friction | User must copy URL, switch tabs, paste | Zero friction — result appears automatically |
| Context | Separate window; no visual connection to listing | Answer overlaid directly on the listing |
| Speed (perceived) | Page loads → paste → wait | Answer appears while user is already browsing |
| Trust | User has to discover and visit the site | Extension icon is always present in the toolbar |
| Browsing workflow | Interrupts momentum | Fits naturally into normal listing browsing |
| No backend required | ❌ Needs hosted server | ✅ Can call API directly from extension content script |

The extension model eliminates the biggest usability barrier: **most apartment
hunters won't bother opening a second tool**. If the answer appears on the
same page they are already reading, adoption is dramatically easier.

---

## 3. How It Would Work — Technical Architecture

### 3.1 High-Level Flow

```
User opens a Zillow listing (e.g., zillow.com/homedetails/…)
        │
        ▼
Content script activates on matching URL pattern
        │
        ▼
Read listing text + photo URLs from __NEXT_DATA__ JSON in the page DOM
        │
        ▼
Stage 1 — Text check (synchronous, in-page, < 10 ms)
  → search listing text for "dishwasher"
  → if found: inject "✅ Dishwasher found (listing text)" badge
        │
        └── not found
              │
              ▼
Stage 2 — Vision API call (from content script or background service worker)
  → send image URLs to OpenAI Vision API (or self-hosted endpoint)
  → inject result badge when response arrives
```

### 3.2 Components

| Component | Technology | Responsibility |
|-----------|-----------|---------------|
| **Manifest v3 manifest** | JSON | Declares permissions, content script URL patterns, service worker |
| **Content script** (`content.js`) | Vanilla JS / TypeScript | Injected into Zillow pages; reads DOM, runs text check, injects UI badge |
| **Background service worker** (`background.js`) | Vanilla JS / TypeScript | Handles API key storage (via `chrome.storage.local`); proxies Vision API requests to avoid CORS and key exposure |
| **Popup** (`popup.html/js`) | React or Vanilla | Settings UI: API key input, toggle on/off, usage stats |
| **Options page** (`options.html/js`) | React or Vanilla | Extended settings |

### 3.3 Manifest v3 Snippet

```json
{
  "manifest_version": 3,
  "name": "Is There a Dishwasher?",
  "version": "0.1.0",
  "description": "Instantly checks Zillow listings for a dishwasher.",
  "permissions": ["storage", "activeTab"],
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
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icons/icon48.png"
  }
}
```

### 3.4 Reading Zillow Data from the Page

Zillow embeds all listing data as JSON in a `<script id="__NEXT_DATA__">` tag.
The content script can read it without any HTTP requests:

```js
// content.js
const nextData = JSON.parse(
  document.getElementById("__NEXT_DATA__").textContent
);

const props = nextData.props.pageProps.gdpClientCache;
const listingKey = Object.keys(props)[0];
const listing = props[listingKey].property;

const description = listing.description ?? "";
const photoUrls = (listing.photos ?? []).map(p => p.mixedSources?.jpeg?.[0]?.url ?? p.url);
```

This avoids any extra network request and is not blocked by CORS.

### 3.5 Injecting the Result Badge

```js
function injectBadge(result) {
  const badge = document.createElement("div");
  badge.id = "itad-badge";
  badge.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    background: ${result.has_dishwasher ? "#22c55e" : "#ef4444"};
    color: white; font-size: 16px; font-weight: bold;
    padding: 12px 20px; border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 99999;
  `;
  badge.textContent = result.has_dishwasher
    ? "🍽️ Dishwasher: Yes"
    : "🚫 Dishwasher: No";
  document.body.appendChild(badge);
}
```

---

## 4. API Key Handling — Security Considerations

Calling the OpenAI API directly from a browser extension is possible but
requires care:

| Option | Security | Cost Risk | Notes |
|--------|----------|-----------|-------|
| **User supplies their own key** (stored in `chrome.storage.local`) | Good — key never leaves user's machine | User pays per call | Best for a personal/dev tool; onboarding friction |
| **Shared key in extension source** | ❌ Bad — key is visible to anyone who inspects the extension | High — anyone can abuse it | Never do this |
| **Proxy through a backend** (same as web app) | Best | Operator pays | Requires a hosted server; see existing architecture |

**Recommendation:** For a first version, have users paste their own OpenAI API
key into the extension popup. The key is stored encrypted in
`chrome.storage.local` and never sent anywhere except directly to
`api.openai.com`.

---

## 5. Tradeoffs vs. the Web App Approach

### Advantages of the Extension

- **Zero friction**: No URL copy-paste needed; the check starts automatically.
- **No backend to host**: The extension can call the Vision API directly,
  eliminating server costs and deployment complexity.
- **Works while browsing**: Users get answers in their natural workflow.
- **Can annotate the page**: The extension can highlight the kitchen photo that
  contains the dishwasher.
- **Offline text check**: Stage 1 (text scan) runs entirely locally.

### Disadvantages of the Extension

- **API key management**: Users must supply their own OpenAI key (or the
  developer must host a backend and absorb the cost).
- **Platform lock-in**: The extension targets Zillow's DOM structure;
  Zillow HTML changes break it.
- **Manifest v3 constraints**: Service workers in Mv3 are ephemeral — long
  image analysis chains need careful state management.
- **Chrome Web Store review**: Publishing requires passing Google's review
  process, which can take days and may flag extensions that call external AI
  APIs.
- **Firefox / Safari parity**: Separate builds or a polyfill (e.g.,
  `webextension-polyfill`) needed for full cross-browser support.
- **No Apartments.com support** unless a second content-script matching rule
  is added (which requires its own DOM parsing logic).

---

## 6. Suggested Feature Set for v1

| Feature | Priority |
|---------|----------|
| Auto-detect dishwasher on any `zillow.com/homedetails/*` page | Must have |
| Fixed badge: "🍽️ Yes / 🚫 No / ⏳ Checking…" | Must have |
| Click badge to see which image or text triggered the result | Should have |
| Popup for entering / clearing the OpenAI API key | Must have |
| Toggle to disable auto-check (manual trigger only) | Should have |
| Apartments.com support | Nice to have |
| Highlight the relevant kitchen photo with a green border | Nice to have |
| Show confidence score | Nice to have |
| Works without an API key (text-only mode) | Should have |

---

## 7. Comparison: Extension vs. Web App — When to Use Each

| Use Case | Better Choice |
|----------|--------------|
| Casual apartment hunting, browsing Zillow naturally | Extension |
| Developer / power user testing the detection pipeline | Web App |
| Sharing the tool with non-technical friends | Extension (just install it) |
| Scraping many listings automatically | Neither — needs a dedicated backend job |
| Adding Apartments.com or other platforms | Web App (scraper can target any URL) |

The two approaches are **complementary, not competing**. A clean split would
be:

- **Extension** → UI layer for Zillow; runs the text check locally and calls
  the Vision API directly.
- **Web App** → Supports any URL (Zillow, Apartments.com, Craigslist, etc.),
  handles scraping complexity, serves as the backend for the extension if a
  shared API key model is adopted later.

---

## 8. Recommended Next Steps

1. **Prototype the content script** against a real Zillow listing to confirm
   `__NEXT_DATA__` extraction works reliably.
2. **Build the badge UI** with the three states: checking, yes, no.
3. **Wire up the text check** — this requires no API key and will already
   provide value for many listings.
4. **Add Vision API call** behind an API-key gate (user's own key in popup).
5. **Publish to Chrome Web Store** as an unlisted extension for early testers.
6. **Evaluate** whether to (a) keep it user-key-only, (b) host a shared
   backend, or (c) explore a Zillow Tech Connect partnership for official
   data access.
