# Listing Platform Research — Zillow vs Apartments.com

## 1. Purpose

This document compares **Zillow** and **Apartments.com** as data sources for
"Is There a Dishwasher?", focusing on API access, scraping feasibility, image
availability, and terms-of-service risk.

---

## 2. Zillow

### 2.1 Official APIs

Zillow Group operates several data products under
[zillowgroup.com/developers](https://www.zillowgroup.com/developers/).

| API | What it Provides | Access |
|-----|-----------------|--------|
| **Bridge / RETS Listing Output** | Full MLS listing data (text, amenities, photos) via a RESTful JSON API | Invite-only; requires MLS partnership or broker licence |
| **Zillow Tech Connect** | Read/write listing data with OAuth2; includes image URLs | Must apply through Zillow partner programme |
| **Public Data Archives** | Bulk CSV exports (rent indices, home values, etc.) | Free download; **no images**, no per-listing detail |
| **Zestimate API** (deprecated) | Estimated home value | Shut down as of 2021; no replacement offered publicly |

**Key finding:** There is no freely accessible, self-serve Zillow API that
returns listing photos. Access to image data requires a formal partnership or
MLS agreement, which is not realistic for an indie/side-project application.

### 2.2 Scraping Zillow

Because the official API is gated, many developers resort to scraping.

**What makes Zillow scrapable in principle:**
- Listing pages are server-side rendered with a JSON blob embedded in
  `<script id="__NEXT_DATA__">` — this contains most listing fields including
  high-resolution photo URLs.
- A headless Playwright/Puppeteer browser can extract this blob without
  parsing fragile HTML selectors.

**What makes Zillow difficult to scrape in practice:**

| Challenge | Detail |
|-----------|--------|
| Bot detection | Cloudflare and Zillow's own WAF block requests that lack realistic browser fingerprints |
| CAPTCHAs | Triggered on rapid or repetitive requests |
| Rate limiting | IP-level throttling; residential proxies required for any volume |
| Dynamic HTML | Photo gallery is lazy-loaded via JavaScript |
| ToS restriction | Zillow's Terms of Use explicitly prohibit "scraping, spidering, crawling, or otherwise accessing data" for commercial or systematic use |

**Assessment for this project:**
- A *single user pasting a single URL* into the app is low-risk from a
  rate-limiting standpoint; a headless Playwright session will usually succeed.
- Bulk or scheduled scraping of many listings would violate Zillow's ToS and
  would be aggressively blocked.
- The `robots.txt` at `zillow.com/robots.txt` disallows most automated paths.
  The app must honour this (NFR-4 in the SRS).

### 2.3 Photo URL Format

When a Zillow listing page loads successfully, the `__NEXT_DATA__` JSON
contains an array of photo objects with keys like:

```json
{
  "url": "https://photos.zillowstatic.com/fp/abcd1234-uncropped_scaled_within_1536_1152.webp",
  "width": 1536,
  "height": 1152
}
```

These URLs are publicly accessible (no auth required) and served from Zillow's
CDN (`zillowstatic.com`). They can be fetched and passed directly to the
vision classifier.

---

## 3. Apartments.com

### 3.1 Official API

Apartments.com does expose an API at `api.apartments.com`, but access is
highly restricted:

- The documented endpoints focus on **property management** (creating/updating
  your own listings, managing reviews) rather than **searching or browsing**
  listings.
- Authentication is OAuth-based; credentials require contacting Apartments.com
  customer support.
- There is **no public search or listing-browse API** suitable for an
  end-user-facing tool.

### 3.2 Scraping Apartments.com

Apartments.com is notoriously harder to scrape than Zillow:

| Challenge | Detail |
|-----------|--------|
| Akamai WAF | Industry-leading bot-detection system; blocks most automated requests |
| JavaScript rendering | Listings are single-page apps; basic HTTP fetch returns empty shells |
| Fingerprinting | Browser fingerprint, TLS fingerprint, and behaviour-based detection |
| ToS | Explicitly prohibits scraping, automated access, and data extraction |

Commercial scraping services (Apify, ScrapingBee, Scrape.do) offer managed
solutions that rotate residential proxies and bypass Akamai, but these cost
money and create ongoing maintenance obligations.

### 3.3 Photo Access

Apartments.com stores listing images on an Akamai CDN. The URLs are embedded
in the page's React state. Accessing them requires successfully loading the
full JavaScript bundle, which again requires a convincing browser fingerprint.

---

## 4. Head-to-Head Comparison

| Criterion | Zillow | Apartments.com |
|-----------|--------|---------------|
| Official public API | ❌ No (partnership required) | ❌ No (property managers only) |
| Free API tier | ❌ | ❌ |
| Scraping feasibility | ⚠️ Possible for single URLs with Playwright | ❌ Very difficult without paid proxy/service |
| Bot detection | Cloudflare + custom WAF | Akamai (harder) |
| Photo quality | High-res WebP on CDN | Good quality; mixed formats |
| Data richness | Very high (MLS-sourced) | High (rent-focused) |
| ToS risk | Medium (single-URL use, low volume) | High (Akamai actively blocks) |
| `robots.txt` compliance | Most paths disallowed | Most paths disallowed |
| Market focus | Sales + rentals | Rentals primarily |

---

## 5. Recommendation

### For the Current MVP

**Prioritise Zillow** as the initial supported platform:

1. Single-URL Playwright scraping is feasible and low-risk at the usage
   pattern the app targets (one URL pasted by a user, not bulk crawling).
2. The `__NEXT_DATA__` JSON blob makes photo URL extraction robust against
   minor HTML changes.
3. Zillow covers both rentals and sales, giving a broader potential user base.

**Support Apartments.com secondarily**, with a Playwright-based scraper that
targets its page structure. Expect higher breakage rates and possibly requiring
users to paste a fully loaded page's HTML in the future.

### Longer-Term Options

| Option | Notes |
|--------|-------|
| RapidAPI / Zillow-on-RapidAPI | Third-party wrapper; unofficial; subject to termination; ~$0.01/req |
| Apify Apartments.com Actor | Managed scraping; $5–$50/mo depending on volume |
| MLS/RETS partnership | Only viable if the project becomes a licensed real estate product |
| Integrate with open MLS data (ATTOM, CoreLogic) | Paid enterprise APIs; not suitable for hobbyist project |

---

## 6. Key Takeaways

- Neither Zillow nor Apartments.com offers a free, open API with image access.
- Zillow is the more practical scraping target for a single-URL tool.
- Apartments.com's Akamai WAF makes reliable scraping significantly harder.
- The project must respect `robots.txt` and avoid bulk crawling to stay on the
  right side of each platform's terms of service.
- If the project grows, pursuing a formal Zillow Tech Connect partnership is
  the cleanest long-term path.
