import { append, el } from './dom.js'
import { ICON, actionButton } from './buttons.js'
import {
  categoryField,
  colourField,
  durationChips,
  field,
  iconField,
  textInput,
} from './fields.js'

/*
 * The template editor.
 *
 * A separate dialog from the event editor rather than the same one with fields hidden.
 * A template has no day, no start and no note, so reuse would mean threading a mode flag
 * through every field — the kind of conditional tangle that makes both cases harder to
 * read. The controls themselves are shared via `fields.js`, so the duplication here is
 * layout only.
 */

const QUICK_DURATIONS = [30, 45, 60, 90, 120]

/**
 * @param {{ template: { id?: string, title?: string, colour?: string, icon?: string,
 *                       category?: string, duration_min?: number },
 *           isNew: boolean,
 *           iconChoices?: string[],
 *           categories?: {id: string, name: string}[],
 *           onSave: (values: Object) => void,
 *           onDelete?: () => void,
 *           onClose?: () => void }} props
 * @returns {HTMLDialogElement}
 */
export function templateSheet({
  template,
  isNew,
  iconChoices = [],
  categories = [],
  onSave,
  onDelete,
  onClose,
}) {
  const dialog = /** @type {HTMLDialogElement} */ (el('dialog', 'sheet'))
  const form = el('form', 'sheet__form')

  const title = textInput('text', template.title ?? '')
  title.placeholder = 'Назва'
  title.className = 'sheet__title-input'

  const icon = iconField(template.icon ?? '', iconChoices)
  const colour = colourField(template.colour ?? 'slate')
  const category = categoryField(template.category, categories)

  const duration = textInput('number', String(template.duration_min ?? 60))
  duration.min = '5'
  duration.step = '5'

  const save = actionButton({ icon: ICON.save, label: 'Зберегти', kind: 'primary', type: 'submit' })

  const validate = () => {
    save.disabled = title.value.trim().length === 0 || Number(duration.value) < 5
  }
  title.addEventListener('input', validate)
  duration.addEventListener('input', validate)
  validate()

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (save.disabled) return
    onSave({
      id: template.id,
      title: title.value,
      icon: icon.value(),
      colour: colour.value(),
      category: category.value(),
      duration_min: Number(duration.value),
    })
    dialog.close()
  })

  dialog.addEventListener('close', () => onClose?.())

  append(
    form,
    el('h2', 'sheet__heading', undefined, isNew ? 'Новий шаблон' : 'Шаблон'),
    field('Назва', title),
    field('Емодзі', icon.node),
    field('Колір', colour.node),
    categories.length > 0 ? field('Категорія', category.node) : null,
    field('Тривалість, хв', duration),
    durationChips(QUICK_DURATIONS, (minutes) => {
      duration.value = String(minutes)
      validate()
    }),
    append(
      el('div', 'sheet__actions'),
      save,
      actionButton({ icon: ICON.cancel, label: 'Скасувати', onClick: () => dialog.close() }),
      el('span', 'app__spacer'),
      !isNew &&
        onDelete &&
        actionButton({
          icon: ICON.delete,
          label: 'Видалити',
          kind: 'danger',
          onClick: () => {
            onDelete()
            dialog.close()
          },
        }),
    ),
  )

  append(dialog, form)
  return dialog
}
