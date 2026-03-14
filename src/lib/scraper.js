/**
 * Fetches a Zillow listing page via a CORS proxy and extracts
 * all text content and listing photo URLs.
 */

const CORS_PROXY = 'https://api.allorigins.win/raw?url='

/**
 * @param {string} url  A zillow.com listing URL
 * @returns {{ text: string, imageUrls: string[] }}
 */
export async function scrapeListing(url) {
  const parsed = new URL(url)
  if (!['zillow.com', 'www.zillow.com'].includes(parsed.hostname)) {
    throw new Error('Only Zillow listing URLs are supported (zillow.com).')
  }

  const proxyUrl = CORS_PROXY + encodeURIComponent(url)
  let res
  try {
    res = await fetch(proxyUrl, { signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new Error('Could not reach the CORS proxy. Check your internet connection and try again.')
  }
  if (!res.ok) throw new Error(`Could not fetch listing (HTTP ${res.status}).`)

  const html = await res.text()
  if (html.length < 5_000) {
    throw new Error(
      'Listing page returned too little content — Zillow may have blocked the request.',
    )
  }

  return parseHtml(html)
}

function parseHtml(html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Prefer Zillow's embedded Next.js data blob (structured JSON)
  const scriptTag = doc.querySelector('script#__NEXT_DATA__')
  if (scriptTag) {
    try {
      const json = JSON.parse(scriptTag.textContent)
      return extractFromJson(json)
    } catch {
      // fall through to plain DOM text
    }
  }

  return { text: doc.body?.textContent ?? '', imageUrls: [] }
}

function extractFromJson(obj) {
  const texts = []
  const imageUrls = new Set()

  function walk(node) {
    if (typeof node === 'string') {
      if (node.length > 2) texts.push(node)
    } else if (Array.isArray(node)) {
      node.forEach(walk)
    } else if (node && typeof node === 'object') {
      for (const [key, val] of Object.entries(node)) {
        // Collect JPEG/PNG/WebP image URLs found under common key names
        if (
          typeof val === 'string' &&
          val.startsWith('https://') &&
          /\.(jpe?g|png|webp)/i.test(val) &&
          (key === 'url' || key === 'src' || /image/i.test(key))
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
