/**
 * Playwright-based Zillow listing scraper (Node.js).
 *
 * Launches a headless Chromium browser, navigates to the listing URL,
 * waits for JavaScript to finish rendering, then extracts text and image URLs.
 *
 * Used by both the Vite dev-server plugin (vite.config.js) and the
 * production Express server (server/index.js).
 */

import { chromium } from 'playwright'

const ALLOWED_HOSTS = new Set(['zillow.com', 'www.zillow.com'])

/**
 * Validate that `url` points to a Zillow listing and return a cleaned copy.
 * Throws an Error with a user-friendly message on failure.
 *
 * @param {string} url
 * @returns {string}
 */
export function validateUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL.')
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error('Only Zillow listing URLs are supported (zillow.com).')
  }
  // Reconstruct from parsed parts to strip unexpected components (e.g. fragment)
  return `${parsed.origin}${parsed.pathname}${parsed.search}`
}

/**
 * Use a headless Playwright browser to render the Zillow listing page and
 * extract text content and listing photo URLs.
 *
 * @param {string} url  A validated zillow.com listing URL
 * @returns {Promise<{ text: string, imageUrls: string[] }>}
 */
export async function scrapeListing(url) {
  const cleanUrl = validateUrl(url)

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()

    // Navigate and wait for the network to go idle (JS rendering complete)
    await page.goto(cleanUrl, { waitUntil: 'networkidle', timeout: 60_000 })

    // Prefer Zillow's embedded Next.js data blob — it contains structured
    // listing data (text, images) without relying on hashed CSS class names.
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__') // eslint-disable-line no-undef
      return el ? el.textContent : null
    })

    if (nextData) {
      try {
        return extractFromJson(JSON.parse(nextData))
      } catch {
        // fall through to plain-text fallback
      }
    }

    // Fallback: return all visible text from the rendered page body
    const bodyText = await page.evaluate(() => document.body.innerText) // eslint-disable-line no-undef
    return { text: bodyText || '', imageUrls: [] }
  } finally {
    await browser.close()
  }
}

/**
 * Recursively walk a Next.js JSON blob to collect text strings and image URLs.
 *
 * @param {unknown} obj
 * @returns {{ text: string, imageUrls: string[] }}
 */
function extractFromJson(obj) {
  const texts = []
  const imageUrls = new Set()
  const imageKeyRe = /image/i

  function walk(node) {
    if (typeof node === 'string') {
      if (node.length > 2) texts.push(node)
    } else if (Array.isArray(node)) {
      node.forEach(walk)
    } else if (node !== null && typeof node === 'object') {
      for (const [key, val] of Object.entries(node)) {
        if (
          typeof val === 'string' &&
          val.startsWith('https://') &&
          /\.(jpe?g|png|webp)/i.test(val) &&
          (key === 'url' || key === 'src' || imageKeyRe.test(key))
        ) {
          imageUrls.add(val)
        }
        walk(val)
      }
    }
  }

  walk(obj)
  return { text: texts.join(' '), imageUrls: [...imageUrls] }
}
