# Software Requirements & Design — Is There a Dishwasher?

## 1. Purpose

Enable apartment hunters to instantly know whether a unit has a dishwasher,
without manually reviewing every listing photo.

---

## 2. Scope

A web application that accepts an apartment listing URL, checks the listing
text for the word "dishwasher", and — only if the text check is inconclusive —
retrieves listing photos and analyzes them with a vision model. Returns a yes/no
answer plus the supporting evidence (text snippet or image).

---

## 3. Stakeholders

| Role | Concern |
|------|---------|
| Apartment hunter | Fast, reliable dishwasher detection |
| Developer | Maintainable, extensible codebase |
| Operator | Low running cost; scraper must not violate ToS |

---

## 4. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | The user shall be able to paste a listing URL into the UI. |
| FR-2 | The system shall scrape the listing page text, amenities list, and photos. |
| FR-3 | The system shall search the scraped text for the word "dishwasher" (case-insensitive) before performing any image analysis. |
| FR-4 | If the word "dishwasher" is found in the listing text, the system shall return a positive result immediately without analysing any images. |
| FR-5 | If the text check is negative, the system shall classify listing photos using a vision model to detect a dishwasher. |
| FR-6 | The system shall return a boolean result and the supporting evidence (text snippet or image URL) to the frontend. |
| FR-7 | The frontend shall display the result and indicate whether it was detected via text or image. |
| FR-8 | The system shall handle listing pages that require JavaScript rendering. |

---

## 5. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Text-only detection shall complete in under 3 seconds. End-to-end response time with image fallback shall be under 15 seconds for ≤ 30 photos. |
| NFR-2 | The frontend shall be accessible (WCAG 2.1 AA). |
| NFR-3 | The backend shall not store listing photos beyond the request lifetime. |
| NFR-4 | The scraper shall respect `robots.txt` and rate-limit requests. |
| NFR-5 | Vision API keys shall never be exposed to the browser. |

---

## 6. User Stories

- **As** an apartment hunter, **I want** to paste a Zillow/Apartments.com URL,
  **so that** I immediately know if the unit has a dishwasher.
- **As** a user on a mobile device, **I want** the page to be responsive,
  **so that** I can use the tool while browsing listings on my phone.
- **As** a developer, **I want** the vision model to be swappable,
  **so that** I can upgrade from GPT-4o to a fine-tuned model without
  changing the API contract.

---

## 7. UI/UX Design

### 7.1 Landing Page

- Hero section with the product name, one-line tagline, and a "Try it" CTA.
- Three-step explanation (Scrape → Analyse → Report).
- Technology badges for quick orientation.

### 7.2 Search Flow (future feature)

1. User pastes a listing URL into a search box.
2. A loading indicator appears while the backend processes the request.
3. Result card shows "✅ Dishwasher found" or "❌ No dishwasher detected",
   along with whether it was confirmed via listing text or a photo.

---

## 8. Constraints & Assumptions

- Listing sites may change their HTML structure; the scraper will require
  periodic maintenance.
- The vision model requires an active internet connection and a paid API key.
- Rate limits imposed by listing sites will cap throughput.
