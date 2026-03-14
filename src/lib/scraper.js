/**
 * Fetches a Zillow listing page via the local Playwright backend (headless
 * browser) and returns all extracted text content and listing photo URLs.
 */

/**
 * @param {string} url  A zillow.com listing URL
 * @returns {Promise<{ text: string, imageUrls: string[] }>}
 */
export async function scrapeListing(url) {
  const parsed = new URL(url)
  if (!['zillow.com', 'www.zillow.com'].includes(parsed.hostname)) {
    throw new Error('Only Zillow listing URLs are supported (zillow.com).')
  }

  let res
  try {
    res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      // Give Playwright time to render the page
      signal: AbortSignal.timeout(90_000),
    })
  } catch {
    throw new Error(
      'Could not reach the scraping server. ' +
        'In development run `npm run dev`; in production run `npm start`.',
    )
  }

  if (res.status === 400) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Invalid listing URL.')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || `Backend error (HTTP ${res.status}).`)
  }

  const { text, imageUrls } = await res.json()
  if (!text || text.length < 200) {
    throw new Error(
      'Listing page returned too little content — Zillow may have blocked the request.',
    )
  }

  return { text, imageUrls }
}

