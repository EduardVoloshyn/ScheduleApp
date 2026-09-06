import { formatTime } from '../layout/time.js'
import { append, el } from './dom.js'

const PALETTE = new Set(['slate', 'blue', 'red', 'amber', 'green', 'violet', 'teal', 'rose'])

/** Roughly how tall a block must be before extra lines earn their place. */
const SHOW_TIME_ABOVE_MIN = 40
const SHOW_NOTE_ABOVE_MIN = 75

/**
 * @param {import('../layout/layout.js').PlacedEvent} placed
 * @param {{ editing?: boolean, dragging?: boolean }} [options]
 * @returns {HTMLElement}
 */
export function eventBlock(placed, options = {}) {
  const { event } = placed
  const duration = placed.endMin - placed.startMin

  // Fall back rather than trusting an unknown token — a hand-typed colour in the Sheet
  // must not produce an unstyled block.
  const colour = PALETTE.has(event.colour) ? event.colour : 'slate'

  // A gap between side-by-side blocks, taken from the right so left edges stay aligned.
  const inset = placed.columns > 1 ? 2 : 0

  const classes = [
    'event',
    `event--${colour}`,
    options.editing ? 'event--editable' : '',
    options.dragging ? 'event--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const node = el('div', classes, {
    top: `${placed.top * 100}%`,
    height: `${placed.height * 100}%`,
    left: `calc(${placed.left * 100}% + 1px)`,
    width: `calc(${placed.width * 100}% - ${inset + 2}px)`,
  })
  node.dataset.eventId = event.id
  node.title = `${formatTime(placed.startMin)}–${formatTime(placed.endMin)}  ${event.title}`

  // Icon then a single space then the title, as one run of inline text — so the space
  // is a real space, not a flex gap that would vanish or drift with the layout.
  const heading = el('div', 'event__heading')
  if (event.icon) {
    append(heading, el('span', 'event__icon', undefined, event.icon))
    heading.appendChild(document.createTextNode(' '))
  }
  append(heading, el('span', 'event__title', undefined, event.title))

  append(
    node,
    heading,
    duration >= SHOW_TIME_ABOVE_MIN &&
      el('div', 'event__time', undefined, `${formatTime(placed.startMin)}–${formatTime(placed.endMin)}`),
    event.note &&
      duration >= SHOW_NOTE_ABOVE_MIN &&
      el('div', 'event__note', undefined, event.note),
  )

  // The resize grip only exists while editing, so a read-only device has no dead zones.
  if (options.editing) {
    const grip = el('div', 'event__grip')
    grip.dataset.grip = 'resize'
    append(node, grip)
  }

  return node
}
