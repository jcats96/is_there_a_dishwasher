/**
 * Server-side Hugging Face Inference API proxy for vision-based dishwasher detection.
 *
 * Called by both the Vite dev-server plugin (vite.config.js) and the
 * production Express server (server/index.js).
 *
 * Running the HF request here (instead of directly from the browser) avoids
 * CORS restrictions that block cross-origin requests with Authorization headers.
 */

const MODEL = 'openbmb/MiniCPM-V-2'
const HF_ENDPOINT = `https://api-inference.huggingface.co/models/${MODEL}/v1/chat/completions`
const PROMPT = 'Does this photo show a dishwasher? Answer with exactly one word: yes or no.'

/**
 * Forward a single image to the HF Inference API and return whether a
 * dishwasher is visible.
 *
 * @param {string} imageUrl   A publicly accessible image URL
 * @param {string} hfToken    A Hugging Face API token (hf_…)
 * @returns {Promise<{ found: boolean }>}
 */
export async function proxyVisionRequest(imageUrl, hfToken) {
  let res
  try {
    res = await fetch(HF_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    const err = new Error('Could not reach the Hugging Face API. Check your internet connection.')
    err.status = 502
    throw err
  }

  if (res.status === 401 || res.status === 403) {
    const err = new Error('Invalid Hugging Face token — check your token and try again.')
    err.status = res.status
    err.isAuthError = true
    throw err
  }

  if (res.status === 503) {
    const err = new Error(
      'The MiniCPM-V-2 model is loading on Hugging Face — please wait a moment and try again.',
    )
    err.status = 503
    throw err
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `Vision API error (HTTP ${res.status}).`)
    err.status = res.status
    throw err
  }

  const data = await res.json()
  const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim() ?? ''
  return { found: answer.includes('yes') }
}
