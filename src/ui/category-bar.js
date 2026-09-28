import { UNCATEGORISED } from '../model/categories.js'
import { append, el } from './dom.js'

/**
 * The category filter, in the title bar.
 *
 * One toggle per category, plus a count. Hidden categories read as switched off; the
 * state is device-local, because what you are looking at is not something the other
 * devices should inherit.
 *
 * Renders nothing at all when the Sheet has no categories, so the bar does not occupy
 * space until the owner has filled the tab in. That also settles the uncategorised
 * toggle for that case: with no categories every event is uncategorised, and a switch
 * that blanks the whole schedule is not worth offering.
 *
 * @param {{ categories: import('../model/categories.js').Category[],
 *           hidden: Set<string>,
 *           counts: Record<string, number>,
 *           uncategorised: number,
 *           onToggle: (id: string) => void,
 *           onShowAll: () => void }} props
 * @returns {HTMLElement | null}
 */
export function categoryBar({ categories, hidden, counts, uncategorised, onToggle, onShowAll }) {
  if (categories.length === 0) return null

  const bar = el('div', 'cats')

  /** One builder for every toggle, so the uncategorised one cannot drift from the rest. */
  const chip = (id, name, count, extraClass = '') => {
    const off = hidden.has(id)
    const node = el('button', `cat${extraClass}${off ? ' cat--off' : ''}`)
    node.type = 'button'
    node.setAttribute('aria-pressed', String(!off))
    node.title = off ? `Показати «${name}»` : `Сховати «${name}»`
    node.addEventListener('click', () => onToggle(id))

    append(
      node,
      el('span', 'cat__name', undefined, name),
      el('span', 'cat__count', undefined, String(count)),
    )
    return node
  }

  for (const category of categories) {
    append(bar, chip(category.id, category.name, counts[category.id] ?? 0))
  }

  // A real toggle rather than the plain count this used to be. It matters most right
  // after the migration, when nothing is categorised yet and this is the only way to
  // see what the categorised part of the week looks like on its own.
  if (uncategorised > 0) {
    append(bar, chip(UNCATEGORISED, 'Без категорії', uncategorised, ' cat--none'))
  }

  // Last, and only while something is hidden: it is a reset, not a filter.
  if (hidden.size > 0) {
    const all = el('button', 'cat cat--all', undefined, 'Усі')
    all.type = 'button'
    all.title = 'Показати всі категорії'
    all.addEventListener('click', onShowAll)
    append(bar, all)
  }

  return bar
}
