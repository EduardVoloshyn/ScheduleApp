import { DAY_NAMES } from '../layout/layout.js'
import { gridlines, minutesAt, ratio, snapMinutes } from '../layout/index.js'
import { formatTime } from '../layout/time.js'
import { MIN_DURATION } from '../model/schedule.js'
import { append, el } from './dom.js'
import { eventBlock } from './event-block.js'

/** How far the pointer must travel before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD_PX = 4

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
 *           dragId?: string | null,
 *           onCreate?: (slot: { day: number, startMin: number }) => void,
 *           onOpen?: (id: string) => void,
 *           onDrag?: (draft: Object) => void,
 *           onDragEnd?: (draft: Object) => void }} props
 * @returns {HTMLElement}
 */
export function scheduleGrid(props) {
  const { layout, days, today, nowMin, showHeader = true, editing = false, dragId = null } = props
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

    for (const placed of layout.days[day]) {
      append(column, eventBlock(placed, { editing, dragging: placed.event.id === dragId }))
    }

    append(grid, column)
  }

  if (editing) attachEditing(grid, columns, axis, props)

  return grid
}

/**
 * Pointer handling for create, move and resize.
 *
 * One pointerdown handler on the grid rather than per-block listeners: the tree is
 * rebuilt on every state change, so per-node handlers would be re-bound constantly.
 */
function attachEditing(grid, columns, axis, { layout, onCreate, onOpen, onDrag, onDragEnd }) {
  /** Maps a pointer position to a snapped {day, minutes}. */
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

  const findPlaced = (id) => {
    for (const key of Object.keys(layout.days)) {
      const hit = layout.days[key].find((p) => p.event.id === id)
      if (hit) return hit
    }
    return null
  }

  grid.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return

    const blockNode = e.target.closest ? e.target.closest('.event') : null
    const isGrip = e.target.dataset && e.target.dataset.grip === 'resize'
    const origin = slotAt(e.clientX, e.clientY)

    // --- empty space: create on release, so a stray drag does not spawn events ----
    if (!blockNode) {
      const startX = e.clientX
      const startY = e.clientY
      const onUp = (up) => {
        grid.removeEventListener('pointerup', onUp)
        if (Math.hypot(up.clientX - startX, up.clientY - startY) <= DRAG_THRESHOLD_PX) {
          // slotAt speaks `minutes`; the onCreate contract is `startMin`. Passing
          // `origin` straight through silently produced NaN start times.
          onCreate?.({ day: origin.day, startMin: origin.minutes })
        }
      }
      grid.addEventListener('pointerup', onUp)
      return
    }

    const id = blockNode.dataset.eventId
    const placed = findPlaced(id)
    if (!placed) return

    const mode = isGrip ? 'resize' : 'move'
    // Grabbing the middle of a block must not teleport its top to the pointer.
    const grabOffset = origin.minutes - placed.startMin

    let moved = false
    if (grid.setPointerCapture) grid.setPointerCapture(e.pointerId)

    const draftAt = (clientX, clientY) => {
      const at = slotAt(clientX, clientY)
      if (mode === 'resize') {
        return {
          id,
          mode,
          day: placed.event.day,
          startMin: placed.startMin,
          durationMin: Math.max(MIN_DURATION, at.minutes - placed.startMin),
        }
      }
      return {
        id,
        mode,
        day: at.day,
        startMin: at.minutes - grabOffset,
        durationMin: placed.endMin - placed.startMin,
      }
    }

    let frame = 0
    const onMove = (move) => {
      if (
        !moved &&
        Math.hypot(move.clientX - e.clientX, move.clientY - e.clientY) <= DRAG_THRESHOLD_PX
      ) {
        return
      }
      moved = true
      // Throttle to the frame: a re-render per pointermove would be wasted work.
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        onDrag?.(draftAt(move.clientX, move.clientY))
      })
    }

    const onUp = (up) => {
      grid.removeEventListener('pointermove', onMove)
      grid.removeEventListener('pointerup', onUp)
      grid.removeEventListener('pointercancel', onUp)
      if (frame) cancelAnimationFrame(frame)
      if (moved) onDragEnd?.(draftAt(up.clientX, up.clientY))
      else onOpen?.(id)
    }

    grid.addEventListener('pointermove', onMove)
    grid.addEventListener('pointerup', onUp)
    grid.addEventListener('pointercancel', onUp)
  })
}
