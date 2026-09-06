import { append, el } from './dom.js'
import { ICON, actionButton } from './buttons.js'

/**
 * Device-local settings. None of this is synced — `editingEnabled` in particular is a
 * per-device convenience (off on the phone by default), not a security boundary.
 *
 * @param {{ prefs: Object,
 *           defaultDuration: number,
 *           onChange: (patch: Object) => void,
 *           onChangeDefaultDuration: (minutes: number) => void,
 *           onForgetCredentials: () => void,
 *           onClose: () => void }} props
 * @returns {HTMLDialogElement}
 */
export function settingsPanel({
  prefs,
  defaultDuration,
  onChange,
  onChangeDefaultDuration,
  onForgetCredentials,
  onClearLocal,
  onResetApp,
  onClose,
}) {
  const dialog = /** @type {HTMLDialogElement} */ (el('dialog', 'sheet'))
  const body = el('div', 'sheet__form')

  append(body, el('h2', 'sheet__heading', undefined, 'Налаштування'))

  // --- editing on this device ----------------------------------------------
  // Mirrors the toolbar toggle — same preference, so the two can never disagree.
  const editing = el('input')
  editing.type = 'checkbox'
  editing.checked = Boolean(prefs.editingEnabled)
  editing.addEventListener('change', () => onChange({ editingEnabled: editing.checked }))
  append(body, toggle('Редагування на цьому пристрої', editing))

  // --- default duration ------------------------------------------------------
  const duration = el('input')
  duration.type = 'number'
  duration.min = '5'
  duration.step = '5'
  duration.value = String(defaultDuration)
  duration.addEventListener('change', () => {
    const value = Number(duration.value)
    if (value >= 5) onChangeDefaultDuration(value)
  })
  append(body, field('Тривалість нової події, хв', duration))

  // --- theme -----------------------------------------------------------------
  const theme = el('select', 'sheet__select')
  for (const [value, label] of [['system', 'Як у системі'], ['light', 'Світла'], ['dark', 'Темна']]) {
    const option = el('option', undefined, undefined, label)
    option.value = value
    if ((prefs.theme || 'system') === value) option.selected = true
    append(theme, option)
  }
  theme.addEventListener('change', () => onChange({ theme: theme.value }))
  append(body, field('Тема', theme))

  // --- density ----------------------------------------------------------------
  const density = el('input')
  density.type = 'range'
  density.min = '36'
  density.max = '110'
  density.step = '2'
  density.value = String(prefs.pxPerHour || 60)
  density.addEventListener('input', () => onChange({ pxPerHour: Number(density.value) }))
  append(body, field('Щільність (пікселів на годину)', density))

  const clearLocal = actionButton({
    icon: ICON.reload,
    label: 'Перезавантажити з таблиці',
    title: 'Стерти локальну копію і взяти дані з Google Sheet',
    onClick: () => {
      onClearLocal?.()
      dialog.close()
    },
  })

  const resetApp = actionButton({
    icon: ICON.reset,
    label: 'Скинути кеш застосунку',
    title: 'Прибрати service worker і кеш, потім перезавантажити',
    onClick: () => onResetApp?.(),
  })

  const forget = actionButton({
    icon: ICON.forget,
    label: 'Забути адресу і секрет',
    kind: 'danger',
    onClick: () => {
      onForgetCredentials()
      dialog.close()
    },
  })

  const close = actionButton({ icon: ICON.close, label: 'Закрити', onClick: () => dialog.close() })

  append(
    body,
    append(el('div', 'sheet__actions'), close, clearLocal, resetApp, el('span', 'app__spacer'), forget),
  )

  dialog.addEventListener('close', onClose)
  append(dialog, body)
  return dialog
}

function field(label, control) {
  const wrap = el('label', 'field')
  append(wrap, el('span', undefined, undefined, label), control)
  return wrap
}

function toggle(label, control) {
  const wrap = el('label', 'field field--row')
  append(wrap, control, el('span', undefined, undefined, label))
  return wrap
}
