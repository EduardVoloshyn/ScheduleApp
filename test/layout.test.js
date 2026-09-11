import { close, eq, ok, test, throws } from './harness.js'
import { SEED_EVENTS } from '../src/fixtures/seed.js'
import {
  assignColumns,
  fitAxis,
  formatTime,
  gridlines,
  hasOverlap,
  HOUR,
  layoutWeek,
  overlaps,
  parseTime,
  ratio,
  tryParseTime,
} from '../src/layout/index.js'

const iv = (start, minutes) => ({
  startMin: parseTime(start),
  endMin: parseTime(start) + minutes,
})
const seedIntervals = (day) =>
  SEED_EVENTS.filter((e) => day === undefined || e.day === day).map((e) =>
    iv(e.start, e.duration_min),
  )

/* ------------------------------------------------------------------- time ---- */

test('parseTime handles arbitrary minutes, not just :00 and :30', () => {
  eq(parseTime('17:45'), 17 * 60 + 45)
  eq(parseTime('16:40'), 16 * 60 + 40)
  eq(parseTime('00:00'), 0)
  eq(parseTime('23:59'), 23 * 60 + 59)
})

test('parseTime rejects malformed input loudly', () => {
  for (const bad of ['9:00', '24:00', '10:60', '1000', '', 'ранок', '10:0']) {
    throws(() => parseTime(bad), bad)
    eq(tryParseTime(bad), null, bad)
  }
})

test('formatTime round-trips', () => {
  for (const t of ['00:00', '09:05', '17:45', '23:59']) eq(formatTime(parseTime(t)), t)
})

test('touching events are adjacent, not overlapping', () => {
  // The real Sunday case: Японська 16:00–17:00 then Історія 17:00–18:00.
  eq(overlaps(iv('16:00', 60), iv('17:00', 60)), false)
})

test('a genuine collision is detected', () => {
  // The real Saturday case: Вектор 16:40–17:40, Еврика 17:00–18:00.
  eq(overlaps(iv('16:40', 60), iv('17:00', 60)), true)
})

test('containment counts as overlap', () => {
  eq(overlaps(iv('10:00', 180), iv('11:00', 30)), true)
})

test('overlaps is symmetric', () => {
  eq(overlaps(iv('10:00', 60), iv('10:30', 60)), overlaps(iv('10:30', 60), iv('10:00', 60)))
})

/* ------------------------------------------------------------------- axis ---- */

test('the real schedule fits 10:00–21:00', () => {
  const axis = fitAxis(seedIntervals())
  eq(formatTime(axis.startMin), '10:00')
  eq(formatTime(axis.endMin), '21:00')
  eq(axis.spanMin, 11 * HOUR)
})

test('the axis snaps outward, never inward', () => {
  const axis = fitAxis([iv('10:30', 45)])
  ok(axis.startMin <= parseTime('10:30'), 'start not snapped down')
  ok(axis.endMin >= parseTime('11:15'), 'end not snapped up')
})

test('a minimum span stops one event filling the screen', () => {
  eq(fitAxis([iv('12:00', 30)], { minSpanMin: 6 * HOUR }).spanMin, 6 * HOUR)
})

test('growing to the minimum span never runs past midnight', () => {
  const axis = fitAxis([iv('23:00', 30)], { minSpanMin: 8 * HOUR })
  ok(axis.endMin <= 24 * HOUR, 'ran past midnight')
  ok(axis.startMin >= 0, 'ran before midnight')
  eq(axis.spanMin, 8 * HOUR)
})

test('an empty schedule still gets a sane window', () => {
  const axis = fitAxis([])
  eq(formatTime(axis.startMin), '08:00')
  ok(axis.spanMin > 0)
})

test('ratio maps proportionally', () => {
  const axis = fitAxis([iv('10:00', 11 * HOUR)])
  eq(ratio(axis, parseTime('10:00')), 0)
  eq(ratio(axis, parseTime('21:00')), 1)
  close(ratio(axis, parseTime('15:30')), 0.5)
})

test('odd minutes are not snapped to the hour', () => {
  const axis = fitAxis([iv('10:00', 11 * HOUR)])
  const r = ratio(axis, parseTime('17:45'))
  close(r, (7 * 60 + 45) / (11 * 60))
  ok(Math.abs(r - ratio(axis, parseTime('18:00'))) > 1e-4, '17:45 collapsed onto 18:00')
})

test('out-of-range positions are clamped inside the container', () => {
  const axis = fitAxis([iv('10:00', 11 * HOUR)])
  eq(ratio(axis, parseTime('06:00')), 0)
  eq(ratio(axis, parseTime('23:00')), 1)
})

test('every hour of the span gets a mark', () => {
  const axis = fitAxis([iv('10:00', 11 * HOUR)])
  eq(gridlines(axis, HOUR).map(formatTime), [
    '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
    '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
  ])
})

test('marks thin out on a very long span', () => {
  const long = fitAxis([iv('00:00', 24 * HOUR - 1)])
  ok(gridlines(long).length < gridlines(long, HOUR).length)
})

/* ---------------------------------------------------------------- columns ---- */

test('a lone event keeps full width', () => {
  eq(assignColumns([iv('10:00', 60)]), [{ column: 0, columns: 1 }])
})

test('adjacent events keep full width', () => {
  ok(assignColumns([iv('16:00', 60), iv('17:00', 60)]).every((s) => s.columns === 1))
})

test('the real Saturday overlap splits into two columns', () => {
  eq(assignColumns([iv('16:40', 60), iv('17:00', 60)]), [
    { column: 0, columns: 2 },
    { column: 1, columns: 2 },
  ])
})

test('a whole cluster shares width even where its ends do not touch', () => {
  // A–B overlap, B–C overlap, A–C do not. All three must still split the width, or
  // blocks in one visual stack would come out different widths.
  eq(
    assignColumns([iv('10:00', 60), iv('10:30', 60), iv('11:00', 60)]).map((s) => s.columns),
    [2, 2, 2],
  )
})

test('a freed column is reused rather than opening a new one', () => {
  const slots = assignColumns([iv('10:00', 180), iv('10:00', 60), iv('11:00', 60)])
  eq(slots[0].columns, 2)
  eq(slots[1].column, 1)
  eq(slots[2].column, 1)
})

test('three simultaneous events get three columns', () => {
  const slots = assignColumns([iv('10:00', 60), iv('10:00', 60), iv('10:00', 60)])
  eq(slots.map((s) => s.column).sort(), [0, 1, 2])
  ok(slots.every((s) => s.columns === 3))
})

test('results come back in caller order, earliest on the left', () => {
  const slots = assignColumns([iv('17:00', 60), iv('16:40', 60)])
  eq(slots[1].column, 0)
  eq(slots[0].column, 1)
})

test('an empty list is fine', () => {
  eq(assignColumns([]), [])
})

/* ------------------------------------------------------------- whole week ---- */

test('all 18 real events are placed, none invalid', () => {
  const layout = layoutWeek(SEED_EVENTS)
  eq(Object.values(layout.days).reduce((n, d) => n + d.length, 0), 18)
  eq(layout.invalid, [])
})

test('events land on the right days', () => {
  const layout = layoutWeek(SEED_EVENTS)
  eq([1, 2, 3, 4, 5, 6, 7].map((d) => layout.days[d].length), [2, 2, 3, 3, 1, 3, 4])
})

test('Saturday splits and Японська stays full width', () => {
  const sat = layoutWeek(SEED_EVENTS).days[6]
  eq(sat.map((p) => p.event.title), ['Вектор', 'Еврика', 'Японська'])
  eq(sat[0].columns, 2)
  eq(sat[1].columns, 2)
  eq(sat[2].columns, 1)
  eq(sat[2].width, 1)
})

test('Sunday never splits — its events only touch', () => {
  ok(layoutWeek(SEED_EVENTS).days[7].every((p) => p.columns === 1))
})

test('ФТФ draws half again as tall as a 60-minute block, ending 20:30', () => {
  const tue = layoutWeek(SEED_EVENTS).days[2]
  const ftf = tue.find((p) => p.event.title === 'ФТФ')
  const hour = tue.find((p) => p.event.title === 'Біологія')
  close(ftf.height / hour.height, 1.5)
  eq(formatTime(ftf.endMin), '20:30')
})

test('every block stays inside its container', () => {
  for (const placed of Object.values(layoutWeek(SEED_EVENTS).days).flat()) {
    ok(placed.top >= 0, 'top below zero')
    ok(placed.top + placed.height <= 1 + 1e-6, 'overflows the axis')
    ok(placed.left >= 0, 'left below zero')
    ok(placed.left + placed.width <= 1 + 1e-6, 'overflows the column')
  }
})

test('each day comes back sorted by start time', () => {
  for (const day of Object.values(layoutWeek(SEED_EVENTS).days)) {
    const starts = day.map((p) => p.startMin)
    eq(starts, [...starts].sort((a, b) => a - b))
  }
})

test('per-day fitting makes a sparse day taller than the week axis would', () => {
  const week = layoutWeek(SEED_EVENTS)
  const perDay = layoutWeek(SEED_EVENTS, { fit: 'day' })
  ok(perDay.days[5][0].height > week.days[5][0].height, 'Friday not rescaled')
})

/* ------------------------------------------------------------- bad input ---- */

const BAD = [
  { id: 'b1', day: 1, start: '25:00', duration_min: 60, title: 'bad time', colour: 'slate' },
  { id: 'b2', day: 1, start: '10:00', duration_min: 0, title: 'zero length', colour: 'slate' },
  { id: 'b3', day: 9, start: '10:00', duration_min: 60, title: 'bad day', colour: 'slate' },
  { id: 'b4', day: 1, start: '10:00', duration_min: 60, title: 'fine', colour: 'slate' },
]

test('bad rows are reported, not hidden, and good ones still render', () => {
  const layout = layoutWeek(BAD)
  eq(layout.invalid.map((i) => i.event.id), ['b1', 'b2', 'b3'])
  eq(layout.days[1].map((p) => p.event.id), ['b4'])
})

test('an all-bad schedule still yields a usable axis', () => {
  ok(layoutWeek(BAD.slice(0, 3)).axis.spanMin > 0)
})

test('day and duration arriving as strings from the Sheet still work', () => {
  // The API returns every cell as a string — this is the coercion that bug-fixed P2.
  const layout = layoutWeek([
    { id: 'x', day: '3', start: '12:00', duration_min: '90', title: 'з рядків', colour: 'blue' },
  ])
  eq(layout.invalid, [])
  eq(layout.days[3].length, 1)
  eq(formatTime(layout.days[3][0].endMin), '13:30')
})

test('hasOverlap is true for Saturday, false for Sunday', () => {
  eq(hasOverlap(seedIntervals(6)), true)
  eq(hasOverlap(seedIntervals(7)), false)
})

/* ----------------------------------------------------------------- lead-in ---- */

test('the week axis leaves an empty hour above the first event', () => {
  // The earliest event is 10:30 on Неділя; without the lead-in the axis started at
  // 10:00 and the block sat flush against the header.
  const axis = layoutWeek(SEED_EVENTS).axis
  eq(formatTime(axis.startMin), '09:00')
  eq(formatTime(axis.endMin), '21:00')
})

test('the lead-in still snaps to a whole hour', () => {
  // Applied before snapping, so an event at 10:30 gives 09:00, not 09:30.
  const axis = fitAxis([iv('10:30', 60)], { padStartMin: 60 })
  eq(formatTime(axis.startMin), '09:00')
})

test('fitAxis adds no lead-in unless asked', () => {
  eq(formatTime(fitAxis([iv('10:30', 60)]).startMin), '10:00')
})

test('the lead-in never pushes the axis before midnight', () => {
  const axis = fitAxis([iv('00:15', 30)], { padStartMin: 120 })
  ok(axis.startMin >= 0, `started at ${axis.startMin}`)
})

test('an empty schedule gets no lead-in, just the fallback window', () => {
  eq(formatTime(layoutWeek([]).axis.startMin), '08:00')
})

test('every block still sits inside the axis after the lead-in', () => {
  for (const placed of Object.values(layoutWeek(SEED_EVENTS).days).flat()) {
    ok(placed.top >= 0 && placed.top + placed.height <= 1 + 1e-6, placed.event.title)
  }
})
