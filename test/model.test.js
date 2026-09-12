import { close, eq, ok, test, throws } from './harness.js'
import { execUrl, parseDeploymentId } from '../src/sync/api.js'
import { fitAxis, minutesAt, ratio, snapMinutes } from '../src/layout/index.js'
import { formatTime, parseTime } from '../src/layout/time.js'
import {
  MAX_ICON,
  MIN_DURATION,
  createEvent,
  deleteEvent,
  duplicateEvent,
  eventFromTemplate,
  fitWithinDay,
  findEvent,
  isUsableEvent,
  partitionUsable,
  templateFromEvent,
  updateEvent,
} from '../src/model/schedule.js'

const iv = (start, minutes) => ({
  startMin: parseTime(start),
  endMin: parseTime(start) + minutes,
})

const axis = fitAxis([iv('10:00', 11 * 60)]) // 10:00–21:00

/* ------------------------------------------------------- pointer -> time ---- */

test('minutesAt is the exact inverse of ratio', () => {
  for (const t of ['10:00', '13:20', '17:45', '21:00']) {
    const minutes = parseTime(t)
    close(minutesAt(axis, ratio(axis, minutes)), minutes, 1e-6, t)
  }
})

test('minutesAt clamps a pointer dragged outside the grid', () => {
  eq(minutesAt(axis, -0.5), axis.startMin)
  eq(minutesAt(axis, 1.5), axis.endMin)
})

test('snapMinutes keeps the odd start times in the real schedule reachable', () => {
  eq(snapMinutes(parseTime('16:40')), parseTime('16:40'))
  eq(snapMinutes(parseTime('17:45')), parseTime('17:45'))
  eq(snapMinutes(parseTime('18:15')), parseTime('18:15'))
})

test('snapMinutes rounds to the nearest step', () => {
  eq(snapMinutes(603), 605)
  eq(snapMinutes(602), 600)
  eq(snapMinutes(607, 15), 600)
  eq(snapMinutes(608, 15), 615)
})

/* ------------------------------------------------------------ within day ---- */

test('an event cannot be pushed past midnight', () => {
  const fitted = fitWithinDay(23 * 60 + 30, 90)
  eq(formatTime(fitted.startMin), '22:30')
  eq(fitted.durationMin, 90)
  ok(fitted.startMin + fitted.durationMin <= 24 * 60)
})

test('an event cannot start before midnight', () => {
  eq(fitWithinDay(-120, 60).startMin, 0)
})

test('duration has a floor', () => {
  eq(fitWithinDay(600, 0).durationMin, MIN_DURATION)
  eq(fitWithinDay(600, -30).durationMin, MIN_DURATION)
})

/* ---------------------------------------------------------------- create ---- */

test('createEvent normalises everything', () => {
  const e = createEvent({ day: 3, startMin: parseTime('12:00'), durationMin: 45, title: '  Хімія  ' })
  eq(e.day, 3)
  eq(e.start, '12:00')
  eq(e.duration_min, 45)
  eq(e.title, 'Хімія')
  eq(e.colour, 'slate')
  eq(e.note, undefined)
  ok(e.id.length > 0)
})

test('createEvent refuses a colour outside the palette', () => {
  eq(createEvent({ day: 1, startMin: 600, durationMin: 60, colour: '#ff0000' }).colour, 'slate')
  eq(createEvent({ day: 1, startMin: 600, durationMin: 60, colour: 'teal' }).colour, 'teal')
})

test('createEvent clamps the day', () => {
  eq(createEvent({ day: 0, startMin: 600, durationMin: 60 }).day, 1)
  eq(createEvent({ day: 12, startMin: 600, durationMin: 60 }).day, 7)
})

/* ------------------------------------------------------------- shared data ---- */

const base = [
  createEvent({ id: 'a', day: 2, startMin: parseTime('19:00'), durationMin: 90, title: 'ФТФ' }),
  createEvent({ id: 'b', day: 6, startMin: parseTime('16:40'), durationMin: 60, title: 'Вектор' }),
]

/*
 * moveEvent and resizeEvent were deleted in 1.2 along with the drag interactions that
 * were their only caller. Their behaviour — a start change never altering the length —
 * now lives in updateEvent and is covered below.
 */

/* ---------------------------------------------------------------- update ---- */

test('updateEvent edits fields and derives the end from duration', () => {
  const e = findEvent(updateEvent(base, 'a', { title: ' Фізика ', colour: 'blue', duration_min: 45 }), 'a')
  eq(e.title, 'Фізика')
  eq(e.colour, 'blue')
  eq(e.duration_min, 45)
  eq(e.start, '19:00')
})

test('updateEvent ignores an invalid colour instead of storing it', () => {
  eq(findEvent(updateEvent(base, 'a', { colour: 'chartreuse' }), 'a').colour, 'slate')
})

test('updateEvent can change the start time', () => {
  eq(findEvent(updateEvent(base, 'b', { start: '17:05' }), 'b').start, '17:05')
})

test('an emptied note becomes undefined rather than an empty string', () => {
  const withNote = updateEvent(base, 'a', { note: 'до 20:30' })
  eq(findEvent(withNote, 'a').note, 'до 20:30')
  eq(findEvent(updateEvent(withNote, 'a', { note: '   ' }), 'a').note, undefined)
})

/* -------------------------------------------------- delete and duplicate ---- */

test('deleteEvent removes exactly one event', () => {
  const after = deleteEvent(base, 'a')
  eq(after.length, 1)
  eq(after[0].id, 'b')
})

test('deleting an unknown id changes nothing', () => {
  eq(deleteEvent(base, 'nope').length, 2)
})

test('duplicate gives the copy a fresh id so both survive a save', () => {
  const after = duplicateEvent(base, 'b', { day: 7, startMin: parseTime('10:00') })
  eq(after.length, 3)
  const copy = after[2]
  ok(copy.id !== 'b', 'duplicate reused the id')
  eq(copy.title, 'Вектор')
  eq(copy.day, 7)
  eq(copy.start, '10:00')
  eq(copy.duration_min, 60)
})

test('duplicate with no target lands on the original slot', () => {
  const copy = duplicateEvent(base, 'b')[2]
  eq(copy.day, 6)
  eq(copy.start, '16:40')
})

test('duplicating an unknown id changes nothing', () => {
  eq(duplicateEvent(base, 'nope', { day: 1, startMin: 600 }).length, 2)
})

/* -------------------------------------------------------------- templates ---- */

test('a template becomes an event at the requested slot', () => {
  const e = eventFromTemplate(
    { id: 't1', title: 'ФТФ', colour: 'slate', duration_min: 90 },
    { day: 4, startMin: parseTime('19:00') },
  )
  eq(e.title, 'ФТФ')
  eq(e.duration_min, 90)
  eq(e.day, 4)
  eq(e.start, '19:00')
})

test('a template captured from an event keeps title, colour and length', () => {
  const t = templateFromEvent(findEvent(base, 'a'))
  eq(t.title, 'ФТФ')
  eq(t.duration_min, 90)
  eq(t.colour, 'slate')
  ok(t.id !== 'a')
})

/* ----------------------------------------------------------- immutability ---- */

test('no mutation touches the original array', () => {
  const before = JSON.stringify(base)
  updateEvent(base, 'a', { title: 'x', start: '08:00', duration_min: 200, day: 5 })
  deleteEvent(base, 'a')
  duplicateEvent(base, 'a', { day: 1, startMin: 100 })
  eq(JSON.stringify(base), before, 'a mutation leaked into the source list')
})

/* ------------------------------------------------- regression: NaN:NaN ------- */

test('a non-finite start is rejected rather than written as "NaN:NaN"', () => {
  // The grid once passed `{day, minutes}` where `{day, startMin}` was expected, so
  // startMin was undefined and clamp() let NaN straight through to the Sheet.
  throws(() => fitWithinDay(undefined, 60), 'undefined start accepted')
  throws(() => fitWithinDay(NaN, 60), 'NaN start accepted')
  throws(() => fitWithinDay(600, undefined), 'undefined duration accepted')
  throws(() => createEvent({ day: 1, startMin: undefined, durationMin: 60 }), 'createEvent accepted it')
})

test('a valid start is still accepted after the guard', () => {
  eq(createEvent({ day: 1, startMin: 0, durationMin: 60 }).start, '00:00')
  eq(createEvent({ day: 1, startMin: 930, durationMin: 60 }).start, '15:30')
})

/* ------------------------------------------------------ usable / unusable ---- */

test('isUsableEvent accepts a real event', () => {
  ok(isUsableEvent({ day: 3, start: '17:45', duration_min: 60, title: 'Олена' }))
  ok(isUsableEvent({ day: 6, start: '16:40', duration_min: 90, title: 'Вектор', colour: 'red' }))
})

test('isUsableEvent rejects exactly what the API would reject', () => {
  const bad = [
    { day: 1, start: 'NaN:NaN', duration_min: 60, title: 'x' },
    { day: 1, start: '9:00', duration_min: 60, title: 'x' },
    { day: 1, start: '10:00', duration_min: 0, title: 'x' },
    { day: 1, start: '10:00', duration_min: NaN, title: 'x' },
    { day: 9, start: '10:00', duration_min: 60, title: 'x' },
    { day: 1, start: '10:00', duration_min: 60, title: '   ' },
    { day: 1, start: '10:00', duration_min: 60 },
    null,
  ]
  for (const event of bad) eq(isUsableEvent(event), false, JSON.stringify(event))
})

test('partitionUsable separates a corrupt cache from the rest', () => {
  const { usable, dropped } = partitionUsable([
    { day: 1, start: '11:00', duration_min: 60, title: 'Географія' },
    { day: 5, start: 'NaN:NaN', duration_min: 60, title: '' },
    { day: 2, start: '12:30', duration_min: 60, title: 'Біологія' },
  ])
  eq(usable.length, 2)
  eq(dropped.length, 1)
  eq(usable.map((e) => e.title), ['Географія', 'Біологія'])
})

test('partitionUsable copes with an empty or missing list', () => {
  eq(partitionUsable([]).usable.length, 0)
  eq(partitionUsable(undefined).dropped.length, 0)
})

/* ------------------------------------------------------------------- icon ---- */

test('createEvent keeps an emoji and trims it', () => {
  eq(createEvent({ day: 1, startMin: 600, durationMin: 60, icon: ' 🎹 ' }).icon, '🎹')
})

test('an absent icon is undefined, not an empty string', () => {
  eq(createEvent({ day: 1, startMin: 600, durationMin: 60 }).icon, undefined)
  eq(createEvent({ day: 1, startMin: 600, durationMin: 60, icon: '   ' }).icon, undefined)
})

test('a multi-codepoint emoji survives intact', () => {
  // Flags and ZWJ sequences are several code units — the limit must not cut them up.
  for (const emoji of ['🇯🇵', '👨‍👩‍👧', '🏃‍♀️']) {
    eq(createEvent({ day: 1, startMin: 600, durationMin: 60, icon: emoji }).icon, emoji, emoji)
  }
})

test('an over-long icon is truncated rather than rejected', () => {
  const long = '🎹'.repeat(20)
  const stored = createEvent({ day: 1, startMin: 600, durationMin: 60, icon: long }).icon
  ok(stored.length <= MAX_ICON, `length was ${stored.length}`)
})

test('updateEvent can set and clear the icon', () => {
  const withIcon = updateEvent(base, 'a', { icon: '🔭' })
  eq(findEvent(withIcon, 'a').icon, '🔭')
  eq(findEvent(updateEvent(withIcon, 'a', { icon: '' }), 'a').icon, undefined)
})

test('duplicate and templates carry the icon across', () => {
  const source = updateEvent(base, 'a', { icon: '🔭' })
  eq(duplicateEvent(source, 'a')[2].icon, '🔭')
  eq(templateFromEvent(findEvent(source, 'a')).icon, '🔭')
  eq(
    eventFromTemplate({ title: 'ФТФ', colour: 'slate', icon: '🔭', duration_min: 90 },
      { day: 1, startMin: 600 }).icon,
    '🔭',
  )
})

/* ------------------------------------------------------- deployment id ------ */

test('a bare deployment id passes through', () => {
  eq(parseDeploymentId('AKfycbABC-123_xyz'), 'AKfycbABC-123_xyz')
})

test('a pasted /exec URL yields just the id', () => {
  // Pasting the whole URL is the habitual thing to do, and failing on it silently
  // would be a poor first run.
  eq(
    parseDeploymentId('https://script.google.com/macros/s/AKfycbABC-123_xyz/exec'),
    'AKfycbABC-123_xyz',
  )
})

test('a pasted /dev URL yields the id too', () => {
  eq(parseDeploymentId('https://script.google.com/macros/s/AKfyXYZ/dev'), 'AKfyXYZ')
})

test('a URL with a query string still yields the id', () => {
  eq(parseDeploymentId('https://script.google.com/macros/s/AKfyXYZ/exec?action=ping'), 'AKfyXYZ')
})

test('whitespace and stray slashes are trimmed', () => {
  eq(parseDeploymentId('  AKfyXYZ  '), 'AKfyXYZ')
  eq(parseDeploymentId('AKfyXYZ/exec'), 'AKfyXYZ')
})

test('nothing in, nothing out', () => {
  eq(parseDeploymentId(''), '')
  eq(parseDeploymentId(undefined), '')
  eq(parseDeploymentId('   '), '')
})

test('execUrl builds the full endpoint from an id', () => {
  eq(
    execUrl({ deploymentId: 'AKfyXYZ' }),
    'https://script.google.com/macros/s/AKfyXYZ/exec',
  )
})

test('execUrl still honours a stored full url, for a device set up earlier', () => {
  eq(execUrl({ url: 'https://script.google.com/macros/s/OLD/exec' }),
     'https://script.google.com/macros/s/OLD/exec')
})

test('execUrl prefers the id when both are present', () => {
  eq(
    execUrl({ deploymentId: 'NEW', url: 'https://script.google.com/macros/s/OLD/exec' }),
    'https://script.google.com/macros/s/NEW/exec',
  )
})

test('a credential stored as a full Apps Script URL migrates to an id', () => {
  // Devices set up before this change hold a url. They must keep working rather than
  // being silently logged out.
  eq(
    parseDeploymentId('https://script.google.com/macros/s/AKfyREAL/exec'),
    'AKfyREAL',
  )
})

test('changing the start never changes the length', () => {
  // The rule that made dragging feel right, now enforced through the editor: editing a
  // start time leaves duration alone unless duration is edited too.
  const moved = findEvent(updateEvent(base, 'a', { start: '09:15' }), 'a')
  eq(moved.start, '09:15')
  eq(moved.duration_min, 90, 'length changed when only the start was edited')
})

test('an edit cannot push an event past midnight', () => {
  const late = findEvent(updateEvent(base, 'a', { start: '23:30' }), 'a')
  ok(parseTime(late.start) + late.duration_min <= 24 * 60, `${late.start} + ${late.duration_min}`)
  eq(late.duration_min, 90, 'length was truncated instead of the start being pinned')
})

test('duration edits are clamped to the floor', () => {
  eq(findEvent(updateEvent(base, 'a', { duration_min: 1 }), 'a').duration_min, MIN_DURATION)
})

test('editing the day leaves everything else alone', () => {
  const e = findEvent(updateEvent(base, 'a', { day: 4 }), 'a')
  eq(e.day, 4)
  eq(e.start, '19:00')
  eq(e.duration_min, 90)
})
