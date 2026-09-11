import { append, el } from './dom.js'
import { ICON, actionButton } from './buttons.js'
import { RELEASED, VERSION } from '../version.js'

/*
 * About: which version you are running, and how to get a newer one.
 *
 * The upgrade instructions are here rather than only in docs/DEPLOY.md because that
 * file is not published — and the moment you need them is the moment you are looking at
 * a stale app on a phone, with no way to read a document that lives on a laptop.
 *
 * Kept in step with the "How an installed app picks up a new version" section of
 * DEPLOY.md; if that changes, change this too.
 */

const PLATFORMS = [
  ['macOS · Safari', '⌘R'],
  ['macOS · Chrome', '⌘R, або ⋮ → «Перезавантажити»'],
  ['Android · Chrome', '⋮ → «Перезавантажити»'],
  ['iPad · Safari', 'кнопки оновлення немає: закрийте застосунок у перемикачі та відкрийте знову'],
]

/**
 * @param {{ onClose?: () => void }} props
 * @returns {HTMLDialogElement}
 */
export function aboutPanel({ onClose } = {}) {
  const dialog = /** @type {HTMLDialogElement} */ (el('dialog', 'sheet'))
  const body = el('div', 'sheet__form')

  append(body, el('h2', 'sheet__heading', undefined, 'Про застосунок'))

  // --- version -------------------------------------------------------------
  const version = el('div', 'about__version')
  append(
    version,
    el('span', 'about__number', undefined, `Версія ${VERSION}`),
    el('span', 'about__date', undefined, `(${RELEASED})`),
  )
  append(body, version)

  // --- how to upgrade ------------------------------------------------------
  append(body, el('h3', 'about__heading', undefined, 'Як оновити'))
  append(
    body,
    el(
      'p',
      'sheet__hint',
      undefined,
      'Зазвичай нічого робити не треба: застосунок сам помічає нову версію ' +
        'і перезавантажується. Якщо здається, що змін немає — відкрийте його ще раз, ' +
        'нові файли підвантажуються у фоні й застосовуються з другого разу.',
    ),
  )

  const list = el('dl', 'about__platforms')
  for (const [platform, how] of PLATFORMS) {
    append(
      list,
      el('dt', undefined, undefined, platform),
      el('dd', undefined, undefined, how),
    )
  }
  append(body, list)

  append(
    body,
    el(
      'p',
      'sheet__hint',
      undefined,
      'Якщо застосунок застряг на старій версії — відкрийте його адресу в браузері, ' +
        'додавши ?reset у кінець. Це прибере кеш і перезавантажить усе з нуля.',
    ),
  )

  append(
    body,
    append(
      el('div', 'sheet__actions'),
      actionButton({ icon: ICON.close, label: 'Закрити', onClick: () => dialog.close() }),
    ),
  )

  dialog.addEventListener('close', () => onClose?.())
  append(dialog, body)
  return dialog
}
