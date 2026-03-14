# Is There a Dishwasher? — Browser Extension

A Chrome / Edge browser extension that **automatically checks every Zillow
listing you visit for a dishwasher** and builds a running comparison
spreadsheet as you browse — no copy-pasting, no separate tool.

The extension reads data the browser has already fetched (from Zillow's
`__NEXT_DATA__` JSON blob), so no automated HTTP requests to Zillow are ever
made. Stage 1 (text check) runs instantly and for free. Stage 2 (photo
analysis) is optional and requires a Hugging Face API token.

## Docs

- [Browser Extension Concept (BROWSER_EXTENSION_CONCEPT.md)](docs/BROWSER_EXTENSION_CONCEPT.md)
- [Software Requirements & Design (SRS.md)](docs/SRS.md)
- [Architecture (ARCHITECTURE.md)](docs/ARCHITECTURE.md)
- [Dishwasher Detection Research (DISHWASHER_DETECTION_RESEARCH.md)](docs/DISHWASHER_DETECTION_RESEARCH.md)
- [Listing Platform Research — Zillow vs Apartments.com (LISTING_PLATFORM_RESEARCH.md)](docs/LISTING_PLATFORM_RESEARCH.md)

---

## How it works

1. **Parse** — When you open a Zillow listing the content script reads the
   `__NEXT_DATA__` JSON that Zillow already embedded in the page. No extra
   network request is made.
2. **Text check** — The listing description and amenities list are searched for
   the word *"dishwasher"* (case-insensitive). This takes < 5 ms and requires
   no API key.
3. **Photo check** *(optional, requires Hugging Face token)* — If the text check draws
   a blank and you have saved a Hugging Face API token, the background service worker
   sends listing photos to [`openbmb/MiniCPM-V-2`](https://huggingface.co/openbmb/MiniCPM-V-2) one-by-one via `router.huggingface.co`.
4. **Badge** — A small overlay badge on the listing page shows the result
   immediately: ✅ Yes / ❌ No / ⏳ Checking…
5. **Spreadsheet** — Every listing you visit is appended to a persistent table
   (stored in `chrome.storage.local`). Open the extension popup to view,
   filter, and export the table to CSV.

---

## Loading the extension in developer mode

All Chromium-based browsers (Chrome, Edge, Brave, Arc) support loading an
unpacked extension directly from a local directory — no Chrome Web Store
submission needed during development.

### Chrome / Brave / Arc

1. Open **`chrome://extensions`** (or `brave://extensions` / `arc://extensions`).
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the **`extension/`** directory inside this repository.
5. The extension icon (🍽️) appears in the browser toolbar.

### Microsoft Edge

1. Open **`edge://extensions`**.
2. Enable **Developer mode** (left sidebar).
3. Click **Load unpacked**.
4. Select the **`extension/`** directory.

### Firefox

Firefox requires a signed extension for permanent installs, but supports
temporary loads for development:

1. Open **`about:debugging#/runtime/this-firefox`**.
2. Click **Load Temporary Add-on…**.
3. Select the **`extension/manifest.json`** file.
4. The extension stays loaded until Firefox is restarted.

> **Note:** Firefox uses a slightly different extension API surface. The
> extension targets Chrome's Manifest V3. Most APIs (`chrome.storage`,
> `chrome.runtime`) work in Firefox with the `chrome.*` namespace, but
> service-worker background scripts require additional testing.

---

## Reloading after code changes

Because the extension runs as a local unpacked extension, changes to source
files are **not** picked up automatically.

After editing any file in `extension/`:

1. Go back to `chrome://extensions`.
2. Click the **↺ Reload** button on the "Is There a Dishwasher?" card.
3. Reload any Zillow listing tabs you want to re-test.

---

## Enabling photo analysis (Stage 2)

Photo analysis is off by default. To enable it:

1. Click the extension icon to open the popup.
2. Expand **⚙ Settings**.
3. Paste your Hugging Face API token (`hf_…`) into the **Hugging Face API token** field.
4. Click **Save settings**.

Get a free token at **https://huggingface.co/settings/tokens**.

The token is stored only in `chrome.storage.local`, which is scoped to the
extension and is never synced to the cloud.

> **Cost note:** Each photo check calls
> [`openbmb/MiniCPM-V-2`](https://huggingface.co/openbmb/MiniCPM-V-2) via the
> [Hugging Face Inference API](https://huggingface.co/inference-api). Free-tier
> accounts include a generous rate limit; usage beyond that is billed per token.
> You can cap the number of photos checked per listing in Settings (default: 10).

---

## Using the popup spreadsheet

Click the extension icon on any page to open the popup:

| Control | Action |
|---------|--------|
| **Filter dropdown** | Show all listings, only those with a dishwasher, or only those without |
| **⬇ Export CSV** | Download the visible rows as a `.csv` file for Excel / Google Sheets |
| **🗑 Clear all** | Delete all saved listing rows (irreversible) |
| **⚙ Settings** | Enter Hugging Face API token; set max images per listing |

The popup table updates in real-time as you visit new listings.

---

## Project layout

```
extension/
├── manifest.json   # Manifest v3 — declares permissions, content scripts, popup
├── content.js      # Runs on every zillow.com/homedetails/* page; parses data
│                   # and shows the badge overlay
├── background.js   # Service worker — persists rows, calls Hugging Face Vision API
├── popup.html      # Popup UI shell
├── popup.js        # Popup logic — table, filter, CSV export, settings
├── popup.css       # Popup styles
└── icons/          # Extension toolbar icons (16 × 16, 48 × 48, 128 × 128 px)
docs/               # Architecture, SRS, and research notes
```

---

## Permissions explained

| Permission | Why it is needed |
|------------|-----------------|
| `storage` | Save and load the listing spreadsheet and settings |
| `unlimitedStorage` | Allow the spreadsheet to grow beyond the 5 MB default quota |
| Host: `https://*.zillow.com/*` | Inject the content script into Zillow listing pages |
| Host: `https://router.huggingface.co/*` | Allow the background service worker to call the Hugging Face Inference API |
