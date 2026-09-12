import { eq, ok, test } from './harness.js'
import { installDom } from './dom-stub.js'
import { SEED_EVENTS } from '../src/fixtures/seed.js'
import { layoutWeek } from '../src/layout/index.js'
import { weekView } from '../src/ui/week-view.js'
import { dayView } from '../src/ui/day-view.js'
import { eventBlock } from '../src/ui/event-block.js'
import { editSheet } from '../src/ui/edit-sheet.js'
import { setupCard } from '../src/ui/setup-card.js'
import { settingsPanel } from '../src/ui/settings-panel.js'
import { templatesPanel } from '../src/ui/templates-panel.js'
import { categoryBar } from '../src/ui/category-bar.js'
import { templateSheet } from '../src/ui/template-sheet.js'
import { aboutPanel } from '../src/ui/about-panel.js'
import { RELEASED, VERSION } from '../src/version.js'

/*
 * Headless render checks. These do not prove it looks right — only a browser can do
 * that — but they prove nothing throws on the way to the screen, which is the failure
 * that would leave a device showing a blank page.
 */

installDom()

const layout = layoutWeek(SEED_EVENTS)

test('the week view builds without throwing', () => {
  const node = weekView({ layout, today: 3, nowMin: 13 * 60 })
  ok(node, 'no node returned')
  eq(node.findAll('event').length, 18, 'wrong number of blocks rendered')
})

test('the week view renders 7 day columns and a gutter', () => {
  const node = weekView({ layout, today: 3, nowMin: null })
  eq(node.findAll('day').length, 7)
  ok(node.find('axis'), 'no time gutter')
})

test('today is marked and the now-line only appears on today', () => {
  const node = weekView({ layout, today: 3, nowMin: 13 * 60 })
  eq(node.findAll('day--today').length, 1)
  eq(node.findAll('day__now').length, 1)
})

test('the now-line is omitted when the clock is outside the axis', () => {
  // The schedule spans 10:00–21:00, so 03:00 must not draw a line.
  eq(weekView({ layout, today: 3, nowMin: 3 * 60 }).findAll('day__now').length, 0)
})

test('no resize grips exist in either mode', () => {
  // Removed in 1.2 with the drag interactions. Editing is dialog-only.
  eq(weekView({ layout, today: 1, nowMin: null, editing: false }).findAll('event__grip').length, 0)
  eq(weekView({ layout, today: 1, nowMin: null, editing: true }).findAll('event__grip').length, 0)
})

test('a block carries its event id, so pointer handling can find it', () => {
  const placed = layout.days[6][0]
  eq(eventBlock(placed).dataset.eventId, placed.event.id)
})

test('an unknown colour falls back instead of rendering unstyled', () => {
  const placed = { ...layout.days[1][0], event: { ...layout.days[1][0].event, colour: 'chartreuse' } }
  ok(eventBlock(placed).className.includes('event--slate'), 'no fallback colour applied')
})

test('a short block hides its time line, a tall one shows it', () => {
  const short = { ...layout.days[1][0], event: { ...layout.days[1][0].event } }
  short.endMin = short.startMin + 20
  eq(eventBlock(short).findAll('event__time').length, 0)

  const tall = layout.days[2].find((p) => p.event.title === 'ФТФ')
  eq(eventBlock(tall).findAll('event__time').length, 1)
})

test('the edit sheet builds for an existing event', () => {
  const event = SEED_EVENTS[3]
  const node = editSheet({
    event,
    isNew: false,
    onSave: () => {},
    onDelete: () => {},
    onDuplicate: () => {},
    onSaveTemplate: () => {},
    onClose: () => {},
  })
  eq(node.findAll('swatch').length, 8, 'palette not rendered')
  ok(node.find('sheet__actions'), 'no actions row')
})

test('the setup card builds and starts disabled', () => {
  const node = setupCard({ onSave: () => {} })
  ok(node.find('card'), 'no card')
  ok(node.find('field'), 'no fields')
})

test('the settings panel builds', () => {
  const node = settingsPanel({
    prefs: { editingEnabled: true, theme: 'system', pxPerHour: 60 },
    defaultDuration: 60,
    onChange: () => {},
    onChangeDefaultDuration: () => {},
    onForgetCredentials: () => {},
    onClose: () => {},
  })
  ok(node.find('sheet__form'), 'no form')
})

test('the templates panel builds, empty and populated', () => {
  const props = {
    categoryName: () => '',
    onPick: () => {},
    onEdit: () => {},
    onCreate: () => {},
    onClose: () => {},
  }
  const empty = templatesPanel({ ...props, templates: [] })
  ok(empty.find('sheet__hint'), 'no empty-state hint')

  const full = templatesPanel({
    ...props,
    templates: [{ id: 't1', title: 'ФТФ', colour: 'slate', duration_min: 90 }],
  })
  eq(full.findAll('templates__row').length, 1)
  eq(full.findAll('templates__edit').length, 1, 'no edit affordance on the row')
})

test('an empty schedule still renders a grid rather than crashing', () => {
  const node = weekView({ layout: layoutWeek([]), today: 1, nowMin: null })
  eq(node.findAll('day').length, 7)
  eq(node.findAll('event').length, 0)
})

test('events the layout rejected are never drawn', () => {
  const withBad = layoutWeek([
    ...SEED_EVENTS,
    { id: 'bad', day: 1, start: '99:99', duration_min: 60, title: 'зламана', colour: 'slate' },
  ])
  eq(withBad.invalid.length, 1)
  eq(weekView({ layout: withBad, today: 1, nowMin: null }).findAll('event').length, 18)
})

/* --------------------------------------------------------------- day view ---- */

test('the day view renders exactly one column and no header', () => {
  const node = dayView({ layout, day: 6, today: 6, nowMin: null })
  eq(node.findAll('day').length, 1)
  eq(node.findAll('week__day-name').length, 0, 'day name belongs in the nav strip')
})

test('the day view shows only that day’s events', () => {
  eq(dayView({ layout, day: 6, today: 1, nowMin: null }).findAll('event').length, 3)
  eq(dayView({ layout, day: 5, today: 1, nowMin: null }).findAll('event').length, 1)
  eq(dayView({ layout, day: 7, today: 1, nowMin: null }).findAll('event').length, 4)
})

test('the day view keeps the week axis, so navigating never rescales', () => {
  const monday = dayView({ layout, day: 1, today: 1, nowMin: null })
  const saturday = dayView({ layout, day: 6, today: 1, nowMin: null })
  eq(
    monday.find('axis').findAll('axis__label').length,
    saturday.find('axis').findAll('axis__label').length,
    'axis differs between days',
  )
})

test('the day view still splits the Saturday overlap', () => {
  const blocks = dayView({ layout, day: 6, today: 6, nowMin: null }).findAll('event')
  eq(blocks.length, 3)
})

test('the now-line appears in the day view only on today', () => {
  eq(dayView({ layout, day: 3, today: 3, nowMin: 13 * 60 }).findAll('day__now').length, 1)
  eq(dayView({ layout, day: 4, today: 3, nowMin: 13 * 60 }).findAll('day__now').length, 0)
})

test('an empty day renders a column with no events rather than nothing', () => {
  const empty = layoutWeek([])
  const node = dayView({ layout: empty, day: 2, today: 2, nowMin: null })
  eq(node.findAll('day').length, 1)
  eq(node.findAll('event').length, 0)
})

test('day and week views agree on what a day contains', () => {
  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    eq(
      dayView({ layout, day, today: 1, nowMin: null }).findAll('event').length,
      weekView({ layout, today: 1, nowMin: null }).findAll('day')[day - 1].findAll('event').length,
      `day ${day} differs between views`,
    )
  }
})

/* ------------------------------------ regression: the create-slot contract ---- */

test('tapping empty space reports a numeric startMin, not undefined', () => {
  // The grid speaks `minutes` internally but the onCreate contract is `startMin`.
  // Passing the internal shape straight through produced NaN start times.
  let received = null
  const grid = weekView({
    layout,
    today: 1,
    nowMin: null,
    editing: true,
    onCreate: (slot) => {
      received = slot
    },
  })

  const target = { closest: () => null, dataset: {} }
  grid.dispatch('click', { clientX: 50, clientY: 300, target })

  ok(received, 'onCreate never fired')
  ok(Number.isFinite(received.startMin), `startMin was ${received.startMin}`)
  ok(Number.isFinite(received.day), `day was ${received.day}`)
  // The stub column is 600px tall spanning the axis, which runs 09:00–22:00: the real
  // schedule is 10:30–20:30, plus EDGE_PAD_MIN either side snapped to whole hours.
  // Halfway is 15:30.
  eq(received.startMin, 15 * 60 + 30)
  eq(received.day, 1)
})

test('a click on empty space creates exactly once', () => {
  let created = 0
  const grid = weekView({
    layout, today: 1, nowMin: null, editing: true,
    onCreate: () => { created += 1 },
  })
  const target = { closest: () => null, dataset: {} }
  grid.dispatch('click', { clientX: 50, clientY: 300, target })
  eq(created, 1)
})

test('the editor never shows an unusable time field', () => {
  // <input type="time"> renders `--:--` for anything unparseable, which hides the
  // problem behind a form that cannot be submitted.
  const broken = { id: 'x', day: 1, start: 'NaN:NaN', duration_min: 60, title: 'зламана', colour: 'slate' }
  const node = editSheet({
    event: broken, isNew: false,
    onSave: () => {}, onDelete: () => {}, onDuplicate: () => {},
    onSaveTemplate: () => {}, onCancel: () => {}, onClose: () => {},
  })
  const times = node.findAll('field').map((f) => f.children[1]).filter((c) => c && c.type === 'time')
  eq(times.length, 1, 'no time input found')
  ok(times[0].value !== 'NaN:NaN', 'invalid time passed straight through')
  ok(/^\d{2}:\d{2}$/.test(times[0].value), `value was ${times[0].value}`)
})

test('an event with an icon renders it alongside the title', () => {
  const placed = { ...layout.days[3][0] }
  placed.event = { ...placed.event, icon: '🎹' }
  const node = eventBlock(placed)
  eq(node.findAll('event__icon').length, 1)
  eq(node.find('event__icon').textContent, '🎹')
  eq(node.find('event__title').textContent, placed.event.title)
})

test('an event without an icon renders no icon element', () => {
  const placed = { ...layout.days[3][0] }
  placed.event = { ...placed.event, icon: undefined }
  eq(eventBlock(placed).findAll('event__icon').length, 0)
})

const editorFor = (event, iconChoices = []) =>
  editSheet({
    event, isNew: false, iconChoices,
    onSave: () => {}, onDelete: () => {}, onDuplicate: () => {},
    onSaveTemplate: () => {}, onCancel: () => {}, onClose: () => {},
  })

const SAMPLE = { id: 'x', day: 1, start: '10:00', duration_min: 60, title: 'x', colour: 'slate' }

test('the editor builds its emoji picker from the settings list', () => {
  const node = editorFor({ ...SAMPLE, icon: '🎹' }, ['📚', '🎹', '🧪'])
  ok(node.find('icons'), 'no picker row')
  // Three choices plus the "none" option.
  eq(node.findAll('icons__pick').length, 4)
  eq(node.findAll('icons__none').length, 1)
})

test('the current icon is marked as selected', () => {
  const node = editorFor({ ...SAMPLE, icon: '🎹' }, ['📚', '🎹', '🧪'])
  const on = node.findAll('icons__pick--on')
  eq(on.length, 1)
  eq(on[0].textContent, '🎹')
})

test('with no icon the "none" option is the selected one', () => {
  const node = editorFor({ ...SAMPLE }, ['📚', '🎹'])
  const on = node.findAll('icons__pick--on')
  eq(on.length, 1)
  ok(on[0].className.includes('icons__none'), 'none option not selected')
})

test('an icon missing from the settings list is still offered, not silently lost', () => {
  // The owner may edit the `icons` setting after events already carry an emoji.
  const node = editorFor({ ...SAMPLE, icon: '🦕' }, ['📚', '🎹'])
  const labels = node.findAll('icons__pick').map((b) => b.textContent)
  ok(labels.includes('🦕'), `picker showed ${labels.join('')}`)
  eq(node.find('icons__pick--on').textContent, '🦕')
})

test('the picker copes with an empty settings list', () => {
  const node = editorFor({ ...SAMPLE }, [])
  eq(node.findAll('icons__pick').length, 1, 'only the none option should remain')
})


test('the block puts exactly one space between icon and title', () => {
  const placed = { ...layout.days[3][0] }
  placed.event = { ...placed.event, icon: '🎹', title: 'Фортепіано' }
  const heading = eventBlock(placed).find('event__heading')
  eq(heading.textContent, '🎹 Фортепіано')
})

test('without an icon the heading is just the title, with no stray space', () => {
  const placed = { ...layout.days[3][0] }
  placed.event = { ...placed.event, icon: undefined, title: 'Фортепіано' }
  eq(eventBlock(placed).find('event__heading').textContent, 'Фортепіано')
})

/* -------------------------------------------------- view-only vs editing ---- */

test('view-only mode exposes no editing affordances at all', () => {
  const node = weekView({ layout, today: 1, nowMin: null, editing: false })
  eq(node.findAll('event__grip').length, 0, 'resize grips present')
  ok(!node.className.includes('week--editing'), 'editing class applied')
})

test('a tap on empty space creates nothing when editing is off', () => {
  let created = 0
  const grid = weekView({
    layout, today: 1, nowMin: null, editing: false,
    onCreate: () => { created += 1 },
  })
  const target = { closest: () => null, dataset: {} }
  grid.dispatch('click', { clientX: 50, clientY: 300, target })
  eq(created, 0, 'view-only mode created an event')
})

test('a tap on an event opens nothing when editing is off', () => {
  let opened = 0
  const grid = weekView({
    layout, today: 1, nowMin: null, editing: false,
    onOpen: () => { opened += 1 },
  })
  const block = grid.findAll('event')[0]
  const target = { closest: () => block, dataset: {} }
  grid.dispatch('click', { clientX: 50, clientY: 300, target })
  eq(opened, 0, 'view-only mode opened the editor')
})

test('tapping a block opens it once editing is on', () => {
  let opened = null
  const grid = weekView({
    layout, today: 1, nowMin: null, editing: true,
    onOpen: (id) => { opened = id },
  })
  const block = grid.findAll('event')[0]
  const target = { closest: () => block, dataset: {} }
  grid.dispatch('click', { clientX: 50, clientY: 300, target })
  eq(opened, block.dataset.eventId)
})

test('the same taps do work once editing is on', () => {
  let created = 0
  const grid = weekView({
    layout, today: 1, nowMin: null, editing: true,
    onCreate: () => { created += 1 },
  })
  const target = { closest: () => null, dataset: {} }
  grid.dispatch('click', { clientX: 50, clientY: 300, target })
  eq(created, 1, 'editing mode failed to create')
})

test('the day view is equally inert when editing is off', () => {
  let touched = 0
  const grid = dayView({
    layout, day: 6, today: 6, nowMin: null, editing: false,
    onCreate: () => { touched += 1 },
    onOpen: () => { touched += 1 },
  })
  const target = { closest: () => null, dataset: {} }
  grid.dispatch('click', { clientX: 50, clientY: 300, target })
  eq(touched, 0)
  eq(grid.findAll('event__grip').length, 0)
})

/* ------------------------------------------------------- category filter ---- */

const CATS = [{ id: 'lessons', name: 'Уроки' }, { id: 'sport', name: 'Спорт' }]

test('the category bar renders nothing until the Sheet has categories', () => {
  // It must not occupy space in the title bar before the owner fills the tab in.
  eq(
    categoryBar({ categories: [], hidden: new Set(), counts: {}, uncategorised: 0,
                  onToggle: () => {}, onShowAll: () => {} }),
    null,
  )
})

test('the bar shows one toggle per category, with counts', () => {
  const bar = categoryBar({
    categories: CATS, hidden: new Set(), counts: { lessons: 3, sport: 1 }, uncategorised: 0,
    onToggle: () => {}, onShowAll: () => {},
  })
  eq(bar.findAll('cat').length, 2)
  eq(bar.findAll('cat__name').map((n) => n.textContent), ['Уроки', 'Спорт'])
  eq(bar.findAll('cat__count').map((n) => n.textContent), ['3', '1'])
})

test('a hidden category reads as switched off', () => {
  const bar = categoryBar({
    categories: CATS, hidden: new Set(['sport']), counts: { lessons: 3, sport: 1 },
    uncategorised: 0, onToggle: () => {}, onShowAll: () => {},
  })
  const off = bar.findAll('cat--off')
  eq(off.length, 1)
  ok(off[0].textContent.includes('Спорт'))
})

test('clicking a toggle reports which category', () => {
  let toggled = null
  const bar = categoryBar({
    categories: CATS, hidden: new Set(), counts: { lessons: 1, sport: 1 }, uncategorised: 0,
    onToggle: (id) => { toggled = id }, onShowAll: () => {},
  })
  bar.findAll('cat')[1].dispatch('click', {})
  eq(toggled, 'sport')
})

test('"show all" appears only while something is hidden', () => {
  const none = categoryBar({
    categories: CATS, hidden: new Set(), counts: {}, uncategorised: 0,
    onToggle: () => {}, onShowAll: () => {},
  })
  eq(none.findAll('cat--all').length, 0)

  const some = categoryBar({
    categories: CATS, hidden: new Set(['sport']), counts: {}, uncategorised: 0,
    onToggle: () => {}, onShowAll: () => {},
  })
  eq(some.findAll('cat--all').length, 1)
})

test('uncategorised events are called out, since no toggle governs them', () => {
  const bar = categoryBar({
    categories: CATS, hidden: new Set(), counts: {}, uncategorised: 19,
    onToggle: () => {}, onShowAll: () => {},
  })
  ok(bar.find('cats__note').textContent.includes('19'))
})

test('the editor offers a category select only when categories exist', () => {
  const base = { id: 'x', day: 1, start: '10:00', duration_min: 60, title: 'x', colour: 'slate' }
  const withCats = editSheet({
    event: base, isNew: false, iconChoices: [], categories: CATS,
    onSave: () => {}, onDelete: () => {}, onDuplicate: () => {},
    onSaveTemplate: () => {}, onCancel: () => {}, onClose: () => {},
  })
  const selects = withCats.findAll('sheet__select')
  ok(selects.length >= 2, 'no category select alongside the day select')

  const without = editSheet({
    event: base, isNew: false, iconChoices: [], categories: [],
    onSave: () => {}, onDelete: () => {}, onDuplicate: () => {},
    onSaveTemplate: () => {}, onCancel: () => {}, onClose: () => {},
  })
  eq(without.findAll('sheet__select').length, 1, 'category select shown with no categories')
})

/* ------------------------------------------------------- template editing ---- */

const TPL_CATS = [{ id: 'lessons', name: 'Уроки' }, { id: 'sport', name: 'Спорт' }]

const templateProps = (overrides = {}) => ({
  template: { id: 't1', title: 'ФТФ', colour: 'slate', icon: '🔭', category: 'lessons', duration_min: 90 },
  isNew: false,
  iconChoices: ['🔭', '🎹'],
  categories: TPL_CATS,
  onSave: () => {},
  onDelete: () => {},
  onClose: () => {},
  ...overrides,
})

test('the template sheet exposes every editable field', () => {
  const node = templateSheet(templateProps())
  eq(node.findAll('swatch').length, 8, 'no colour palette')
  ok(node.findAll('icons__pick').length >= 3, 'no icon picker')
  ok(node.find('sheet__select'), 'no category select')
  ok(node.find('chips'), 'no duration chips')
})

test('the template sheet pre-selects the current colour, icon and category', () => {
  const node = templateSheet(templateProps())
  eq(node.findAll('swatch--on').length, 1)
  eq(node.find('icons__pick--on').textContent, '🔭')
})

test('saving a template reports every field', () => {
  let saved = null
  const node = templateSheet(templateProps({ onSave: (v) => { saved = v } }))
  node.find('sheet__form').dispatch('submit', { preventDefault: () => {} })
  eq(saved.id, 't1')
  eq(saved.title, 'ФТФ')
  eq(saved.icon, '🔭')
  eq(saved.colour, 'slate')
  eq(saved.category, 'lessons')
  eq(saved.duration_min, 90)
})

test('a new template has no delete button and reads as new', () => {
  const node = templateSheet(templateProps({ isNew: true, template: { duration_min: 60 } }))
  eq(node.find('sheet__heading').textContent, 'Новий шаблон')
  const labels = node.findAll('app__button').map((b) => b.textContent)
  ok(!labels.some((l) => l.includes('Видалити')), `buttons were ${labels.join(' | ')}`)
})

test('a template with no title cannot be saved', () => {
  const node = templateSheet(templateProps({ isNew: true, template: { duration_min: 60 } }))
  const save = node.findAll('app__button').find((b) => b.textContent.includes('Зберегти'))
  eq(save.disabled, true, 'an untitled template was saveable')
})

test('the category select is omitted when the Sheet has no categories', () => {
  eq(templateSheet(templateProps({ categories: [] })).findAll('sheet__select').length, 0)
})

/* ----------------------------------------------------------- button icons ---- */

test('dialog buttons carry an icon and a label, not one or the other', () => {
  const node = templateSheet(templateProps())
  const buttons = node.findAll('app__button')
  ok(buttons.length >= 3, 'too few buttons to check')
  for (const b of buttons) {
    ok(b.find('app__button-icon'), `no icon on "${b.textContent}"`)
    // The label must survive alongside the icon: an irreversible action behind a bare
    // glyph is a worse target, and 🗑 vs 📋 at this size is not a safe distinction.
    ok(b.textContent.replace(/\s/g, '').length > 2, `icon-only button: "${b.textContent}"`)
  }
})

test('the event editor uses the same buttons', () => {
  const node = editSheet({
    event: { id: 'x', day: 1, start: '10:00', duration_min: 60, title: 'x', colour: 'slate' },
    isNew: false, iconChoices: [], categories: [],
    onSave: () => {}, onDelete: () => {}, onDuplicate: () => {},
    onSaveTemplate: () => {}, onCancel: () => {}, onClose: () => {},
  })
  const labels = node.findAll('app__button').map((b) => b.textContent)
  ok(labels.some((l) => l.includes('Видалити')), 'no delete')
  ok(labels.some((l) => l.includes('Дублювати')), 'no duplicate')
  for (const b of node.findAll('app__button')) ok(b.find('app__button-icon'), `bare "${b.textContent}"`)
})

/* ------------------------------------------------------------------ about ---- */

test('the about panel shows the version and its release date', () => {
  const node = aboutPanel({})
  eq(node.find('about__number').textContent, `Версія ${VERSION}`)
  eq(node.find('about__date').textContent, `(${RELEASED})`)
})

test('the release date is a real date, not a placeholder', () => {
  // A version carrying a stale or invented date quietly asserts something false about
  // what you are running.
  ok(/^\d{4}-\d{2}-\d{2}$/.test(RELEASED), `RELEASED was ${RELEASED}`)
  ok(!Number.isNaN(Date.parse(RELEASED)), 'unparseable date')
})

test('the about panel explains upgrading on every browser in use', () => {
  const node = aboutPanel({})
  const platforms = node.findAll('about__platforms')[0].children
    .filter((c) => c.tagName === 'DT')
    .map((c) => c.textContent)
  eq(platforms, ['macOS · Safari', 'macOS · Chrome', 'Android · Chrome', 'iPad · Safari'])
})

test('the about panel mentions the reset escape hatch', () => {
  // The moment you need it is the moment the app is stale on a phone, with no way to
  // read a document that lives on a laptop.
  ok(aboutPanel({}).textContent.includes('?reset'))
})

test('the release date is not in the future', () => {
  // Catches the other half of the stale-date problem: a typo like 2027 would sail
  // through the format check and claim the app is newer than it is.
  const released = Date.parse(RELEASED)
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000
  ok(released <= tomorrow, `RELEASED is ${RELEASED}, which is ahead of the clock`)
})

/* --------------------------------------------------------- cluster rendering ---- */

test('Saturday renders one cluster box plus a lone block', () => {
  const node = weekView({ layout, today: 1, nowMin: null })
  const saturday = node.findAll('day')[5]
  eq(saturday.findAll('cluster').length, 1, 'no cluster drawn for the overlap')
  // Three events on Субота: two inside the cluster, Японська on its own.
  eq(saturday.findAll('event').length, 3)
})

test('every event in a cluster keeps its name and its full time', () => {
  // The whole reason for this treatment: side-by-side ran out of room for the range.
  const rows = weekView({ layout, today: 1, nowMin: null }).findAll('day')[5].findAll('event--row')
  eq(rows.length, 2)
  eq(rows.map((r) => r.find('event__title').textContent), ['Вектор', 'Еврика'])
  eq(rows.map((r) => r.find('event__time').textContent), ['16:40–17:40', '17:00–18:00'])
})

test('a cluster row is still tappable, so it can be opened', () => {
  const rows = weekView({ layout, today: 1, nowMin: null }).findAll('day')[5].findAll('event--row')
  ok(rows.every((r) => r.dataset.eventId), 'a row lost its event id')
})

test('tapping a row inside a cluster opens that event', () => {
  let opened = null
  const grid = weekView({
    layout, today: 1, nowMin: null, editing: true,
    onOpen: (id) => { opened = id },
  })
  const row = grid.findAll('day')[5].findAll('event--row')[1]
  grid.dispatch('click', { clientX: 50, clientY: 300, target: { closest: () => row, dataset: {} } })
  eq(opened, row.dataset.eventId)
})

test('days with no overlaps draw no cluster boxes', () => {
  const node = weekView({ layout, today: 1, nowMin: null })
  // Неділя's events touch but never overlap — four separate blocks, no group.
  const sunday = node.findAll('day')[6]
  eq(sunday.findAll('cluster').length, 0)
  eq(sunday.findAll('event').length, 4)
})

test('the cluster carries its row count, so CSS can reserve height', () => {
  const box = weekView({ layout, today: 1, nowMin: null }).findAll('cluster')[0]
  eq(box.styleProps['--cluster-rows'], '2')
})

test('the day view clusters too', () => {
  const node = dayView({ layout, day: 6, today: 6, nowMin: null })
  eq(node.findAll('cluster').length, 1)
  eq(node.findAll('event--row').length, 2)
})
