/**
 * Vision-based dishwasher detection via the local /api/vision endpoint.
 *
 * The actual Hugging Face Inference API call is made server-side to avoid
 * browser CORS restrictions on cross-origin requests with Authorization headers.
 */

export const MODEL = 'openbmb/MiniCPM-V-2'

/**
 * @param {string} imageUrl   A publicly accessible image URL
 * @param {string} hfToken    A Hugging Face API token (hf_…)
 * @returns {Promise<boolean>}
 */
export async function checkImageForDishwasher(imageUrl, hfToken) {
  let res
  try {
    res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, hfToken }),
      signal: AbortSignal.timeout(70_000),
    })
  } catch {
    throw new Error('Could not reach the vision server. Make sure the app server is running.')
  }

  const data = await res.json().catch(() => ({}))

  if (res.status === 401 || res.status === 403 || data.isAuthError) {
    const err = new Error(data.detail || 'Invalid Hugging Face token — check your token and try again.')
    err.isAuthError = true
    throw err
  }

  if (!res.ok) {
    throw new Error(data.detail || `Vision API error (HTTP ${res.status}).`)
  }

  return data.found === true
}
