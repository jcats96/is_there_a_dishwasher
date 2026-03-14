/**
 * Unit tests for the Hugging Face vision proxy (server/vision.js).
 *
 * `fetch` is replaced with a vi.fn() stub so no real network request is made.
 * The dishwasher.png in this directory is converted to a data URL and used as
 * the imageUrl, just as the server would receive it from a real listing photo.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { proxyVisionRequest } from '../server/vision.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Build a base64 data URL from the bundled test image. */
function getDishwasherImageDataUrl() {
  const imgPath = join(__dirname, 'dishwasher.png')
  const data = readFileSync(imgPath)
  return `data:image/png;base64,${data.toString('base64')}`
}

/** Create a minimal Response-like object that vi.fn() can return. */
function makeFetchResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

const FAKE_TOKEN = 'hf_testtoken'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('proxyVisionRequest', () => {
  it('uses the router.huggingface.co endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeFetchResponse({
        body: { choices: [{ message: { content: 'yes' } }] },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await proxyVisionRequest(getDishwasherImageDataUrl(), FAKE_TOKEN)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://router.huggingface.co/models/openbmb/MiniCPM-V-2/v1/chat/completions',
    )
  })

  it('returns { found: true } when the model answers "yes"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeFetchResponse({
          body: { choices: [{ message: { content: 'yes' } }] },
        }),
      ),
    )

    const result = await proxyVisionRequest(getDishwasherImageDataUrl(), FAKE_TOKEN)
    expect(result).toEqual({ found: true })
  })

  it('returns { found: false } when the model answers "no"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeFetchResponse({
          body: { choices: [{ message: { content: 'no' } }] },
        }),
      ),
    )

    const result = await proxyVisionRequest(getDishwasherImageDataUrl(), FAKE_TOKEN)
    expect(result).toEqual({ found: false })
  })

  it('throws an auth error on HTTP 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeFetchResponse({ ok: false, status: 401 })),
    )

    await expect(proxyVisionRequest(getDishwasherImageDataUrl(), FAKE_TOKEN)).rejects.toMatchObject({
      isAuthError: true,
      status: 401,
    })
  })

  it('throws a 503 error when the model is loading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeFetchResponse({ ok: false, status: 503 })),
    )

    await expect(proxyVisionRequest(getDishwasherImageDataUrl(), FAKE_TOKEN)).rejects.toMatchObject({
      status: 503,
    })
  })

  it('throws when fetch itself fails (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network error')))

    await expect(proxyVisionRequest(getDishwasherImageDataUrl(), FAKE_TOKEN)).rejects.toThrow(
      'Could not reach the Hugging Face API',
    )
  })
})
