/*
 * Categories.
 *
 * Maintained by hand in the Sheet's `categories` tab (id, name) — the app reads them and
 * never writes them, so a save can never clobber the owner's list. There is deliberately
 * no editing UI, for the same reason as the emoji list: a spreadsheet tab is already a
 * better editor than anything worth building for four rows.
 *
 * This supersedes part of ADR-0002, which rejected categories and made colour carry all
 * grouping meaning. Colour is unaffected and still per event; a category is an
 * independent axis used for filtering.
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 */

/**
 * Normalises what the API returned. Rows missing an id are dropped — they cannot be
 * referenced, so they would produce a toggle that filters nothing.
 *
 * @param {any[]} rows
 * @returns {Category[]}
 */
export function parseCategories(rows) {
  const seen = new Set()
  const out = []

  for (const row of rows ?? []) {
    const id = String(row?.id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name: String(row?.name ?? '').trim() || id })
  }
  return out
}

/**
 * Which categories are hidden, as a Set of ids.
 *
 * Stored as the *hidden* list rather than the visible one, so a category added to the
 * Sheet later shows up by default instead of being invisible until someone finds the
 * toggle.
 *
 * @param {string[] | undefined} hidden
 * @returns {Set<string>}
 */
export function hiddenSet(hidden) {
  return new Set(Array.isArray(hidden) ? hidden.map(String) : [])
}

/**
 * Applies the filter.
 *
 * An event whose category is empty — or names a category no longer in the tab — is
 * always shown. Hiding it would make events disappear with no toggle able to bring them
 * back, which is indistinguishable from data loss. That case is normal right after the
 * migration, when nothing is categorised yet.
 *
 * @param {ReadonlyArray<import('../layout/time.js').ScheduleEvent>} events
 * @param {Set<string>} hidden
 * @param {ReadonlyArray<Category>} categories
 */
export function visibleEvents(events, hidden, categories) {
  if (hidden.size === 0) return events
  const known = new Set(categories.map((c) => c.id))

  return events.filter((event) => {
    const category = String(event.category ?? '').trim()
    if (!category || !known.has(category)) return true
    return !hidden.has(category)
  })
}

/**
 * How many events each category holds, plus how many carry none. Drives the counts on
 * the toggles and tells the owner whether a category is actually in use.
 *
 * @param {ReadonlyArray<import('../layout/time.js').ScheduleEvent>} events
 * @param {ReadonlyArray<Category>} categories
 */
export function categoryCounts(events, categories) {
  const known = new Set(categories.map((c) => c.id))
  const counts = {}
  let uncategorised = 0

  for (const category of categories) counts[category.id] = 0

  for (const event of events) {
    const category = String(event.category ?? '').trim()
    if (category && known.has(category)) counts[category] += 1
    else uncategorised += 1
  }

  return { counts, uncategorised }
}

/** Toggling returns a new list, so callers can persist it without mutating state. */
export function toggleHidden(hidden, id) {
  const next = new Set(hidden)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return [...next]
}
