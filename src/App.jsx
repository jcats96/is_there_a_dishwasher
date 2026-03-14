import { useState } from 'react'
import './App.css'
import { scrapeListing } from './lib/scraper'
import { checkText } from './lib/checker'
import { checkImageForDishwasher, MODEL } from './lib/vision'

const MAX_IMAGES = 10

function App() {
  const [url, setUrl] = useState('')
  const [hfToken, setHfToken] = useState(
    // localStorage takes precedence so a token entered in the UI is always used;
    // VITE_HF_TOKEN (baked in at build time) acts as a fallback default.
    () => localStorage.getItem('hf_token') || import.meta.env.VITE_HF_TOKEN || '',
  )
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [result, setResult] = useState(null)   // { has_dishwasher, method, evidence } | null
  const [error, setError] = useState(null)

  function handleTokenChange(e) {
    const val = e.target.value
    setHfToken(val)
    if (val) {
      localStorage.setItem('hf_token', val)
    } else {
      localStorage.removeItem('hf_token')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!url.trim()) return

    if (!hfToken.trim()) {
      setError('Please enter your Hugging Face API token in the settings below.')
      setShowTokenInput(true)
      return
    }

    setLoading(true)
    setResult(null)
    setError(null)

    try {
      // Step 1: fetch the Zillow page via CORS proxy
      setLoadingMsg('Rendering listing…')
      const { text, imageUrls } = await scrapeListing(url.trim())

      // Step 2: fast text check
      setLoadingMsg('Scanning listing text…')
      const textResult = checkText(text)
      if (textResult.has_dishwasher) {
        setResult(textResult)
        return
      }

      // Step 3: vision check on listing photos
      if (imageUrls.length === 0) {
        setResult({ has_dishwasher: false, method: 'text', evidence: null })
        return
      }

      const toCheck = imageUrls.slice(0, MAX_IMAGES)
      for (let i = 0; i < toCheck.length; i++) {
        setLoadingMsg(`Analyzing photo ${i + 1} of ${toCheck.length} with ${MODEL}…`)
        const found = await checkImageForDishwasher(toCheck[i], hfToken.trim())
        if (found) {
          setResult({ has_dishwasher: true, method: 'vision', evidence: toCheck[i] })
          return
        }
      }

      setResult({ has_dishwasher: false, method: 'vision', evidence: null })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      setLoadingMsg('')
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
          Stop squinting at listing photos. Paste a listing link and get an
          instant yes-or-no answer.
        </p>

        <form className="search-form" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="listing-url">
            Listing URL
          </label>
          <input
            id="listing-url"
            className="url-input"
            type="url"
            placeholder="https://www.zillow.com/homedetails/… or https://craigslist.org/…"
            value={url}
            onChange={e => setUrl(e.target.value)}
            required
            disabled={loading}
          />
          <button className="cta-button" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Check'}
          </button>
        </form>

        <div className="token-section">
          <button
            type="button"
            className="token-toggle"
            onClick={() => setShowTokenInput(v => !v)}
            aria-expanded={showTokenInput}
          >
            {showTokenInput ? '▲' : '▼'} Hugging Face API token
            {hfToken ? ' ✓' : ' (required)'}
          </button>
          {showTokenInput && (
            <div className="token-input-wrap">
              <label className="sr-only" htmlFor="hf-token">
                Hugging Face API token
              </label>
              <input
                id="hf-token"
                className="token-input"
                type="password"
                placeholder="hf_…"
                value={hfToken}
                onChange={handleTokenChange}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="token-hint">
                Get a free token at{' '}
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noreferrer"
                >
                  huggingface.co/settings/tokens
                </a>
                . Saved in your browser only.
              </p>
            </div>
          )}
        </div>

        {loading && (
          <div className="result-card loading" role="status">
            <span className="spinner" aria-hidden="true" />
            {loadingMsg || 'Working…'}
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
                Detected via:{' '}
                <em>
                  {result.method === 'vision'
                    ? `photo analysis (${MODEL})`
                    : 'text search'}
                </em>
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
              <strong>Render</strong> — A headless Chromium browser (Playwright)
              opens the listing page on the backend, waits for all JavaScript to
              finish executing, and extracts listing text and photo URLs from the
              fully-rendered page.
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
              blank, each listing photo is sent to{' '}
              <a
                href="https://huggingface.co/openbmb/MiniCPM-V-2"
                target="_blank"
                rel="noreferrer"
              >
                MiniCPM-V-2
              </a>{' '}
              via the Hugging Face Inference API with the question: &ldquo;Does
              this image show a dishwasher?&rdquo;
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
