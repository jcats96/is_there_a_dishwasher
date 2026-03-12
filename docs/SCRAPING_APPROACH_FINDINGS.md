# Scraping Approach Findings

## Local vs. Cloud Request Origin

Making requests to listing platforms like Zillow from a cloud server is likely to be flagged as scraping, since cloud IP ranges are well-known and bulk requests from a single origin are easy to detect and block.

Requests originating from a user's local machine are much harder to flag — they blend in with normal browser traffic and appear indistinguishable from a real user browsing the site. This is especially true if:

- Requests are made at a human-like pace (not rapid-fire)
- The user is navigating naturally through search results they've already loaded
- The tool enhances existing page content rather than automating bulk fetches

## Zillow Terms of Service

Regardless of request origin, **Zillow's ToS explicitly prohibits scraping**. A local tool does not change the legal or contractual picture — it only reduces detectability. Users should be aware of this before using any scraping-based approach.

## Practical Low-Risk Approach

If a scraping-based approach is pursued, the following minimizes both detection and ToS friction:

- Only process listings the user has explicitly navigated to
- Walk through listings one at a time at a normal browsing pace
- Present results as a local enhancement, not an automated bulk export
- Do not store or redistribute the scraped data

## Recommended Alternatives

### 1. Browser Extension
The most defensible approach. An extension reads pages the user is already viewing and overlays dishwasher: yes/no onto search results. No background scraping occurs — it's pure DOM parsing of content the user has already loaded. No ToS violation, no detection risk.

See `BROWSER_EXTENSION_CONCEPT.md` for prior research.

### 2. Zillow API
Zillow previously had a public API (GetSearchResults), but it has been deprecated. Limited or partner access may still exist. Worth checking for any currently active official endpoints.

### 3. Third-Party Zillow API Wrappers
Services on platforms like RapidAPI provide Zillow data via a structured API. These wrappers handle the scraping themselves, shifting the compliance burden to the third-party provider. Quality and reliability vary.

### 4. Alternative Platforms
Other rental listing platforms (e.g., Apartments.com, Rent.com) may have more structured amenity data, better scraping tolerance, or available APIs. These are worth evaluating as primary data sources.

## Conclusion

The browser extension approach is the strongest path forward: it avoids scraping entirely, works with whatever search the user performs, and can display a dishwasher yes/no overlay directly on Zillow search results without any ToS or detection concerns.
