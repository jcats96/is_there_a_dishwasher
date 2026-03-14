/**
 * Playwright-based Zillow listing scraper (Node.js).
 *
 * Launches a headless Chromium browser with stealth patches applied to
 * reduce bot-detection, navigates to the listing URL, waits for JavaScript
 * to finish rendering, then extracts text and image URLs.
 *
 * Stealth measures applied:
 *  - --disable-blink-features=AutomationControlled  (hides navigator.webdriver)
 *  - addInitScript patches for navigator.webdriver, plugins, languages, chrome
 *  - Realistic locale, timezone, and Accept-Language headers
 *
 * Used by both the Vite dev-server plugin (vite.config.js) and the
 * production Express server (server/index.js).
 */

import { chromium } from 'playwright'

/** Minimum characters of body text before we consider the page valid. */
const MIN_CONTENT_LENGTH = 500

/**
 * Validate that `url` points to an HTTP(S) page and return a cleaned copy.
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
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported.')
  }
  // Reconstruct from parsed parts to strip unexpected components (e.g. fragment)
  return `${parsed.origin}${parsed.pathname}${parsed.search}`
}

/**
 * Use a headless Playwright browser to render a listing page and
 * extract text content and photo URLs.
 *
 * @param {string} url  A validated HTTP(S) listing URL
 * @returns {Promise<{ text: string, imageUrls: string[] }>}
 */
export async function scrapeListing(url) {
  const cleanUrl = validateUrl(url)

  // Launch with stealth flags to suppress Chromium's automation indicators.
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
    ],
  })
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    // Patch JS properties that bot-detection scripts commonly probe.
    await context.addInitScript(() => {
      // Remove the webdriver flag — its presence is the most obvious automation tell.
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })

      // Real browsers always have at least a few plugins; headless has none.
      Object.defineProperty(navigator, 'plugins', {
        get: () => Object.assign([], { length: 3 }),
      })

      // Ensure the languages array is populated as it would be in a real browser.
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      })

      // Headless Chromium omits window.chrome; add a minimal stub.
      if (!window.chrome) { // eslint-disable-line no-undef
        window.chrome = { runtime: {} } // eslint-disable-line no-undef
      }
    })

    const page = await context.newPage()

    // Navigate and wait for the network to go idle (JS rendering complete)
    const response = await page.goto(cleanUrl, { waitUntil: 'networkidle', timeout: 60_000 })
    const navigationStatus = response?.status() ?? 0
    const navigationContentType = response?.headers()['content-type'] ?? null

    // Collect diagnostics before any further processing so they are available
    // for the sparse-content error if needed.
    const [title, bodyText] = await Promise.all([
      page.title(),
      page.evaluate(() => document.body.innerText), // eslint-disable-line no-undef
    ])

    // Detect bot-challenge / access-denied pages before we try to parse them.
    if (bodyText.length < MIN_CONTENT_LENGTH) {
      const preview = bodyText.slice(0, 200)
      const imageCount = await page.evaluate(() => document.querySelectorAll('img').length) // eslint-disable-line no-undef
      const err = new Error(
        'Listing page returned too little content — the site may have blocked the request or hidden the listing details.',
      )
      err.code = 'sparse-content'
      err.diagnostics = {
        navigationStatus,
        navigationContentType,
        loadedUrl: page.url(),
        title,
        textLength: bodyText.length,
        imageCount,
        preview,
        hasCaptcha: /captcha/i.test(bodyText),
        hasVerifyPrompt: /verify|press\s+&?\s*hold/i.test(bodyText),
        hasAccessDenied: /access\s+(to\s+this\s+page\s+has\s+been\s+)?denied/i.test(bodyText),
        hasRobotCheck: /robot|bot\s+check/i.test(bodyText),
      }
      throw err
    }

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

    // Fallback: return visible text and any images found in the rendered DOM
    const domImages = await page.evaluate(() => {
      // eslint-disable-next-line no-undef
      return Array.from(document.images)
        .map(img => img.currentSrc || img.src)
        .filter(src => typeof src === 'string' && /^https?:/i.test(src))
    })
    return {
      text: bodyText || '',
      imageUrls: [...new Set(domImages)],
    }
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
