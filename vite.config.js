import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { scrapeListing, validateUrl } from './server/scrape.js'

/**
 * Vite dev-server plugin that exposes /api/scrape backed by a headless
 * Playwright browser.  This runs only during `npm run dev` — the production
 * server (server/index.js) provides the same endpoint.
 */
function scrapeApiPlugin() {
  return {
    name: 'scrape-api',

    configureServer(server) {
      addScrapeMiddleware(server.middlewares)
    },

    // Also wire up the preview server so `npm run preview` works
    configurePreviewServer(server) {
      addScrapeMiddleware(server.middlewares)
    },
  }
}

function addScrapeMiddleware(middlewares) {
  middlewares.use('/api/scrape', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ detail: 'Method not allowed' }))
      return
    }

    const MAX_BODY = 4_096 // bytes — a URL won't exceed this
    let body = ''
    let bodySize = 0

    req.on('data', chunk => {
      bodySize += chunk.length
      if (bodySize > MAX_BODY) {
        res.statusCode = 413
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ detail: 'Request body too large.' }))
        req.destroy()
        return
      }
      body += chunk
    })
    req.on('end', async () => {
      if (res.writableEnded) return

      let parsed
      try {
        parsed = JSON.parse(body)
      } catch {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ detail: 'Invalid JSON in request body.' }))
        return
      }

      const { url } = parsed

      try {
        validateUrl(url)
      } catch (err) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ detail: err.message }))
        return
      }

      try {
        const result = await scrapeListing(url)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result))
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ detail: err.message }))
      }
    })
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), scrapeApiPlugin()],
})

