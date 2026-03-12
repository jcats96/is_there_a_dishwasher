import './App.css'

function App() {
  return (
    <div className="page">
      <header className="hero">
        <div className="hero-icon" aria-hidden="true">🍽️</div>
        <h1>Is There a Dishwasher?</h1>
        <p className="hero-tagline">
          Stop squinting at listing photos. Let AI answer the one question
          every apartment hunter really needs to know.
        </p>
        <a
          className="cta-button"
          href="https://github.com/jcats96/is_there_a_dishwasher"
          target="_blank"
          rel="noreferrer"
        >
          View on GitHub
        </a>
      </header>

      <section className="section" id="problem">
        <h2>The Problem</h2>
        <p>
          Searching for an apartment is tedious. Listings on Zillow, Apartments.com,
          and similar sites include dozens of photos, but none of them are labeled
          "this unit has a dishwasher." You end up scrolling through bedroom shots,
          bathroom tiles, and blurry closet photos just to answer one simple
          question.
        </p>
      </section>

      <section className="section" id="solution">
        <h2>The Solution</h2>
        <p>
          <strong>Is There a Dishwasher?</strong> scrapes apartment listings and
          checks for a dishwasher in the fastest way possible: first by scanning
          the listing text, then — only if necessary — by running AI vision on
          the photos. Enter a listing URL and get a confident yes-or-no answer
          in seconds.
        </p>
      </section>

      <section className="section" id="how-it-works">
        <h2>How It Works</h2>
        <ol className="steps">
          <li>
            <span className="step-number">1</span>
            <div>
              <strong>Scrape</strong> — The backend fetches the full listing
              page (text, amenities, and photos) from the provided URL.
            </div>
          </li>
          <li>
            <span className="step-number">2</span>
            <div>
              <strong>Check text first</strong> — The listing description and
              amenities are scanned for the word <em>"dishwasher"</em>. If
              found, the answer is immediately returned — no image analysis
              needed.
            </div>
          </li>
          <li>
            <span className="step-number">3</span>
            <div>
              <strong>Analyze photos (fallback)</strong> — If the text check
              comes up empty, each listing photo is passed through a vision
              model to detect whether a dishwasher is visible.
            </div>
          </li>
          <li>
            <span className="step-number">4</span>
            <div>
              <strong>Report</strong> — The result is returned to the frontend
              as a clear answer, along with the text snippet or evidence image
              that confirmed it.
            </div>
          </li>
        </ol>
      </section>

      <section className="section" id="tech">
        <h2>Technology Stack</h2>
        <ul className="tech-list">
          <li><span className="badge">Frontend</span> React (Vite)</li>
          <li><span className="badge">Scraper</span> Python + BeautifulSoup / Playwright</li>
          <li><span className="badge">Vision</span> OpenAI Vision API (GPT-4o) or a fine-tuned image classifier</li>
          <li><span className="badge">API</span> FastAPI (Python)</li>
        </ul>
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
