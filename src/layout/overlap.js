import { overlaps } from './time.js'

/**
 * @typedef {Object} ColumnSlot
 * @property {number} column   0-based column within its overlap cluster.
 * @property {number} columns  How many columns that cluster needs.
 */

/**
 * Assigns overlapping intervals to side-by-side columns.
 *
 * Two steps:
 *   1. Group into clusters of transitively overlapping intervals. A cluster is the unit
 *      that shares horizontal space — if A overlaps B and B overlaps C, all three split
 *      the width even when A and C never touch. Otherwise blocks in one visual stack
 *      would come out different widths.
 *   2. Within a cluster, greedily place each interval in the first column already free
 *      at its start, opening a new column only when none is.
 *
 * Results come back in the caller's original order.
 *
 * @param {ReadonlyArray<import('./time.js').Interval>} intervals
 * @returns {ColumnSlot[]}
 */
export function assignColumns(intervals) {
  const slots = intervals.map(() => ({ column: 0, columns: 1 }))
  if (intervals.length === 0) return slots

  // Longest-first among equal starts, so the dominant block takes the left column.
  const order = intervals
    .map((interval, index) => ({ interval, index }))
    .sort(
      (a, b) =>
        a.interval.startMin - b.interval.startMin ||
        b.interval.endMin - a.interval.endMin ||
        a.index - b.index,
    )

  let cluster = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (cluster.length === 0) return

    // columnEnds[c] is when column c becomes free.
    const columnEnds = []

    for (const item of cluster) {
      let target = columnEnds.findIndex((end) => end <= item.interval.startMin)
      if (target === -1) {
        target = columnEnds.length
        columnEnds.push(item.interval.endMin)
      } else {
        columnEnds[target] = item.interval.endMin
      }
      slots[item.index].column = target
    }

    for (const item of cluster) slots[item.index].columns = columnEnds.length
    cluster = []
    clusterEnd = -Infinity
  }

  for (const item of order) {
    // A cluster breaks only when an interval starts at or after everything before it
    // has ended. `>=` not `>`: touching events are adjacent, not overlapping.
    if (cluster.length > 0 && item.interval.startMin >= clusterEnd) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.interval.endMin)
  }
  flush()

  return slots
}

/**
 * Whether any pair in the list collides. Useful for tests and for flagging in the UI.
 * @param {ReadonlyArray<import('./time.js').Interval>} intervals
 * @returns {boolean}
 */
export function hasOverlap(intervals) {
  const sorted = [...intervals].sort((a, b) => a.startMin - b.startMin)
  for (let i = 1; i < sorted.length; i++) {
    if (overlaps(sorted[i - 1], sorted[i])) return true
  }
  return false
}
