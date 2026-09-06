import { eq, ok, test } from './harness.js'
import {
  DEFAULT_ICONS,
  MAX_CHOICES,
  firstIcon,
  iconChoicesFrom,
  parseIconChoices,
  splitGraphemes,
} from '../src/model/icons.js'

/*
 * The whole point of this module: an emoji is not a character. Every test here would
 * pass trivially with .split('') for plain emoji and fail for flags and ZWJ sequences,
 * which is exactly the data a Ukrainian/Japanese schedule contains.
 */

test('splitGraphemes keeps multi-codepoint emoji whole', () => {
  eq(splitGraphemes('📚🇯🇵👨‍👩‍👧🏃‍♀️🎹'), ['📚', '🇯🇵', '👨‍👩‍👧', '🏃‍♀️', '🎹'])
})

test('naive splitting would have been wrong — this is why the module exists', () => {
  const text = '🇯🇵👨‍👩‍👧'
  eq(splitGraphemes(text).length, 2)
  ok([...text].length > 2, 'code-point iteration unexpectedly matched')
})

test('splitGraphemes handles skin tones and variation selectors', () => {
  eq(splitGraphemes('👍🏽').length, 1)
  eq(splitGraphemes('🏃‍♀️').length, 1)
})

test('splitGraphemes copes with empty and non-string input', () => {
  eq(splitGraphemes(''), [])
  eq(splitGraphemes(null), [])
  eq(splitGraphemes(undefined), [])
})

test('parseIconChoices reads a run-together string', () => {
  eq(parseIconChoices('📚🎹🧪'), ['📚', '🎹', '🧪'])
})

test('parseIconChoices accepts spaces, commas and pipes as separators', () => {
  // The owner types this into a spreadsheet cell; a separator rule they must remember
  // would be a bad trade.
  eq(parseIconChoices('📚 🎹 🧪'), ['📚', '🎹', '🧪'])
  eq(parseIconChoices('📚,🎹,🧪'), ['📚', '🎹', '🧪'])
  eq(parseIconChoices(' 📚 | 🎹 ; 🧪 '), ['📚', '🎹', '🧪'])
})

test('parseIconChoices removes duplicates, keeping the first', () => {
  eq(parseIconChoices('📚🎹📚🧪🎹'), ['📚', '🎹', '🧪'])
})

test('parseIconChoices caps a pathological paste', () => {
  ok(parseIconChoices('🎹'.repeat(500)).length <= MAX_CHOICES)
  ok(parseIconChoices(Array.from({ length: 200 }, (_, i) => String.fromCodePoint(0x1f300 + i)).join('')).length
     <= MAX_CHOICES)
})

test('parseIconChoices returns nothing for empty input', () => {
  eq(parseIconChoices(''), [])
  eq(parseIconChoices(undefined), [])
})

test('firstIcon reduces any input to one emoji', () => {
  eq(firstIcon('🎹'), '🎹')
  eq(firstIcon('🎹🧪📚'), '🎹')
  eq(firstIcon('  🇯🇵  '), '🇯🇵')
  eq(firstIcon('👨‍👩‍👧🎹'), '👨‍👩‍👧')
})

test('firstIcon returns an empty string for nothing', () => {
  eq(firstIcon(''), '')
  eq(firstIcon('   '), '')
  eq(firstIcon(undefined), '')
})

test('iconChoicesFrom prefers the Sheet setting', () => {
  eq(iconChoicesFrom({ icons: '📚🎹' }), ['📚', '🎹'])
})

test('iconChoicesFrom falls back when the setting is absent or blank', () => {
  const fallback = parseIconChoices(DEFAULT_ICONS)
  eq(iconChoicesFrom({}), fallback)
  eq(iconChoicesFrom({ icons: '   ' }), fallback)
  eq(iconChoicesFrom(undefined), fallback)
  ok(fallback.length >= 10, 'the default row should be a usable size')
})
