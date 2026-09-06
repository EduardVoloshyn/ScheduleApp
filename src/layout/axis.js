import { MINUTES_PER_DAY } from './time.js'

/**
 * @typedef {Object} Axis  The vertical time range a view is drawn against.
 * @property {number} startMin
 * @property {number} endMin
 * @property {number} spanMin
 */

export const HOUR = 60

const DEFAULT_MIN_SPAN = 4 * HOUR
const DEFAULT_FALLBACK = { startMin: 8 * HOUR, endMin: 20 * HOUR }

/**
 * Builds the axis from the intervals that will be drawn against it.
 *
 * True proportional scale, fitted to the real range rather than a fixed 00:00–24:00
 * window — so gaps read as genuine empty space without wasting screen on hours where
 * nothing ever happens.
 *
 * @param {ReadonlyArray<import('./time.js').Interval>} intervals
 * @param {{ snapToHour?: boolean, minSpanMin?: number,
 *           fallback?: { startMin: number, endMin: number } }} [options]
 * @returns {Axis}
 */
export function fitAxis(intervals, options = {}) {
  const snapToHour = options.snapToHour ?? true
  const minSpanMin = options.minSpanMin ?? DEFAULT_MIN_SPAN
  const fallback = options.fallback ?? DEFAULT_FALLBACK

  let startMin
  let endMin

  if (intervals.length === 0) {
    startMin = fallback.startMin
    endMin = fallback.endMin
  } else {
    startMin = Math.min(...intervals.map((i) => i.startMin))
    endMin = Math.max(...intervals.map((i) => i.endMin))
  }

  if (snapToHour) {
    startMin = Math.floor(startMin / HOUR) * HOUR
    endMin = Math.ceil(endMin / HOUR) * HOUR
  }

  // Grow to the minimum span, shifting upward only once the bottom hits midnight.
  if (endMin - startMin < minSpanMin) {
    endMin = startMin + minSpanMin
    if (endMin > MINUTES_PER_DAY) {
      endMin = MINUTES_PER_DAY
      startMin = Math.max(0, endMin - minSpanMin)
    }
  }

  startMin = Math.max(0, startMin)
  endMin = Math.min(MINUTES_PER_DAY, endMin)

  return { startMin, endMin, spanMin: endMin - startMin }
}

/**
 * Position within the axis as a 0–1 fraction. Clamped, so a stray event can never be
 * drawn outside its container.
 *
 * @param {Axis} axis
 * @param {number} minutes
 * @returns {number}
 */
export function ratio(axis, minutes) {
  if (axis.spanMin <= 0) return 0
  return clamp01((minutes - axis.startMin) / axis.spanMin)
}

/**
 * Height of a duration as a fraction of the axis.
 * @param {Axis} axis
 * @param {number} durationMin
 * @returns {number}
 */
export function ratioOfDuration(axis, durationMin) {
  if (axis.spanMin <= 0) return 0
  return clamp01(durationMin / axis.spanMin)
}

/**
 * Hour marks inside the axis. The step widens automatically on long spans so labels
 * never crowd.
 *
 * @param {Axis} axis
 * @param {number} [stepMin]
 * @returns {number[]}
 */
export function gridlines(axis, stepMin) {
  const step = stepMin ?? (axis.spanMin > 14 * HOUR ? 2 * HOUR : HOUR)
  const marks = []
  const first = Math.ceil(axis.startMin / step) * step
  for (let m = first; m <= axis.endMin; m += step) marks.push(m)
  return marks
}

/**
 * The inverse of `ratio()`: a 0–1 fraction of the axis back to minutes.
 *
 * This is what turns a pointer position into a time, so every drag, resize and
 * tap-to-create depends on it being exactly the inverse.
 *
 * @param {Axis} axis
 * @param {number} fraction
 * @returns {number}
 */
export function minutesAt(axis, fraction) {
  return axis.startMin + clamp01(fraction) * axis.spanMin
}

/**
 * Rounds to the nearest `step` minutes.
 *
 * 5 minutes by default, because the real schedule genuinely contains 16:40, 17:45 and
 * 18:15 — snapping to the half hour would make those uneditable.
 *
 * @param {number} minutes
 * @param {number} [step]
 * @returns {number}
 */
export function snapMinutes(minutes, step = 5) {
  if (step <= 0) return Math.round(minutes)
  return Math.round(minutes / step) * step
}

/** @param {number} n */
function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n
}
