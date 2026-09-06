import { scheduleGrid } from './grid.js'

/**
 * One day, drawn against the same axis as the week so switching days never rescales —
 * the shape of a day stays learnable, and a free afternoon still reads as real space.
 *
 * The day name lives in the navigation strip above, so the grid header is suppressed.
 *
 * @param {Object} props see `scheduleGrid`; `day` selects the column
 * @returns {HTMLElement}
 */
export function dayView({ day, ...props }) {
  return scheduleGrid({ ...props, days: [day], showHeader: false })
}
