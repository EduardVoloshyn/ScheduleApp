import { eq, ok, test } from './harness.js'
import { installDom } from './dom-stub.js'

/*
 * Boots the real src/app.js against the stub DOM.
 *
 * Nothing else covers this: the layout tests exercise pure logic, and the render tests
 * build components in isolation. An exception thrown at module scope in app.js — or a
 * toolbar that quietly stops rendering a control — would pass every other test and
 * still leave a blank or wrong screen.
 *
 * It runs last and installs its own DOM, because importing app.js has side effects
 * (it renders immediately and registers timers).
 */

const store = {
  'scheduleapp.credentials': JSON.stringify({ deploymentId: 'AKfyTEST', secret: 's' }),
  'scheduleapp.snapshot': JSON.stringify({
    events: [
      { id: 'a', day: 1, start: '11:00', duration_min: 60, title: 'Географія', colour: 'slate', category: 'lessons' },
      { id: 'b', day: 6, start: '16:40', duration_min: 60, title: 'Вектор', colour: 'red' },
    ],
    templates: [],
    categories: [{ id: 'lessons', name: 'Навчання' }, { id: 'sport', name: 'Спорт' }],
    settings: {},
    hash: 'h',
    fetchedAt: 1,
  }),
}

const { root } = installDom({ store })
await import('../src/app.js')

const labels = () => root.findAll('app__button').map((b) => b.textContent)

test('the app boots and renders a toolbar rather than throwing', () => {
  ok(root.find('app__bar'), 'no toolbar — the setup card or an exception instead')
  ok(root.find('week'), 'no grid rendered')
})

test('the toolbar carries the editing toggle', () => {
  // The regression this exists for: a control silently missing from the toolbar.
  ok(labels().includes('🔒') || labels().includes('✏️'), `toolbar was ${labels().join(' ')}`)
})

test('editing is off by default, so the button offers the pencil', () => {
  // The icon names the action, not the state: a pencil means "start editing".
  eq(labels().includes('✏️'), true, `toolbar was ${labels().join(' ')}`)
  eq(labels().includes('🔒'), false, 'showing the lock while already view-only')
})

test('view-only mode hides the templates button', () => {
  eq(labels().includes('+Ш'), false, 'templates offered while editing is off')
})

test('the grid renders the cached schedule, not the seed', () => {
  eq(root.findAll('event').length, 2)
  ok(!root.find('week').className.includes('week--editing'), 'grid is editable by default')
})

test('turning editing on flips the button to the lock and reveals templates', () => {
  // Clicking the pencil must offer the opposite action next, or the control lies about
  // what it does.
  const pencil = root.findAll('app__button').find((b) => b.textContent === '✏️')
  ok(pencil, 'no pencil to click')
  pencil.dispatch('click', {})

  const after = root.findAll('app__button').map((b) => b.textContent)
  eq(after.includes('🔒'), true, `toolbar was ${after.join(' ')}`)
  eq(after.includes('✏️'), false, 'still offering to start editing')
  eq(after.includes('+Ш'), true, 'templates stayed hidden with editing on')
  ok(root.find('week').className.includes('week--editing'), 'grid not switched to editing')
})

test('turning it off again returns to view-only', () => {
  const lock = root.findAll('app__button').find((b) => b.textContent === '🔒')
  lock.dispatch('click', {})

  const after = root.findAll('app__button').map((b) => b.textContent)
  eq(after.includes('✏️'), true, `toolbar was ${after.join(' ')}`)
  eq(after.includes('+Ш'), false, 'templates still showing in view-only')
  eq(root.findAll('event__grip').length, 0, 'resize grips survived')
})

/* --------------------------------------------------------- view switching ---- */

test('the week view offers Д, and clicking it shows a single day', () => {
  // Same convention as the editing toggle: the label is the action, not the state.
  const before = labels()
  eq(before.includes('Д'), true, `toolbar was ${before.join(' ')}`)
  eq(before.includes('Т'), false, 'offering the week while already on it')
  eq(root.findAll('day').length, 7, 'not showing a full week to begin with')

  root.findAll('app__button').find((b) => b.textContent === 'Д').dispatch('click', {})

  eq(root.findAll('day').length, 1, 'did not switch to a single day')
  ok(root.find('daynav'), 'no day navigation strip')
})

test('the day view then offers Т, and clicking it returns to the week', () => {
  const after = labels()
  eq(after.includes('Т'), true, `toolbar was ${after.join(' ')}`)
  eq(after.includes('Д'), false, 'still offering the day while on it')

  root.findAll('app__button').find((b) => b.textContent === 'Т').dispatch('click', {})

  eq(root.findAll('day').length, 7, 'did not return to the week')
  eq(labels().includes('Д'), true, 'button did not flip back')
})

/* --------------------------------------------------- categories in the bar ---- */

test('the category toggles live in the toolbar, beside the title', () => {
  const bar = root.find('app__bar')
  ok(bar, 'no toolbar')
  ok(bar.find('cats'), 'category group is not inside the toolbar')
  ok(bar.find('app__title'), 'title missing from the toolbar')
  // Not a separate row: the app has the toolbar, then the scroll area.
  eq(root.findAll('cats').length, 1)
})

test('a toggle hides that category and leaves uncategorised events alone', () => {
  eq(root.findAll('event').length, 2)

  const lessons = root.findAll('cat').find((c) => c.textContent.includes('Навчання'))
  ok(lessons, 'no Навчання toggle')
  lessons.dispatch('click', {})

  // Географія is in `lessons` and goes; Вектор has no category and must stay.
  eq(root.findAll('event').length, 1, 'wrong number of events after hiding')
  ok(root.find('event').textContent.includes('Вектор'), 'the wrong event survived')
})

test('the hidden toggle reads as off, and "show all" appears', () => {
  eq(root.findAll('cat--off').length, 1)
  eq(root.findAll('cat--all').length, 1)
})

test('"show all" restores everything', () => {
  root.find('cat--all').dispatch('click', {})
  eq(root.findAll('event').length, 2)
  eq(root.findAll('cat--off').length, 0)
})
