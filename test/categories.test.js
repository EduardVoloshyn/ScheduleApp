import { eq, ok, test } from './harness.js'
import {
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

test('an uncategorised event is never hidden', () => {
  // Otherwise events vanish with no toggle able to bring them back, which is
  // indistinguishable from data loss — and every event is uncategorised right after
  // the migration.
  const visible = visibleEvents(EVENTS, hiddenSet(['lessons', 'sport']), CATS)
  ok(visible.some((e) => e.id === 'c'), 'uncategorised event was hidden')
})

test('an event naming a deleted category is never hidden', () => {
  const visible = visibleEvents(EVENTS, hiddenSet(['lessons', 'sport', 'deleted-cat']), CATS)
  ok(visible.some((e) => e.id === 'd'), 'orphaned event was hidden')
})

test('hiding every category still leaves the unfilterable ones', () => {
  eq(visibleEvents(EVENTS, hiddenSet(['lessons', 'sport']), CATS).map((e) => e.id), ['c', 'd'])
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
