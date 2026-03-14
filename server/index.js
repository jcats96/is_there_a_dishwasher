/**
 * Production Express server for Is There a Dishwasher?
 *
 * Serves the Vite-built static files from `dist/` and exposes the
 * headless-browser scraping API on /api/scrape.
 *
 * Usage:
 *   npm run build   # build the React frontend
 *   npm start       # run this server on PORT (default 3000)
 */

import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { rateLimit } from 'express-rate-limit'
import { scrapeListing, validateUrl } from './scrape.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(express.json({ limit: '4kb' }))

// Rate-limit all routes: max 30 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(limiter)

// Serve the Vite production build
app.use(express.static(join(__dirname, '..', 'dist')))

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body ?? {}

  try {
    validateUrl(url)
  } catch (err) {
    return res.status(400).json({ detail: err.message })
  }

  try {
    const result = await scrapeListing(url)
    res.json(result)
  } catch (err) {
    res.status(500).json({ detail: err.message })
  }
})

// SPA fallback — let React Router handle client-side routes
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
