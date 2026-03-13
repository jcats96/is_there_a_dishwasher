import { useState } from 'react'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)   // { has_dishwasher, method, evidence } | null
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

  function renderEvidence(result) {
    if (result.method === 'vision') {
      if (result.has_dishwasher && result.evidence) {
        return (
          <>
            <p className="evidence">Detected in listing photo:</p>
            <img
              src={result.evidence}
              alt="Listing photo showing a dishwasher"
              className="evidence-image"
            />
          </>
        )
      }
      return (
        <p className="evidence">
          No dishwasher was found in the listing text or photos.
        </p>
      )
    }

    // method === 'text'
    if (result.evidence) {
      return (
        <p className="evidence">Found in listing text: <em>{result.evidence}</em></p>
      )
    }
    return (
      <p className="evidence">
        The word &ldquo;dishwasher&rdquo; was not found in the listing text or
        photos.
      </p>
    )
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

        {loading && (
          <div className="result-card loading" role="status">
            <span className="spinner" aria-hidden="true" />
            Fetching listing and scanning text & photos…
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
              {renderEvidence(result)}
              <p className="method-badge">
                Detected via: <em>{result.method === 'vision' ? 'photo analysis' : 'text search'}</em>
              </p>
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
              listing page, including the description, amenities list, and
              photo gallery.
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
              <strong>Analyze photos</strong> — If the text check draws a
              blank, each listing photo is sent to a vision AI that answers
              one question: &ldquo;Does this image show a dishwasher?&rdquo;
            </div>
          </li>
          <li>
            <span className="step-number">4</span>
            <div>
              <strong>Report</strong> — You get a clear yes or no, the
              matching photo or text snippet, and which method found the
              answer.
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
