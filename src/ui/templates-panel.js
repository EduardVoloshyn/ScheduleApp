import { append, el } from './dom.js'
import { ICON, actionButton } from './buttons.js'

/*
 * The template library.
 *
 * Picking one does not immediately create an event — it arms the grid, and the next tap
 * places it. That reuses the tap-to-create interaction instead of inventing a second
 * one, and lets you choose the slot rather than accepting a guess.
 *
 * Each row therefore carries two affordances: the body places the template, the pencil
 * edits it. Editing behind a separate control rather than a long-press, because a
 * long-press is undiscoverable and this panel is already a deliberate detour.
 */

/**
 * @param {{ templates: Array<{id: string, title: string, colour: string, icon?: string,
 *                             category?: string, duration_min: number}>,
 *           categoryName: (id: string | undefined) => string,
 *           onPick: (template: Object) => void,
 *           onEdit: (template: Object) => void,
 *           onCreate: () => void,
 *           onClose?: () => void }} props
 * @returns {HTMLDialogElement}
 */
export function templatesPanel({ templates, categoryName, onPick, onEdit, onCreate, onClose }) {
  const dialog = /** @type {HTMLDialogElement} */ (el('dialog', 'sheet'))
  const body = el('div', 'sheet__form')

  append(body, el('h2', 'sheet__heading', undefined, 'Шаблони'))

  if (templates.length === 0) {
    append(
      body,
      el(
        'p',
        'sheet__hint',
        undefined,
        'Поки порожньо. Створіть шаблон тут або збережіть подію через «У шаблони».',
      ),
    )
  }

  const list = el('div', 'templates')
  for (const template of templates) {
    const row = el('div', 'templates__row')

    const pick = el('button', `templates__pick templates__pick--${template.colour}`)
    pick.type = 'button'
    pick.title = `Додати «${template.title}» до розкладу`

    const meta = [`${template.duration_min} хв`]
    const category = categoryName ? categoryName(template.category) : ''
    if (category) meta.push(category)

    append(
      pick,
      template.icon ? el('span', 'templates__icon', undefined, template.icon) : null,
      el('span', 'templates__title', undefined, template.title),
      el('span', 'templates__meta', undefined, meta.join(' · ')),
    )
    pick.addEventListener('click', () => {
      onPick(template)
      dialog.close()
    })

    const edit = el('button', 'app__button templates__edit', undefined, ICON.edit)
    edit.type = 'button'
    edit.title = `Редагувати «${template.title}»`
    edit.addEventListener('click', () => {
      onEdit(template)
      dialog.close()
    })

    append(row, pick, edit)
    append(list, row)
  }
  append(body, list)

  append(
    body,
    append(
      el('div', 'sheet__actions'),
      actionButton({
        icon: ICON.add,
        label: 'Новий шаблон',
        kind: 'primary',
        onClick: () => {
          onCreate()
          dialog.close()
        },
      }),
      actionButton({ icon: ICON.close, label: 'Закрити', onClick: () => dialog.close() }),
    ),
  )

  dialog.addEventListener('close', () => onClose?.())
  append(dialog, body)
  return dialog
}
