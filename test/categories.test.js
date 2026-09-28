import { eq, ok, test } from './harness.js'
import {
  UNCATEGORISED,
  categoryCounts,
  hiddenSet,
  parseCategories,
  toggleHidden,
  visibleEvents,
} from '../src/model/categories.js'
import {
  createEvent,
  duplicateEvent,
  eventFromTemplate,
  findEvent,
  templateFromEvent,
  updateEvent,
} from '../src/model/schedule.js'

const CATS = [{ id: 'lessons', name: 'Уроки' }, { id: 'sport', name: 'Спорт' }]

const EVENTS = [
  { id: 'a', day: 1, start: '11:00', duration_min: 60, title: 'Географія', category: 'lessons' },
  { id: 'b', day: 1, start: '19:00', duration_min: 60, title: 'Біг', category: 'sport' },
  { id: 'c', day: 2, start: '12:00', duration_min: 60, title: 'Без категорії' },
  { id: 'd', day: 3, start: '10:00', duration_min: 60, title: 'Старе', category: 'deleted-cat' },
]

/* ----------------------------------------------------------------- parsing ---- */

test('parseCategories keeps id and name', () => {
  eq(parseCategories([{ id: 'x', name: 'Ім’я' }]), [{ id: 'x', name: 'Ім’я' }])
})

test('parseCategories falls back to the id when the name is blank', () => {
  eq(parseCategories([{ id: 'x', name: '  ' }]), [{ id: 'x', name: 'x' }])
})

test('parseCategories drops rows with no id and de-duplicates', () => {
  // A row with no id cannot be referenced, so its toggle would filter nothing.
  eq(parseCategories([{ name: 'nope' }, { id: 'x' }, { id: 'x', name: 'dup' }]).length, 1)
})

test('parseCategories copes with a missing tab', () => {
  eq(parseCategories(undefined), [])
  eq(parseCategories([]), [])
})

/* --------------------------------------------------------------- filtering ---- */

test('nothing hidden shows everything', () => {
  eq(visibleEvents(EVENTS, hiddenSet([]), CATS).length, 4)
})

test('hiding a category removes exactly its events', () => {
  const visible = visibleEvents(EVENTS, hiddenSet(['lessons']), CATS)
  eq(visible.map((e) => e.id), ['b', 'c', 'd'])
})

test('hiding every real category leaves the uncategorised ones', () => {
  // They have their own toggle now, so hiding the named categories must not touch them.
  const visible = visibleEvents(EVENTS, hiddenSet(['lessons', 'sport']), CATS)
  eq(visible.map((e) => e.id), ['c', 'd'])
})

test('an event naming a deleted category follows the uncategorised toggle', () => {
  // 'deleted-cat' is not in CATS, so hiding it by name must do nothing at all.
  const byName = visibleEvents(EVENTS, hiddenSet(['deleted-cat']), CATS)
  ok(byName.some((e) => e.id === 'd'), 'an unknown id filtered an event')

  const byBucket = visibleEvents(EVENTS, hiddenSet([UNCATEGORISED]), CATS)
  ok(!byBucket.some((e) => e.id === 'd'), 'the orphan ignored the uncategorised toggle')
})

test('the uncategorised toggle hides exactly the uncategorised events', () => {
  const visible = visibleEvents(EVENTS, hiddenSet([UNCATEGORISED]), CATS)
  eq(visible.map((e) => e.id), ['a', 'b'])
})

test('everything can be hidden at once, and nothing else', () => {
  const visible = visibleEvents(EVENTS, hiddenSet(['lessons', 'sport', UNCATEGORISED]), CATS)
  eq(visible, [])
})

test('the uncategorised toggle is independent of the named ones', () => {
  const visible = visibleEvents(EVENTS, hiddenSet(['lessons', UNCATEGORISED]), CATS)
  eq(visible.map((e) => e.id), ['b'])
})

test('a Sheet row claiming the sentinel id is dropped', () => {
  // Otherwise it would own the uncategorised toggle and its own events would become
  // unfilterable — the exact hole this feature exists to close.
  eq(parseCategories([{ id: UNCATEGORISED, name: 'Спроба' }, { id: 'ok' }]).map((c) => c.id), ['ok'])
})

test('toggleHidden treats the sentinel like any other id', () => {
  eq(toggleHidden(new Set(), UNCATEGORISED), [UNCATEGORISED])
  eq(toggleHidden(new Set([UNCATEGORISED]), UNCATEGORISED), [])
})

/* ------------------------------------------------------------------ counts ---- */

test('counts are per category, with the rest counted as uncategorised', () => {
  const { counts, uncategorised } = categoryCounts(EVENTS, CATS)
  eq(counts, { lessons: 1, sport: 1 })
  eq(uncategorised, 2, 'the orphan should count as uncategorised')
})

test('a category with no events still reports zero rather than being absent', () => {
  const { counts } = categoryCounts([], CATS)
  eq(counts, { lessons: 0, sport: 0 })
})

/* ------------------------------------------------------------------ toggle ---- */

test('toggleHidden adds and removes', () => {
  eq(toggleHidden(new Set(), 'x'), ['x'])
  eq(toggleHidden(new Set(['x']), 'x'), [])
})

test('toggleHidden does not mutate the set it is given', () => {
  const hidden = new Set(['x'])
  toggleHidden(hidden, 'y')
  eq([...hidden], ['x'])
})

/* -------------------------------------------------- category on the event ---- */

test('createEvent keeps a category and trims it', () => {
  eq(createEvent({ day: 1, startMin: 600, durationMin: 60, category: ' sport ' }).category, 'sport')
  eq(createEvent({ day: 1, startMin: 600, durationMin: 60 }).category, undefined)
})

test('a template carries its category into the event it creates', () => {
  // The specific behaviour asked for: a template exists to carry its settings.
  const event = eventFromTemplate(
    { id: 't', title: 'Біг', colour: 'green', icon: '🏃', category: 'sport', duration_min: 45 },
    { day: 2, startMin: 600 },
  )
  eq(event.category, 'sport')
  eq(event.duration_min, 45)
})

test('a template captured from an event keeps its category', () => {
  const event = createEvent({ day: 1, startMin: 600, durationMin: 60, title: 'x', category: 'sport' })
  eq(templateFromEvent(event).category, 'sport')
})

test('updateEvent can set and clear the category', () => {
  const events = [createEvent({ id: 'a', day: 1, startMin: 600, durationMin: 60, title: 'x' })]
  eq(findEvent(updateEvent(events, 'a', { category: 'lessons' }), 'a').category, 'lessons')
  const set = updateEvent(events, 'a', { category: 'lessons' })
  eq(findEvent(updateEvent(set, 'a', { category: '' }), 'a').category, undefined)
})

test('a duplicate carries the category across', () => {
  const events = [
    createEvent({ id: 'a', day: 1, startMin: 600, durationMin: 60, title: 'x', category: 'sport' }),
  ]
  eq(duplicateEvent(events, 'a')[1].category, 'sport')
})
