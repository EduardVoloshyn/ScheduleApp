import { PALETTE } from '../model/schedule.js'
import { append, el } from './dom.js'

/*
 * Form controls shared by the event editor and the template sheet.
 *
 * Extracted rather than copied: colour, icon and category behave identically in both,
 * and two divergent copies of the "keep an icon that is no longer in the list" rule is
 * exactly the kind of thing that rots.
 *
 * Each builder returns `{ node, value() }` — the caller lays the node out and reads the
 * value on submit, so these hold their own state without a framework.
 */

/**
 * A row of palette swatches. Colour is always a token, never a free value (ADR-0002).
 *
 * @param {string} selected
 * @returns {{ node: HTMLElement, value: () => string }}
 */
export function colourField(selected) {
  let colour = PALETTE.includes(selected) ? selected : 'slate'

  const node = el('div', 'swatches')
  const buttons = PALETTE.map((token) => {
    const button = el('button', `swatch swatch--${token}${token === colour ? ' swatch--on' : ''}`)
    button.type = 'button'
    button.title = token
    button.addEventListener('click', () => {
      colour = token
      for (const other of buttons) other.classList.remove('swatch--on')
      button.classList.add('swatch--on')
    })
    return button
  })
  append(node, ...buttons)

  return { node, value: () => colour }
}

/**
 * Borderless emoji buttons, from the Sheet's `icons` setting, plus a clear option.
 *
 * @param {string} selected
 * @param {string[]} choices
 * @returns {{ node: HTMLElement, value: () => string }}
 */
export function iconField(selected, choices = []) {
  let icon = selected ?? ''
  const buttons = []
  const node = el('div', 'icons')

  const clear = el(
    'button',
    `icons__pick icons__none${icon ? '' : ' icons__pick--on'}`,
    undefined,
    '—',
  )
  clear.type = 'button'
  clear.title = 'Без емодзі'
  buttons.push(clear)
  append(node, clear)

  // An icon set before the settings list changed must still be offered, or editing
  // anything else about the row would quietly strip it.
  const offered = !icon || choices.includes(icon) ? choices : [icon, ...choices]

  for (const choice of offered) {
    const pick = el(
      'button',
      `icons__pick${choice === icon ? ' icons__pick--on' : ''}`,
      undefined,
      choice,
    )
    pick.type = 'button'
    pick.dataset.icon = choice
    buttons.push(pick)
    append(node, pick)
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      icon = button.dataset.icon ?? ''
      for (const other of buttons) other.classList.remove('icons__pick--on')
      button.classList.add('icons__pick--on')
    })
  }

  return { node, value: () => icon }
}

/**
 * A plain select. At three or four entries a picker would be more chrome than help, and
 * unlike colour or icon a category has no visual form of its own.
 *
 * @param {string | undefined} selected
 * @param {{ id: string, name: string }[]} categories
 * @returns {{ node: HTMLSelectElement, value: () => string }}
 */
export function categoryField(selected, categories = []) {
  const node = /** @type {HTMLSelectElement} */ (el('select', 'sheet__select'))

  const none = el('option', undefined, undefined, '— без категорії —')
  none.value = ''
  if (!selected) none.selected = true
  append(node, none)

  let matched = false
  for (const category of categories) {
    const option = el('option', undefined, undefined, category.name)
    option.value = category.id
    if (category.id === selected) {
      option.selected = true
      matched = true
    }
    append(node, option)
  }

  // The row may name a category since deleted from the tab. Offering it keeps the value
  // rather than silently reassigning the row on the next save.
  if (selected && !matched) {
    const orphan = el('option', undefined, undefined, `${selected} (немає в списку)`)
    orphan.value = selected
    orphan.selected = true
    append(node, orphan)
  }

  return { node, value: () => node.value }
}

/** Quick-pick duration chips. */
export function durationChips(minutes, onPick) {
  const node = el('div', 'chips')
  for (const value of minutes) {
    const chip = el('button', 'chip', undefined, `${value} хв`)
    chip.type = 'button'
    chip.addEventListener('click', () => onPick(value))
    append(node, chip)
  }
  return node
}

/** @param {string} label @param {HTMLElement} control */
export function field(label, control) {
  const wrap = el('label', 'field')
  append(wrap, el('span', undefined, undefined, label), control)
  return wrap
}

export function row(...children) {
  return append(el('div', 'sheet__row'), ...children)
}

export function textInput(type, value) {
  const node = el('input')
  node.type = type
  node.value = value ?? ''
  node.autocomplete = 'off'
  return node
}
