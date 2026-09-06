/*
 * Emoji handling.
 *
 * The choices live in the Sheet as one `icons` setting — a single string of emoji the
 * owner edits by hand. There is deliberately no UI for editing it: a text cell in a
 * spreadsheet is already a better editor than anything worth building here.
 *
 * Splitting that string is the only hard part. An emoji is not a character:
 *
 *   '📚🇯🇵👨‍👩‍👧🏃‍♀️🎹'.split('')   → 13 broken pieces (surrogate halves)
 *   [...'📚🇯🇵👨‍👩‍👧🏃‍♀️🎹']       → 13 code points, flags and ZWJ groups torn apart
 *   grapheme segmentation           → the 5 emoji actually intended
 *
 * So this uses Intl.Segmenter, with fallbacks for engines that lack it.
 */

/** Used until the Sheet has an `icons` setting of its own. */
export const DEFAULT_ICONS = '📚🌍🧪🌱🔬🔭📐🧮🎹🎧🗣📜💡🏃🍽💤👤🎨'

/** Guards against a pathological paste into the settings cell. */
export const MAX_CHOICES = 60

let segmenter = null
function graphemeSegmenter() {
  if (segmenter !== null) return segmenter
  try {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  } catch {
    segmenter = false
  }
  return segmenter
}

/**
 * Splits text into user-perceived characters — what a person would call "one emoji".
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitGraphemes(text) {
  const value = String(text ?? '')
  if (!value) return []

  const seg = graphemeSegmenter()
  if (seg) return Array.from(seg.segment(value), (part) => part.segment)

  // Fallback: keep ZWJ sequences, variation selectors, skin-tone modifiers and regional
  // indicator pairs (flags) together. Coarser than real segmentation, but correct for
  // the emoji this field actually holds.
  const pattern =
    /(?:\p{RI}\p{RI})|(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)|[\s\S]/gu
  return value.match(pattern) ?? []
}

/**
 * Parses the `icons` setting into a list of choices.
 *
 * Permissive about separators: the owner may type them run together, or spaced, or
 * comma-separated — all of those should work, because the alternative is a rule they
 * have to remember while editing a spreadsheet cell.
 *
 * @param {string} value
 * @returns {string[]}
 */
export function parseIconChoices(value) {
  const cleaned = String(value ?? '').replace(/[\s,;|]+/g, '')
  const seen = new Set()
  const choices = []

  for (const grapheme of splitGraphemes(cleaned)) {
    if (!grapheme || seen.has(grapheme)) continue
    seen.add(grapheme)
    choices.push(grapheme)
    if (choices.length >= MAX_CHOICES) break
  }

  return choices
}

/**
 * Reduces any input to a single emoji — an event's icon is exactly one, or none.
 *
 * @param {string} value
 * @returns {string}
 */
export function firstIcon(value) {
  const cleaned = String(value ?? '').trim()
  if (!cleaned) return ''
  return splitGraphemes(cleaned)[0] ?? ''
}

/**
 * The choices to offer, given the settings map. Falls back to a sensible row so the
 * picker is never empty — including before the Sheet has the setting at all.
 *
 * @param {Record<string, string>} settings
 * @returns {string[]}
 */
export function iconChoicesFrom(settings) {
  const configured = parseIconChoices(settings?.icons)
  return configured.length > 0 ? configured : parseIconChoices(DEFAULT_ICONS)
}
