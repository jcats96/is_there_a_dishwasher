/**
 * Text-based dishwasher detection.
 * Searches the listing text for the word "dishwasher" (case-insensitive)
 * and returns the surrounding context as evidence.
 *
 * @param {string} text
 * @returns {{ has_dishwasher: boolean, method: 'text', evidence: string|null }}
 */
export function checkText(text) {
  const match = text.match(/dishwasher/i)
  if (!match) {
    return { has_dishwasher: false, method: 'text', evidence: null }
  }

  const idx = match.index
  const start = Math.max(0, idx - 80)
  const end = Math.min(text.length, idx + match[0].length + 80)
  const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim()
  const evidence =
    (start > 0 ? '\u2026' : '') + snippet + (end < text.length ? '\u2026' : '')

  return { has_dishwasher: true, method: 'text', evidence }
}
