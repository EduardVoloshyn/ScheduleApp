import { DAY_NAMES } from '../layout/layout.js'
import { clusterPlaced, gridlines, minutesAt, ratio, snapMinutes } from '../layout/index.js'
import { formatTime } from '../layout/time.js'
import { append, el } from './dom.js'
import { eventBlock } from './event-block.js'

/**
 * The shared schedule grid: a gutter of hour labels plus one absolutely-positioned
 * column per day, which the layout engine's 0–1 fractions map straight onto.
 *
 * Week and day views are the same renderer with a different `days` list, so the pointer
 * handling — the finickiest code in the UI — exists exactly once.
 *
 * @param {{ layout: import('../layout/layout.js').WeekLayout,
 *           days: number[],
 *           today: number,
 *           nowMin: number | null,
 *           showHeader?: boolean,
 *           editing?: boolean,
 *           onCreate?: (slot: { day: number, startMin: number }) => void,
 *           onOpen?: (id: string) => void }} props
 * @returns {HTMLElement}
 */
export function scheduleGrid(props) {
  const { layout, days, today, nowMin, showHeader = true, editing = false } = props
  const { axis } = layout
  const marks = gridlines(axis)

  // Height comes from real elapsed time — that is what makes the scale proportional.
  const bodyHeight = `calc(${axis.spanMin / 60} * var(--px-per-hour))`
  const showNow = nowMin !== null && nowMin >= axis.startMin && nowMin <= axis.endMin

  const grid = el('div', `week${editing ? ' week--editing' : ''}`, {
    'grid-template-columns': `var(--gutter) repeat(${days.length}, minmax(5.5rem, 1fr))`,
  })

  if (showHeader) {
    append(grid, el('div', 'week__head'))
    for (const day of days) {
      append(
        grid,
        el(
          'div',
          `week__head week__day-name${day === today ? ' week__day-name--today' : ''}`,
          undefined,
          DAY_NAMES[day],
        ),
      )
    }
  }

  const gutter = el('div', 'axis', { height: bodyHeight })
  for (const m of marks) {
    append(gutter, el('div', 'axis__label', { top: `${ratio(axis, m) * 100}%` }, formatTime(m)))
  }
  append(grid, gutter)

  /** @type {{ day: number, node: HTMLElement }[]} */
  const columns = []

  for (const day of days) {
    const column = el('div', `day${day === today ? ' day--today' : ''}`, { height: bodyHeight })
    columns.push({ day, node: column })

    for (const m of marks) {
      append(column, el('div', 'day__line', { top: `${ratio(axis, m) * 100}%` }))
    }

    if (showNow && day === today) {
      append(column, el('div', 'day__now', { top: `${ratio(axis, nowMin) * 100}%` }))
    }

    for (const cluster of clusterPlaced(layout.days[day], axis)) {
      append(column, cluster.items.length === 1
        ? eventBlock(cluster.items[0], { editing })
        : clusterList(cluster, editing))
    }

    append(grid, column)
  }

  if (editing) attachEditing(grid, columns, axis, props)

  return grid
}

/**
 * Overlapping events, drawn as a stacked list across the span they share.
 *
 * Every row is full width, so a name and its time always fit — which side-by-side
 * columns could not manage once three events collided. What it costs: inside a cluster
 * the rows are equal height rather than proportional to duration. The cluster's own top
 * and bottom still mark real times, so the shape of the week is unchanged.
 *
 * A `min-height` in CSS keeps the rows legible when the shared span is short; the group
 * then extends a little past its true end, which is the deliberate trade — being
 * readable matters more here than the last few pixels of precision.
 *
 * @param {import('../layout/layout.js').Cluster} cluster
 * @param {boolean} editing
 */
function clusterList(cluster, editing) {
  const box = el('div', 'cluster', {
    top: `${cluster.top * 100}%`,
    height: `${cluster.height * 100}%`,
    '--cluster-rows': String(cluster.items.length),
  })

  for (const item of cluster.items) {
    append(box, eventBlock(item, { editing, row: true }))
  }
  return box
}

/**
 * Tap handling: a tap on empty space proposes a new event, a tap on a block opens it.
 *
 * A plain `click` listener rather than pointerdown/move/up. Drag and resize used to
 * live here and were removed in 1.2 — they misfired on a tablet, where a press that
 * drifts a few pixels is the norm rather than the exception, and they forced
 * `touch-action: none` onto the grid, which broke ordinary scrolling while editing.
 *
 * One listener on the grid rather than per-block: the tree is rebuilt on every state
 * change, so per-node handlers would be re-bound constantly.
 */
function attachEditing(grid, columns, axis, { onCreate, onOpen }) {
  /** Maps a tap position to a snapped {day, minutes}. */
  const slotAt = (clientX, clientY) => {
    let chosen = columns[0]
    let bestDistance = Infinity
    for (const candidate of columns) {
      const rect = candidate.node.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) {
        chosen = candidate
        break
      }
      const distance = clientX < rect.left ? rect.left - clientX : clientX - rect.right
      if (distance < bestDistance) {
        bestDistance = distance
        chosen = candidate
      }
    }
    const rect = chosen.node.getBoundingClientRect()
    const fraction = rect.height > 0 ? (clientY - rect.top) / rect.height : 0
    return { day: chosen.day, minutes: snapMinutes(minutesAt(axis, fraction)) }
  }

  grid.addEventListener('click', (e) => {
    const block = e.target.closest ? e.target.closest('.event') : null

    if (block) {
      onOpen?.(block.dataset.eventId)
      return
    }

    // slotAt speaks `minutes`; the onCreate contract is `startMin`. Passing the
    // internal shape straight through once produced NaN start times.
    const origin = slotAt(e.clientX, e.clientY)
    onCreate?.({ day: origin.day, startMin: origin.minutes })
  })
}
