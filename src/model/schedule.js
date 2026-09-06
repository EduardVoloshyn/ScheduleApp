import { MINUTES_PER_DAY, formatTime, parseTime } from '../layout/time.js'
import { firstIcon } from './icons.js'

/*
 * Pure event mutations. No DOM, no network, no clock — every function takes the event
 * list and returns a new one, so the whole editing model is testable in isolation.
 *
 * `duration_min` stays canonical throughout (CLAUDE.md rule 6): moving an event keeps
 * its length, and only an explicit resize changes it.
 */

export const MIN_DURATION = 5
/**
 * An icon is exactly one emoji, or none. The cap is on code units rather than
 * characters because a single emoji can be several — 🏃‍♀️ is five.
 */
export const MAX_ICON = 12
export const PALETTE = ['slate', 'blue', 'red', 'amber', 'green', 'violet', 'teal', 'rose']

/** Not a security measure — an id only has to be unique within one small schedule. */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** @param {number} n @param {number} lo @param {number} hi */
function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n
}

/**
 * Keeps an event inside its day. The model has no dates, so nothing can run past
 * midnight — an event dragged off the bottom is pinned rather than wrapped.
 *
 * @param {number} startMin
 * @param {number} durationMin
 */
export function fitWithinDay(startMin, durationMin) {
  // Loud failure over silent corruption. `clamp` lets NaN through untouched, so an
  // undefined start once reached the Sheet as the string "NaN:NaN" before this guard.
  if (!Number.isFinite(startMin)) throw new Error(`invalid startMin: ${startMin}`)
  if (!Number.isFinite(durationMin)) throw new Error(`invalid durationMin: ${durationMin}`)

  const duration = clamp(Math.round(durationMin), MIN_DURATION, MINUTES_PER_DAY)
  const start = clamp(Math.round(startMin), 0, MINUTES_PER_DAY - duration)
  return { startMin: start, durationMin: duration }
}

/**
 * @param {{ day: number, startMin: number, durationMin: number, title?: string,
 *           colour?: string, icon?: string, category?: string, note?: string,
 *           id?: string }} spec
 * @returns {import('../layout/time.js').ScheduleEvent}
 */
export function createEvent(spec) {
  const { startMin, durationMin } = fitWithinDay(spec.startMin, spec.durationMin)
  return {
    id: spec.id ?? newId(),
    day: clamp(Math.round(spec.day), 1, 7),
    start: formatTime(startMin),
    duration_min: durationMin,
    title: (spec.title ?? '').trim(),
    colour: PALETTE.includes(spec.colour ?? '') ? spec.colour : 'slate',
    icon: firstIcon(spec.icon) || undefined,
    category: (spec.category ?? '').trim() || undefined,
    note: (spec.note ?? '').trim() || undefined,
  }
}

/** @param {ReadonlyArray<import('../layout/time.js').ScheduleEvent>} events @param {string} id */
export function findEvent(events, id) {
  return events.find((e) => e.id === id)
}

function replace(events, id, fn) {
  return events.map((e) => (e.id === id ? fn(e) : e))
}

/**
 * Moves an event, preserving its length. This is the rule that makes dragging feel
 * right — a lesson stays 45 minutes long wherever you put it.
 */
export function moveEvent(events, id, { day, startMin }) {
  return replace(events, id, (e) => {
    const fitted = fitWithinDay(startMin, e.duration_min)
    return {
      ...e,
      day: clamp(Math.round(day ?? e.day), 1, 7),
      start: formatTime(fitted.startMin),
      duration_min: fitted.durationMin,
    }
  })
}

/** Resizes from the bottom edge: the start is fixed, the length changes. */
export function resizeEvent(events, id, durationMin) {
  return replace(events, id, (e) => {
    const fitted = fitWithinDay(parseTime(e.start), durationMin)
    return { ...e, start: formatTime(fitted.startMin), duration_min: fitted.durationMin }
  })
}

/** Field edits from the detail sheet. An unknown colour is ignored, never stored. */
export function updateEvent(events, id, patch) {
  return replace(events, id, (e) => {
    const next = { ...e }
    if (patch.title !== undefined) next.title = String(patch.title).trim()
    if (patch.colour !== undefined && PALETTE.includes(patch.colour)) next.colour = patch.colour
    if (patch.icon !== undefined) next.icon = firstIcon(patch.icon) || undefined
    if (patch.category !== undefined) {
      next.category = String(patch.category).trim() || undefined
    }
    if (patch.note !== undefined) next.note = String(patch.note).trim() || undefined
    if (patch.day !== undefined) next.day = clamp(Math.round(Number(patch.day)), 1, 7)

    const start = patch.start !== undefined ? parseTime(patch.start) : parseTime(next.start)
    const duration =
      patch.duration_min !== undefined ? Number(patch.duration_min) : next.duration_min
    const fitted = fitWithinDay(start, duration)
    next.start = formatTime(fitted.startMin)
    next.duration_min = fitted.durationMin
    return next
  })
}

export function deleteEvent(events, id) {
  return events.filter((e) => e.id !== id)
}

/** A copy in a new slot, with a fresh id so both survive a save. */
export function duplicateEvent(events, id, { day, startMin } = {}) {
  const source = findEvent(events, id)
  if (!source) return events
  return [
    ...events,
    createEvent({
      day: day ?? source.day,
      startMin: startMin ?? parseTime(source.start),
      durationMin: source.duration_min,
      title: source.title,
      colour: source.colour,
      icon: source.icon,
      category: source.category,
      note: source.note,
    }),
  ]
}

/** @param {{ title: string, colour: string, duration_min: number }} template */
export function eventFromTemplate(template, { day, startMin }) {
  return createEvent({
    day,
    startMin,
    durationMin: template.duration_min,
    title: template.title,
    colour: template.colour,
    icon: template.icon,
    // Copied from the template, as asked: a template exists to carry its settings.
    category: template.category,
  })
}

/** A template captured from an existing event, for the P5 library. */
export function templateFromEvent(event) {
  return {
    id: newId(),
    title: event.title,
    colour: event.colour,
    icon: event.icon,
    category: event.category,
    duration_min: event.duration_min,
  }
}

/**
 * Whether an event can actually be rendered and saved.
 *
 * The API enforces the same rules, so an event failing this can never reach the Sheet —
 * it can only sit in the local cache blocking every future save.
 *
 * @param {any} event
 * @returns {boolean}
 */
export function isUsableEvent(event) {
  if (!event || typeof event !== 'object') return false
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(event.start))) return false
  const duration = Number(event.duration_min)
  if (!Number.isFinite(duration) || duration < 1) return false
  const day = Number(event.day)
  if (!Number.isInteger(day) || day < 1 || day > 7) return false
  return String(event.title ?? '').trim().length > 0
}

/**
 * Splits a list into what can be kept and what cannot.
 * @param {ReadonlyArray<any>} events
 */
export function partitionUsable(events) {
  const usable = []
  const dropped = []
  for (const event of events || []) (isUsableEvent(event) ? usable : dropped).push(event)
  return { usable, dropped }
}
