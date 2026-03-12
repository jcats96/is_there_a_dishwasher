import { useState } from 'react'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)   // { has_dishwasher, evidence } | null
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!url.trim()) return

    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Server error ${res.status}`)
      }

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-icon" aria-hidden="true">🍽️</div>
        <h1>Is There a Dishwasher?</h1>
        <p className="hero-tagline">
          Stop squinting at listing photos. Paste a Zillow link and get an
          instant yes-or-no answer.
        </p>

        <form className="search-form" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="listing-url">
            Zillow listing URL
          </label>
          <input
            id="listing-url"
            className="url-input"
            type="url"
            placeholder="https://www.zillow.com/homedetails/…"
            value={url}
            onChange={e => setUrl(e.target.value)}
            required
            disabled={loading}
          />
          <button className="cta-button" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Check'}
          </button>
        </form>

        <p className="text-only-notice">
          ⚠️ <strong>v0.1 — text search only.</strong> This version searches
          the listing description and amenities list for the word
          &ldquo;dishwasher&rdquo;. Photo analysis is coming in a future
          release.
        </p>

        {loading && (
          <div className="result-card loading" role="status">
            <span className="spinner" aria-hidden="true" />
            Fetching listing and scanning text…
          </div>
        )}

        {error && (
          <div className="result-card result-error" role="alert">
            <span className="result-icon">⚠️</span>
            <div>
              <strong>Could not check this listing.</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {result && !loading && (
          <div
            className={`result-card ${result.has_dishwasher ? 'result-yes' : 'result-no'}`}
            role="status"
          >
            <span className="result-icon" aria-hidden="true">
              {result.has_dishwasher ? '✅' : '❌'}
            </span>
            <div>
              <strong>
                Dishwasher: {result.has_dishwasher ? 'Yes' : 'No'}
              </strong>
              {result.evidence ? (
                <p className="evidence">Found in listing text: <em>{result.evidence}</em></p>
              ) : (
                <p className="evidence">
                  The word &ldquo;dishwasher&rdquo; was not found in the
                  listing text. Photo analysis (coming soon) may give a more
                  definitive answer.
                </p>
              )}
            </div>
          </div>
        )}
      </header>

      <section className="section" id="how-it-works">
        <h2>How It Works</h2>
        <ol className="steps">
          <li>
            <span className="step-number">1</span>
            <div>
              <strong>Fetch</strong> — The backend retrieves the full Zillow
              listing page, including the description and amenities list.
            </div>
          </li>
          <li>
            <span className="step-number">2</span>
            <div>
              <strong>Search text</strong> — The listing text is scanned for
              the word <em>&ldquo;dishwasher&rdquo;</em> (case-insensitive).
              This catches explicit mentions in the description or the
              amenities checklist.
            </div>
          </li>
          <li>
            <span className="step-number">3</span>
            <div>
              <strong>Report</strong> — You get a clear yes or no, plus the
              exact text snippet where &ldquo;dishwasher&rdquo; was found.
            </div>
          </li>
          <li>
            <span className="step-number">4</span>
            <div>
              <strong>Photo analysis <span className="badge-soon">coming soon</span></strong>{' '}
              — A local vision model will scan listing photos when the text
              check draws a blank, at no extra cost.
            </div>
          </li>
        </ol>
      </section>

      <footer className="footer">
        <p>
          Built with vibe coding •{' '}
          <a
            href="https://github.com/jcats96/is_there_a_dishwasher"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
