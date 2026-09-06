import { append, el } from './dom.js'

/**
 * The category filter, in the title bar.
 *
 * One toggle per category, plus a count. Hidden categories read as switched off; the
 * state is device-local, because what you are looking at is not something the other
 * devices should inherit.
 *
 * Renders nothing at all when the Sheet has no categories, so the bar does not occupy
 * space until the owner has filled the tab in.
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

  for (const category of categories) {
    const off = hidden.has(category.id)
    const count = counts[category.id] ?? 0

    const chip = el('button', `cat${off ? ' cat--off' : ''}`)
    chip.type = 'button'
    chip.setAttribute('aria-pressed', String(!off))
    chip.title = off ? `Показати «${category.name}»` : `Сховати «${category.name}»`
    chip.addEventListener('click', () => onToggle(category.id))

    append(
      chip,
      el('span', 'cat__name', undefined, category.name),
      el('span', 'cat__count', undefined, String(count)),
    )
    append(bar, chip)
  }

  // Only meaningful while something is hidden, so it stays out of the way otherwise.
  if (hidden.size > 0) {
    const all = el('button', 'cat cat--all', undefined, 'Усі')
    all.type = 'button'
    all.title = 'Показати всі категорії'
    all.addEventListener('click', onShowAll)
    append(bar, all)
  }

  // Worth surfacing: right after the migration everything is uncategorised, and these
  // events stay visible whatever the toggles say. Without this the counts look wrong.
  if (uncategorised > 0) {
    append(bar, el('span', 'cats__note', undefined, `+${uncategorised} без категорії`))
  }

  return bar
}
