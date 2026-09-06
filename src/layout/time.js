/**
 * @typedef {Object} ScheduleEvent  An event in the weekly pattern; mirrors the `events` tab.
 * @property {string} id
 * @property {number} day            1 = Понеділок … 7 = Неділя (ISO weekday)
 * @property {string} start          `HH:MM` 24-hour. Odd minutes are normal — `17:45` is real.
 * @property {number} duration_min   Canonical. End time is always derived (CLAUDE.md rule 6).
 * @property {string} title
 * @property {string} colour         Palette token, never a hex value.
 * @property {string} [note]
 */

/**
 * @typedef {Object} Interval  Half-open minute range `[startMin, endMin)`.
 * @property {number} startMin
 * @property {number} endMin
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export const MINUTES_PER_DAY = 24 * 60

/**
 * `HH:MM` to minutes since midnight.
 *
 * Strict on purpose. A human edits the Sheet directly, so malformed input is a real
 * possibility — better a loud failure than a block silently drawn at midnight.
 *
 * @param {string} hhmm
 * @returns {number}
 */
export function parseTime(hhmm) {
  const m = HHMM.exec(String(hhmm))
  if (!m) throw new Error(`invalid time "${hhmm}", expected HH:MM 24-hour`)
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Returns null instead of throwing, for render paths that must not crash.
 * @param {string} hhmm
 * @returns {number | null}
 */
export function tryParseTime(hhmm) {
  const m = HHMM.exec(String(hhmm))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * @param {number} minutes
 * @returns {string}
 */
export function formatTime(minutes) {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Derived, never stored.
 * @param {{ start: string, duration_min: number }} event
 * @returns {Interval}
 */
export function intervalOf(event) {
  const startMin = parseTime(event.start)
  return { startMin, endMin: startMin + event.duration_min }
}

/**
 * True when two intervals genuinely collide.
 *
 * The strict inequalities matter: an event ending at 17:00 and one starting at 17:00
 * are adjacent, not overlapping, and must not be split into columns. The real schedule
 * has exactly this on Неділя (Японська 16:00–17:00, Історія 17:00–18:00).
 *
 * @param {Interval} a
 * @param {Interval} b
 * @returns {boolean}
 */
export function overlaps(a, b) {
  return a.startMin < b.endMin && b.startMin < a.endMin
}
