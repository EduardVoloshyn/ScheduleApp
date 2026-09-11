import { fitAxis, ratio, ratioOfDuration } from './axis.js'
import { assignColumns } from './overlap.js'
import { tryParseTime } from './time.js'

/**
 * @typedef {Object} PlacedEvent
 *   An event resolved to fractions of its container. `top`/`height` are fractions of
 *   the axis; `left`/`width` are fractions of the day column. Fractions rather than
 *   pixels, so the result works at any size and the maths stays testable with no DOM.
 * @property {import('./time.js').ScheduleEvent} event
 * @property {number} startMin
 * @property {number} endMin
 * @property {number} top
 * @property {number} height
 * @property {number} left
 * @property {number} width
 * @property {number} column
 * @property {number} columns
 */

/**
 * @typedef {Object} WeekLayout
 * @property {import('./axis.js').Axis} axis
 * @property {Record<number, PlacedEvent[]>} days
 * @property {{ event: import('./time.js').ScheduleEvent, reason: string }[]} invalid
 */

export const DAYS = [1, 2, 3, 4, 5, 6, 7]

/**
 * Empty space above the first event and below the last.
 *
 * Without it the outermost blocks sit flush against the header and the bottom edge,
 * which makes the grid harder to read at a glance — there is nothing to anchor the day
 * against. An hour either side is enough, and keeping both the same keeps the week
 * visually balanced rather than top-heavy.
 */
export const EDGE_PAD_MIN = 60

/** Full names, no abbreviations and no dates — the model has none. */
export const DAY_NAMES = {
  1: 'Понеділок',
  2: 'Вівторок',
  3: 'Середа',
  4: 'Четвер',
  5: "П'ятниця",
  6: 'Субота',
  7: 'Неділя',
}

/**
 * Splits events into usable and unusable. A malformed row is a real possibility — the
 * owner edits the Sheet by hand — so it is reported rather than crashing the render or
 * silently vanishing.
 *
 * @param {ReadonlyArray<import('./time.js').ScheduleEvent>} events
 */
function resolve(events) {
  const ok = []
  const invalid = []

  for (const event of events) {
    const startMin = tryParseTime(event.start)
    if (startMin === null) {
      invalid.push({ event, reason: `недійсний час "${event.start}"` })
      continue
    }
    const duration = Number(event.duration_min)
    if (!Number.isFinite(duration) || duration <= 0) {
      invalid.push({ event, reason: `недійсна тривалість "${event.duration_min}"` })
      continue
    }
    const day = Number(event.day)
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      invalid.push({ event, reason: `день поза межами "${event.day}"` })
      continue
    }
    ok.push({ event, day, interval: { startMin, endMin: startMin + duration } })
  }

  return { ok, invalid }
}

/**
 * Places already-resolved rows against a decided axis.
 * @param {{ event: import('./time.js').ScheduleEvent, interval: import('./time.js').Interval }[]} rows
 * @param {import('./axis.js').Axis} axis
 * @returns {PlacedEvent[]}
 */
function place(rows, axis) {
  const byStart = [...rows].sort(
    (a, b) =>
      a.interval.startMin - b.interval.startMin || b.interval.endMin - a.interval.endMin,
  )
  const slots = assignColumns(byStart.map((r) => r.interval))

  return byStart.map((r, i) => {
    const slot = slots[i]
    return {
      event: r.event,
      startMin: r.interval.startMin,
      endMin: r.interval.endMin,
      top: ratio(axis, r.interval.startMin),
      height: ratioOfDuration(axis, r.interval.endMin - r.interval.startMin),
      left: slot.column / slot.columns,
      width: 1 / slot.columns,
      column: slot.column,
      columns: slot.columns,
    }
  })
}

/**
 * One day's events against an already-decided axis.
 * @param {ReadonlyArray<import('./time.js').ScheduleEvent>} events
 * @param {import('./axis.js').Axis} axis
 */
export function layoutDay(events, axis) {
  const { ok, invalid } = resolve(events)
  return { placed: place(ok, axis), invalid }
}

/**
 * The main entry point: events in, positioned blocks per day out.
 *
 * Everything is a 0–1 fraction, so this is pure arithmetic — no DOM, no assumptions
 * about pixel size. That is what keeps it testable.
 *
 * `fit: 'week'` uses one axis for the whole week, so switching days never rescales.
 * `fit: 'day'` fits each day to itself, which reads better on a phone but makes the
 * scale jump as you navigate. Week-wide is the default; which reads better on a phone
 * is still an open question.
 *
 * @param {ReadonlyArray<import('./time.js').ScheduleEvent>} events
 * @param {{ fit?: 'week' | 'day', snapToHour?: boolean, minSpanMin?: number,
 *           fallback?: { startMin: number, endMin: number } }} [options]
 * @returns {WeekLayout}
 */
export function layoutWeek(events, options = {}) {
  const { fit = 'week', ...fitOptions } = options
  const { ok, invalid } = resolve(events)

  const padded = { padStartMin: EDGE_PAD_MIN, padEndMin: EDGE_PAD_MIN, ...fitOptions }

  const axis = fitAxis(
    ok.map((r) => r.interval),
    padded,
  )

  /** @type {Record<number, PlacedEvent[]>} */
  const days = {}
  for (const day of DAYS) {
    const rows = ok.filter((r) => r.day === day)
    const dayAxis =
      fit === 'day' ? fitAxis(rows.map((r) => r.interval), padded) : axis
    days[day] = place(rows, dayAxis)
  }

  return { axis, days, invalid }
}
