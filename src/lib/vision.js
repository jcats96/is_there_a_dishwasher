/**
 * Vision-based dishwasher detection via the Hugging Face Inference API.
 * Uses openbmb/MiniCPM-V-2, a vision-language model, to analyze a single
 * listing photo and answer whether a dishwasher is visible.
 */

export const MODEL = 'openbmb/MiniCPM-V-2'
const HF_ENDPOINT = `https://api-inference.huggingface.co/models/${MODEL}/v1/chat/completions`
const PROMPT =
  'Does this photo show a dishwasher? Answer with exactly one word: yes or no.'

/**
 * @param {string} imageUrl   A publicly accessible image URL
 * @param {string} hfToken    A Hugging Face API token (hf_…)
 * @returns {Promise<boolean>}
 */
export async function checkImageForDishwasher(imageUrl, hfToken) {
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
    throw new Error('Could not reach the Hugging Face API. Check your internet connection.')
  }

  if (res.status === 401 || res.status === 403) {
    const err = new Error('Invalid Hugging Face token — check your token and try again.')
    err.isAuthError = true
    throw err
  }

  if (res.status === 503) {
    // Model is cold-starting on HF serverless inference
    throw new Error(
      'The MiniCPM-V-2 model is loading on Hugging Face — please wait a moment and try again.',
    )
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Vision API error (HTTP ${res.status}).`)
  }

  const data = await res.json()
  const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim() ?? ''
  return answer.includes('yes')
}
