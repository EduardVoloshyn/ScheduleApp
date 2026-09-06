import { layoutWeek } from './layout/index.js'
import { DAY_NAMES } from './layout/layout.js'
import { SEED_EVENTS } from './fixtures/seed.js'
import {
  createEvent,
  deleteEvent,
  duplicateEvent,
  eventFromTemplate,
  findEvent,
  moveEvent,
  partitionUsable,
  resizeEvent,
  newId,
  templateFromEvent,
  updateEvent,
} from './model/schedule.js'
import { iconChoicesFrom } from './model/icons.js'
import {
  categoryCounts,
  hiddenSet,
  parseCategories,
  toggleHidden,
  visibleEvents,
} from './model/categories.js'
import { ApiError, fetchSchedule, saveSchedule } from './sync/api.js'
import { hardReset, resetRequested } from './sync/reset.js'
import { singleFlight } from './sync/single-flight.js'
import {
  clearCredentials,
  clearPending,
  loadCredentials,
  loadPending,
  loadPrefs,
  loadSnapshot,
  saveCredentials,
  savePending,
  savePrefs,
  saveSnapshot,
} from './sync/storage.js'
import { append, clear, el } from './ui/dom.js'
import { categoryBar } from './ui/category-bar.js'
import { editSheet } from './ui/edit-sheet.js'
import { setupCard } from './ui/setup-card.js'
import { settingsPanel } from './ui/settings-panel.js'
import { templateSheet } from './ui/template-sheet.js'
import { templatesPanel } from './ui/templates-panel.js'
import { dayView } from './ui/day-view.js'
import { weekView } from './ui/week-view.js'

/**
 * The whole application. State is a plain object and every change re-renders the tree
 * from scratch — at ~50 events that is imperceptible, and it removes any need for
 * diffing or a framework (ADR-0006).
 */

/** Writes are batched: a drag produces many mutations, and each save costs ~4s. */
const SAVE_DEBOUNCE_MS = 1200

const state = {
  credentials: loadCredentials(),
  /** Read synchronously, so the very first paint already has the schedule. */
  snapshot: sanitizeCached(loadSnapshot()),
  prefs: withDefaults(loadPrefs()),
  /** @type {{ status: 'idle'|'loading'|'saving'|'ok'|'error', message?: string, code?: string }} */
  sync: { status: 'idle' },
  /** Live drag preview; never committed until the pointer is released. */
  drag: null,
  /** A template armed from the library, placed by the next tap on the grid. */
  armedTemplate: null,
  /**
   * A newly created event that is on screen but NOT yet part of the saved schedule.
   * It is committed only when the editor is confirmed, so a half-typed event is never
   * sent to the API — which used to fail validation on the empty title.
   */
  draftEvent: null,
  /** Open modal count, so a background error cannot shout over the editor. */
  dialogs: 0,
  /** Local edits not yet confirmed by the server. */
  dirty: Boolean(loadPending()),
  /** Which day the day view is showing; follows the clock until you navigate. */
  viewDay: isoToday(),
  today: isoToday(),
  nowMin: nowMinutes(),
}

/**
 * Drops events the API could never accept from the *cached* copy.
 *
 * Without this, one unusable event wedges the app permanently: every save is rejected,
 * the pending payload is retried on every open, and no refresh ever runs. Only the
 * local cache is cleaned — data fetched from the Sheet is left alone so a hand-edited
 * row is reported rather than quietly deleted.
 */
function sanitizeCached(snapshot) {
  if (!snapshot) return snapshot
  const { usable, dropped } = partitionUsable(snapshot.events)
  if (dropped.length === 0) return snapshot

  // The pending payload was built from the corrupt list, so it can never succeed.
  clearPending()
  const cleaned = { ...snapshot, events: usable }
  saveSnapshot(cleaned)
  return cleaned
}

function withDefaults(prefs) {
  return {
    // Off by default on every device. Reading is what this app is for; editing is
    // rare and deliberate, so it should be switched on for the occasion rather than
    // left armed. A local UI flag, not a security boundary.
    editingEnabled: prefs.editingEnabled ?? false,
    // The phone opens on a single day — "what do I have today" is the most frequent
    // use of this app by a wide margin.
    view: prefs.view ?? (isSmallTouchScreen() ? 'day' : 'week'),
    theme: prefs.theme ?? 'system',
    pxPerHour: prefs.pxPerHour ?? 60,
    // Stored as the hidden list, so a category added to the Sheet later appears by
    // default rather than being invisible until someone finds the toggle.
    hiddenCategories: prefs.hiddenCategories ?? [],
  }
}

function isSmallTouchScreen() {
  if (typeof matchMedia !== 'function') return false
  return matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 820px)').matches
}

/** ISO weekday from the device clock: 1 = Monday … 7 = Sunday. */
function isoToday() {
  return ((new Date().getDay() + 6) % 7) + 1
}

function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function setState(patch) {
  Object.assign(state, patch)
  render()
}

/* ------------------------------------------------------------------ events ---- */

/** What is actually saved. Mutations are computed against this. */
function currentEvents() {
  return state.snapshot ? state.snapshot.events : SEED_EVENTS
}

/** What the grid draws: the saved schedule plus any unconfirmed new event. */
function displayEvents() {
  return state.draftEvent ? [...currentEvents(), state.draftEvent] : currentEvents()
}

function categories() {
  return parseCategories(state.snapshot?.categories)
}

function setHiddenCategories(hidden) {
  const prefs = { ...state.prefs, hiddenCategories: hidden }
  savePrefs(prefs)
  setState({ prefs })
}

function defaultDuration() {
  const fromSheet = Number(state.snapshot?.settings?.default_duration_min)
  return Number.isFinite(fromSheet) && fromSheet >= 5 ? fromSheet : 60
}

/**
 * Commits an edit: local first, saved in the background. The UI never waits on the
 * network — a write costs ~4s against Apps Script (ADR-0005).
 */
function applyEvents(events) {
  if (!state.snapshot) {
    // Editing the seed before the first fetch would be written over. Refuse quietly.
    setState({ sync: { status: 'error', message: 'Спочатку завантажте розклад.' } })
    return
  }
  const snapshot = { ...state.snapshot, events }
  saveSnapshot(snapshot)
  setState({ snapshot, dirty: true })
  scheduleSave()
}

function applyTemplates(templates) {
  if (!state.snapshot) return
  const snapshot = { ...state.snapshot, templates }
  saveSnapshot(snapshot)
  setState({ snapshot, dirty: true })
  scheduleSave()
}

/* -------------------------------------------------------------------- sync ---- */

let saveTimer = 0

function scheduleSave() {
  clearTimeout(saveTimer)
  // flushSave reports failure through state; swallow here so a rejected promise
  // from a background timer is not an unhandled rejection.
  saveTimer = setTimeout(() => flushSave().catch(() => {}), SAVE_DEBOUNCE_MS)
}

/**
 * Sends the whole schedule. Wrapped in `singleFlight`, so overlapping edits cannot put
 * two writes on the wire carrying the same hash — see that module for why that matters.
 */
const flushSave = singleFlight(
  async () => {
    if (!state.credentials || !state.snapshot) return

    const payload = {
      hash: state.snapshot.hash,
      events: state.snapshot.events,
      templates: state.snapshot.templates,
      settings: state.snapshot.settings,
    }

    // Persisted *before* the request. A write takes ~4s, which is ample time to close
    // the tab, and the edit must not vanish if that happens (ADR-0005).
    savePending(payload)
    setState({ sync: { status: 'saving' } })

    try {
      const result = await saveSchedule(state.credentials, payload)
      const snapshot = { ...state.snapshot, hash: result.hash }
      saveSnapshot(snapshot)
      clearPending()
      setState({ snapshot, dirty: false, sync: { status: 'ok' } })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown'
      const message = err instanceof ApiError ? err.message : 'Не вдалося зберегти'
      // The pending payload stays on disk, so nothing is lost.
      setState({ sync: { status: 'error', message, code } })
      throw err
    }
  },
  // Edits made while that save was in flight, collapsed into one follow-up.
  { onRerun: () => scheduleSave() },
)

/** Re-reads to pick up the current hash, then re-sends the local edits. */
async function retryAfterStale() {
  if (!state.credentials || !state.snapshot) return
  setState({ sync: { status: 'saving' } })
  let fresh
  try {
    fresh = await fetchSchedule(state.credentials)
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Не вдалося оновити'
    setState({ sync: { status: 'error', message, code: 'network' } })
    return
  }

  setState({ snapshot: { ...state.snapshot, hash: fresh.hash } })
  // Failure here is already reported by flushSave, and with a better message than
  // anything this function could add.
  await flushSave().catch(() => {})
}

/** Throws away local edits and takes whatever the Sheet says. */
async function discardLocal() {
  clearPending()
  // Drop the cached events too: the whole point is to stop trusting the local copy.
  setState({ dirty: false, draftEvent: null, sync: { status: 'loading' } })
  await refresh()
}

async function refresh() {
  if (!state.credentials) return
  setState({ sync: { status: 'loading' } })
  try {
    const snapshot = await fetchSchedule(state.credentials)
    saveSnapshot(snapshot)
    setState({ snapshot, sync: { status: 'ok' } })
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Невідома помилка'
    setState({ sync: { status: 'error', message, code: 'network' } })
  }
}

/* ---------------------------------------------------------------- dialogs ---- */

function openDialog(node) {
  document.body.appendChild(node)
  state.dialogs += 1
  node.showModal()
  node.addEventListener('close', () => {
    state.dialogs = Math.max(0, state.dialogs - 1)
    node.remove()
  })
}

function openEditor(id, { isNew = false } = {}) {
  const event = findEvent(displayEvents(), id)
  if (!event) return

  openDialog(
    editSheet({
      event,
      isNew,
      // Edited by hand in the Sheet's `icons` setting — no UI for it by design.
      iconChoices: iconChoicesFrom(state.snapshot?.settings),
      categories: categories(),
      onSave: (patch) => {
        if (isNew) {
          // Commit the draft: apply the edits, then add it to the saved schedule. Only
          // now does anything reach the API.
          const committed = updateEvent([state.draftEvent], id, patch)[0]
          state.draftEvent = null
          applyEvents([...currentEvents(), committed])
        } else {
          applyEvents(updateEvent(currentEvents(), id, patch))
        }
      },
      onCancel: () => {
        // A discarded draft never existed as far as the schedule is concerned.
        if (isNew && state.draftEvent?.id === id) setState({ draftEvent: null })
      },
      onDelete: () => {
        if (isNew) setState({ draftEvent: null })
        else applyEvents(deleteEvent(currentEvents(), id))
      },
      onDuplicate: () => applyEvents(duplicateEvent(currentEvents(), id)),
      onSaveTemplate: () => {
        const templates = [...(state.snapshot?.templates ?? []), templateFromEvent(event)]
        applyTemplates(templates)
      },
      onClose: () => render(),
    }),
  )
}

function openTemplates() {
  openDialog(
    templatesPanel({
      templates: state.snapshot?.templates ?? [],
      categoryName: (id) => categories().find((c) => c.id === id)?.name ?? '',
      onPick: (template) => setState({ armedTemplate: template }),
      onEdit: (template) => openTemplateEditor(template, { isNew: false }),
      onCreate: () => openTemplateEditor({ duration_min: defaultDuration() }, { isNew: true }),
      onClose: () => render(),
    }),
  )
}

function openTemplateEditor(template, { isNew }) {
  openDialog(
    templateSheet({
      template,
      isNew,
      iconChoices: iconChoicesFrom(state.snapshot?.settings),
      categories: categories(),
      onSave: (values) => {
        const existing = state.snapshot?.templates ?? []
        const saved = {
          id: values.id ?? newId(),
          title: values.title.trim(),
          colour: values.colour,
          icon: values.icon || undefined,
          category: values.category || undefined,
          duration_min: values.duration_min,
        }
        applyTemplates(
          isNew || !values.id
            ? [...existing, saved]
            : existing.map((t) => (t.id === values.id ? saved : t)),
        )
      },
      onDelete: isNew
        ? undefined
        : () => applyTemplates((state.snapshot?.templates ?? []).filter((t) => t.id !== template.id)),
      onClose: () => render(),
    }),
  )
}

/* ----------------------------------------------------------------- toolbar ---- */

function toolbar(cats) {
  const bar = el('div', 'app__bar')
  const editable = state.prefs.editingEnabled

  const refreshButton = button(state.sync.status === 'loading' ? '…' : '↻', 'Оновити', () =>
    void refresh(),
  )
  refreshButton.disabled = state.sync.status === 'loading' || !state.credentials

  // Like the editing toggle, the label names the ACTION: 'Т' switches to the week
  // (тиждень), 'Д' to the day (день). Cyrillic, matching the rest of the UI.
  const showingDay = state.prefs.view === 'day'
  const viewButton = button(
    showingDay ? 'Т' : 'Д',
    showingDay ? 'Показати тиждень' : 'Показати день',
    () => setView(showingDay ? 'week' : 'day'),
  )
  // Fixed width so the toolbar does not shift as the letter changes.
  viewButton.className = 'app__button app__button--glyph'

  // Editing lives next to the other controls rather than behind settings: it is the
  // one switch that changes what the whole surface does.
  //
  // The icon names the ACTION, not the state: a pencil means "start editing", a lock
  // means "stop". So it carries no pressed styling — that would mix two conventions in
  // one control, and a highlighted lock would read as "locked" when it means the
  // opposite. Edit mode announces itself through the grid instead: the templates button
  // appears, grips appear, and the cursor changes.
  const editButton = button(
    editable ? '🔒' : '✏️',
    editable ? 'Завершити редагування' : 'Редагувати',
    () => setEditing(!editable),
  )
  editButton.disabled = !state.snapshot

  const templatesButton = button('+Ш', 'Шаблони', openTemplates)
  // Fixed width, as for D/W: letters have their own advance widths and the toolbar
  // would shift as labels change.
  templatesButton.className = 'app__button app__button--glyph'
  templatesButton.disabled = !state.snapshot

  const settingsButton = button('⚙', 'Налаштування', () =>
    openDialog(
      settingsPanel({
        prefs: state.prefs,
        defaultDuration: defaultDuration(),
        onChange: (patch) => {
          // The editing flag goes through setEditing, so switching it off from here
          // tears down a draft or armed template exactly as the toolbar toggle does.
          if (patch.editingEnabled !== undefined) {
            setEditing(patch.editingEnabled)
            return
          }
          const prefs = { ...state.prefs, ...patch }
          savePrefs(prefs)
          applyTheme(prefs)
          setState({ prefs })
        },
        onChangeDefaultDuration: (minutes) => {
          if (!state.snapshot) return
          const settings = { ...state.snapshot.settings, default_duration_min: String(minutes) }
          const snapshot = { ...state.snapshot, settings }
          saveSnapshot(snapshot)
          setState({ snapshot, dirty: true })
          scheduleSave()
        },
        onClearLocal: () => void discardLocal(),
        onResetApp: () => void hardReset({ data: false }),
        onForgetCredentials: () => {
          clearCredentials()
          setState({ credentials: null })
        },
        onClose: () => render(),
      }),
    ),
  )

  return append(
    bar,
    el('h1', 'app__title', undefined, 'Розклад'),
    // The filters sit with the title rather than on a line of their own: they are part
    // of what you are looking at, and a second full-width row cost vertical space the
    // grid wants back.
    cats,
    el('span', 'app__spacer'),
    el('span', `app__status${busy() ? ' app__status--busy' : ''}`, undefined, statusText()),
    viewButton,
    editButton,
    editable && templatesButton,
    refreshButton,
    settingsButton,
  )
}

function button(label, title, onClick) {
  const node = el('button', 'app__button', undefined, label)
  node.type = 'button'
  node.title = title
  node.addEventListener('click', onClick)
  return node
}

function statusText() {
  if (state.sync.status === 'saving') return 'Збереження…'
  if (state.sync.status === 'loading') return 'Синхронізація…'
  if (state.dirty) return 'Не збережено'
  if (state.sync.status === 'error') return 'Немає зʼєднання'
  if (!state.snapshot) return 'Зразок даних'
  const mins = Math.floor((Date.now() - state.snapshot.fetchedAt) / 60000)
  if (mins < 1) return 'Щойно оновлено'
  if (mins < 60) return `${mins} хв тому`
  return `${Math.floor(mins / 60)} год тому`
}

/* ------------------------------------------------------------------ render ---- */

/** Applies the in-flight drag to a copy of the list, so the preview is live. */
function eventsWithDraft() {
  const events = displayEvents()
  if (!state.drag) return events
  const { id, mode, day, startMin, durationMin } = state.drag
  return mode === 'resize'
    ? resizeEvent(events, id, durationMin)
    : moveEvent(events, id, { day, startMin })
}

function applyTheme(prefs) {
  const root = document.documentElement
  if (prefs.theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', prefs.theme)
  root.style.setProperty('--px-per-hour', `${prefs.pxPerHour}px`)
}

function render() {
  const root = document.getElementById('root')
  if (!root) throw new Error('#root missing from index.html')
  clear(root)

  if (!state.credentials) {
    append(
      root,
      setupCard({
        error: state.sync.status === 'error' ? state.sync.message : undefined,
        onSave: (creds) => {
          saveCredentials(creds)
          setState({ credentials: creds })
          void refresh()
        },
      }),
    )
    return
  }

  const cats = categories()
  const hidden = hiddenSet(state.prefs.hiddenCategories)
  const { counts, uncategorised } = categoryCounts(eventsWithDraft(), cats)

  // Filtering is a view concern, so it happens here rather than in the layout engine —
  // the axis still fits the whole week, so hiding a category does not rescale the grid.
  const layout = layoutWeek(visibleEvents(eventsWithDraft(), hidden, cats))
  const editable = state.prefs.editingEnabled && Boolean(state.snapshot)

  const app = el('div', 'app')
  append(
    app,
    toolbar(
      categoryBar({
        categories: cats,
        hidden,
        counts,
        uncategorised,
        onToggle: (id) => setHiddenCategories(toggleHidden(hidden, id)),
        onShowAll: () => setHiddenCategories([]),
      }),
    ),
  )

  if (state.armedTemplate) {
    append(app, armedBanner())
  }

  // Nothing red while you are mid-edit. A banner behind a modal is noise you cannot act
  // on, and it shifts the grid underneath as it appears and disappears. Both notices
  // come back once the editor closes, if they still apply.
  const editingNow = state.dialogs > 0 || state.draftEvent !== null

  if (state.sync.status === 'error' && !editingNow) {
    append(app, errorNotice())
  }

  if (layout.invalid.length > 0 && !editingNow) {
    const detail = layout.invalid.map((i) => `${i.event.title} (${i.reason})`).join('; ')
    append(app, el('div', 'notice', undefined, `${layout.invalid.length} подій не показано: ${detail}`))
  }

  const handlers = {
    layout,
    today: state.today,
    nowMin: state.nowMin,
    editing: editable,
    dragId: state.drag?.id ?? null,
    onCreate: onCreateAt,
    onOpen: (id) => openEditor(id),
    onDrag: (draft) => setState({ drag: draft }),
    onDragEnd: (draft) => {
      const events = currentEvents()
      const next =
        draft.mode === 'resize'
          ? resizeEvent(events, draft.id, draft.durationMin)
          : moveEvent(events, draft.id, { day: draft.day, startMin: draft.startMin })
      state.drag = null
      applyEvents(next)
    },
  }

  if (state.prefs.view === 'day') append(app, dayNav())

  const scroll = el('div', 'app__scroll')
  append(
    scroll,
    state.prefs.view === 'day'
      ? dayView({ ...handlers, day: state.viewDay })
      : weekView(handlers),
  )
  append(app, scroll)
  append(root, app)
}

/**
 * Turning editing off must also drop anything mid-edit — a half-placed template or an
 * unconfirmed draft would otherwise sit on the grid with no way to finish or cancel it.
 */
function setEditing(enabled) {
  const prefs = { ...state.prefs, editingEnabled: enabled }
  savePrefs(prefs)
  setState(
    enabled
      ? { prefs }
      : { prefs, armedTemplate: null, draftEvent: null, drag: null },
  )
}

function setView(view) {
  const prefs = { ...state.prefs, view }
  savePrefs(prefs)
  setState({ prefs, viewDay: view === 'day' ? state.today : state.viewDay })
}

function shiftDay(delta) {
  // 1..7 wrap-around, so ‹ from Понеділок lands on Неділя.
  setState({ viewDay: ((state.viewDay - 1 + delta + 7) % 7) + 1 })
}

/** Day navigation: previous, the name itself, next, and a way back to today. */
function dayNav() {
  const nav = el('div', 'daynav')
  const count = currentEvents().filter((e) => Number(e.day) === state.viewDay).length

  append(
    nav,
    button('‹', 'Попередній день', () => shiftDay(-1)),
    append(
      el('div', 'daynav__label'),
      el(
        'span',
        `daynav__name${state.viewDay === state.today ? ' daynav__name--today' : ''}`,
        undefined,
        DAY_NAMES[state.viewDay],
      ),
      el('span', 'daynav__count', undefined, count === 0 ? 'вільно' : `${count} подій`),
    ),
    button('›', 'Наступний день', () => shiftDay(1)),
  )

  if (state.viewDay !== state.today) {
    append(nav, button('Сьогодні', 'Повернутися до сьогодні', () => setState({ viewDay: state.today })))
  }

  return nav
}

function busy() {
  return state.sync.status === 'loading' || state.sync.status === 'saving'
}

function onCreateAt({ day, startMin }) {
  // fitWithinDay throws on non-finite input by design. Catch it here so a bad slot
  // reports itself instead of killing the pointer handler mid-gesture.
  if (!Number.isFinite(startMin) || !Number.isFinite(day)) {
    setState({ sync: { status: 'error', message: 'Не вдалося визначити час.', code: 'internal' } })
    return
  }

  const events = currentEvents()

  if (state.armedTemplate) {
    const created = eventFromTemplate(state.armedTemplate, { day, startMin })
    state.armedTemplate = null
    applyEvents([...events, created])
    return
  }

  // Held as a draft, not saved: an untitled event would fail the API's validation, and
  // nothing should reach the Sheet before you have confirmed it.
  const created = createEvent({ day, startMin, durationMin: defaultDuration(), title: '' })
  setState({ draftEvent: created })
  openEditor(created.id, { isNew: true })
}

function armedBanner() {
  const banner = el('div', 'banner')
  append(
    banner,
    el('span', undefined, undefined, `Оберіть місце для «${state.armedTemplate.title}»`),
    el('span', 'app__spacer'),
    button('Скасувати', 'Скасувати', () => setState({ armedTemplate: null })),
  )
  return banner
}

function errorNotice() {
  const notice = el('div', 'notice')
  append(notice, el('span', undefined, undefined, state.sync.message))

  if (state.sync.code === 'stale') {
    append(
      notice,
      el('span', 'app__spacer'),
      button('Перезаписати', 'Надіслати мої зміни поверх', () => void retryAfterStale()),
      button('Відкинути мої зміни', 'Взяти версію з таблиці', () => void discardLocal()),
    )
  } else if (state.sync.code === 'invalid') {
    // Retrying identical invalid data would fail identically. The only way out is to
    // take the Sheet's version.
    append(
      notice,
      el('span', 'app__spacer'),
      button('Відкинути мої зміни', 'Взяти версію з таблиці', () => void discardLocal()),
    )
  } else if (state.dirty) {
    append(notice, el('span', 'app__spacer'), button('Повторити', 'Спробувати ще раз', () => void flushSave().catch(() => {})))
  }

  return notice
}

/* -------------------------------------------------------------------- boot ---- */

// Handled first: if the app is wedged, nothing after this point is trustworthy.
const requestedReset = resetRequested()
if (requestedReset) {
  void hardReset({ data: requestedReset === 'all' })
}

applyTheme(state.prefs)

// Offline and installability, in production only. A service worker cannot register on
// the plain-HTTP LAN address used for device testing anyway.
const IS_LOCALHOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)

if ('serviceWorker' in navigator) {
  if (IS_LOCALHOST) {
    // Development: no service worker at all. A cache-first worker on localhost means
    // edits appear one reload late, which cost real time chasing bugs that were
    // already fixed. This also removes any worker left over from earlier testing.
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((r) => r.unregister()))
      .catch(() => {})
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {})
    }
  } else if (location.protocol === 'https:') {
    // `updateViaCache: 'none'` stops the browser serving a cached sw.js, and reloading
    // when a new worker takes control means a deploy actually reaches the device.
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      location.reload()
    })

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js', { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch(() => {
          // Not fatal: without it the app still works, just online-only.
        })
    })
  }
}

// Keep the current-time line honest without re-rendering constantly.
setInterval(() => setState({ nowMin: nowMinutes(), today: isoToday() }), 30000)

// Poll on focus: Sheets pushes nothing, so this is the only way a change made on
// another device arrives.
window.addEventListener('focus', () => {
  if (state.credentials && !state.dirty) void refresh()
})

if (!requestedReset) {
  render()
}

if (state.credentials && !requestedReset) {
  // A save interrupted by the app closing is retried before anything else, so the
  // local edit is not silently lost.
  // A save interrupted by the app closing is retried once. If it fails as `invalid`
  // the notice offers a way out, rather than the app retrying it on every open.
  if (loadPending() && state.dirty) flushSave().catch(() => {})
  else void refresh()
}
