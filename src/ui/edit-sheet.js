import { append, el } from './dom.js'
import { DAY_NAMES, DAYS } from '../layout/layout.js'
import { tryParseTime } from '../layout/time.js'
import { ICON, actionButton } from './buttons.js'
import {
  categoryField,
  colourField,
  durationChips,
  field,
  iconField,
  row,
  textInput,
} from './fields.js'

/*
 * The event editor. A native <dialog>, so focus trapping, Esc-to-close and the backdrop
 * come from the platform rather than from code we would have to maintain.
 */

const QUICK_DURATIONS = [30, 45, 60, 90, 120]

/**
 * @param {{ event: import('../layout/time.js').ScheduleEvent,
 *           isNew: boolean,
 *           iconChoices?: string[],
 *           categories?: {id: string, name: string}[],
 *           onSave: (patch: Object) => void,
 *           onDelete: () => void,
 *           onDuplicate: () => void,
 *           onSaveTemplate: () => void,
 *           onCancel?: () => void,
 *           onClose?: () => void }} props
 * @returns {HTMLDialogElement}
 */
export function editSheet({
  event,
  isNew,
  iconChoices = [],
  categories = [],
  onSave,
  onDelete,
  onDuplicate,
  onSaveTemplate,
  onCancel,
  onClose,
}) {
  const dialog = /** @type {HTMLDialogElement} */ (el('dialog', 'sheet'))
  const form = el('form', 'sheet__form')

  const title = textInput('text', event.title)
  title.placeholder = 'Назва'
  title.className = 'sheet__title-input'

  const icon = iconField(event.icon ?? '', iconChoices)
  const colour = colourField(event.colour)
  const category = categoryField(event.category, categories)

  const day = el('select', 'sheet__select')
  for (const d of DAYS) {
    const option = el('option', undefined, undefined, DAY_NAMES[d])
    option.value = String(d)
    if (d === event.day) option.selected = true
    append(day, option)
  }

  // <input type="time"> silently shows `--:--` for anything it cannot parse, which
  // hides the problem behind a form that cannot be submitted.
  const start = textInput('time', tryParseTime(event.start) === null ? '09:00' : event.start)
  start.step = '300' // 5 minutes — the real schedule has 16:40 and 17:45 in it

  const duration = textInput('number', String(event.duration_min))
  duration.min = '5'
  duration.step = '5'

  const note = textInput('text', event.note ?? '')
  note.placeholder = 'Нотатка'

  // --- actions -------------------------------------------------------------
  const save = actionButton({ icon: ICON.save, label: 'Зберегти', kind: 'primary', type: 'submit' })

  // The API rejects an empty title, so catch it here — a failed round trip is a worse
  // way to learn the field is required.
  const validate = () => {
    save.disabled = title.value.trim().length === 0
  }
  title.addEventListener('input', validate)
  validate()

  let submitted = false

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (save.disabled) return
    submitted = true
    onSave({
      title: title.value,
      icon: icon.value(),
      category: category.value(),
      colour: colour.value(),
      day: Number(day.value),
      start: start.value,
      duration_min: Number(duration.value),
      note: note.value,
    })
    dialog.close()
  })

  dialog.addEventListener('close', () => {
    // Closing without submitting must discard a brand-new event rather than leave an
    // untitled block behind.
    if (!submitted) onCancel?.()
    onClose?.()
  })

  const closing = (fn) => () => {
    fn()
    dialog.close()
  }

  append(
    form,
    field('Назва', title),
    field('Емодзі', icon.node),
    field('Колір', colour.node),
    categories.length > 0 ? field('Категорія', category.node) : null,
    field('День', day),
    row(field('Початок', start), field('Тривалість, хв', duration)),
    durationChips(QUICK_DURATIONS, (minutes) => {
      duration.value = String(minutes)
    }),
    field('Нотатка', note),
    append(
      el('div', 'sheet__actions'),
      save,
      actionButton({ icon: ICON.cancel, label: 'Скасувати', onClick: () => dialog.close() }),
      el('span', 'app__spacer'),
      !isNew && actionButton({ icon: ICON.duplicate, label: 'Дублювати', onClick: closing(onDuplicate) }),
      !isNew && actionButton({ icon: ICON.template, label: 'У шаблони', onClick: closing(onSaveTemplate) }),
      !isNew && actionButton({ icon: ICON.delete, label: 'Видалити', kind: 'danger', onClick: closing(onDelete) }),
    ),
  )

  append(dialog, form)
  return dialog
}
