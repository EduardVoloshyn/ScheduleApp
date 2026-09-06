import { DAYS } from '../layout/layout.js'
import { scheduleGrid } from './grid.js'

/**
 * All seven days side by side. A thin wrapper: the grid and its pointer handling are
 * shared with the day view (`./grid.js`).
 *
 * @param {Object} props see `scheduleGrid`
 * @returns {HTMLElement}
 */
export function weekView(props) {
  return scheduleGrid({ ...props, days: [...DAYS] })
}
