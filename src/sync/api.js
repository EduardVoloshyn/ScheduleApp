/**
 * Talks to the Apps Script Web App (apps-script/README.md).
 *
 * Two things about this endpoint that are easy to get wrong:
 *
 *  1. **Every response is HTTP 200.** Apps Script cannot set a meaningful status, so
 *     failures arrive as `{ ok: false, code }` in the body. Checking `res.ok` proves
 *     nothing — we check the body.
 *  2. **Every value comes back as a string.** The Sheet stringifies everything, so
 *     `day` arrives as `"1"` and `duration_min` as `"60"`. The layout engine needs real
 *     numbers, so the coercion below is mandatory, not tidying.
 *
 * Latency is ~2.6s for a read (ADR-0005), which is why nothing waits on this: the
 * cached copy is already on screen.
 */

/** Every Apps Script Web App lives under this prefix; only the id varies. */
const EXEC_PREFIX = 'https://script.google.com/macros/s/'
const EXEC_SUFFIX = '/exec'

/**
 * Builds the endpoint from a deployment id.
 *
 * The id is the only part the owner has to supply — the rest is fixed by Google, and
 * asking for the whole URL invited the two mistakes that actually happen: pasting the
 * `/dev` URL, which always demands a login, or dropping the `/exec` suffix.
 *
 * @param {{ deploymentId?: string, url?: string }} creds
 * @returns {string}
 */
export function execUrl(creds) {
  const id = String(creds?.deploymentId ?? '').trim()
  if (id) return `${EXEC_PREFIX}${id}${EXEC_SUFFIX}`
  // Credentials stored before the id-only change still hold a full URL.
  return String(creds?.url ?? '').trim()
}

/**
 * Accepts either a bare id or a pasted URL, and returns the id.
 *
 * Pasting the whole URL is the obvious thing to do out of habit, and silently failing
 * on it would be a poor first run.
 *
 * @param {string} input
 * @returns {string}
 */
export function parseDeploymentId(input) {
  const text = String(input ?? '').trim()
  if (!text) return ''

  const match = text.match(/\/macros\/s\/([^/\s?]+)/)
  if (match) return match[1]

  // Not a URL: take it as an id, minus anything that clearly is not part of one.
  return text.replace(/^\/+|\/+$/g, '').replace(/\/(exec|dev)$/, '')
}

export class ApiError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/**
 * @param {{ url: string, secret: string }} creds
 * @param {AbortSignal} [signal]
 */
export async function fetchSchedule(creds, signal) {
  const url = `${execUrl(creds)}?action=schedule&secret=${encodeURIComponent(creds.secret)}`

  let res
  try {
    res = await fetch(url, { method: 'GET', redirect: 'follow', signal })
  } catch {
    // A CORS rejection is indistinguishable from being offline: both surface as an
    // opaque TypeError with no status.
    throw new ApiError(
      'Немає зʼєднання. Перевірте адресу та доступ «Anyone» у розгортанні.',
      'network',
    )
  }

  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    // A dead or renamed deployment answers with Google's own HTML error page, which
    // is a different problem from a malformed response and deserves saying so.
    throw new ApiError(
      res.status === 404
        ? 'Розгортання не знайдено. Ймовірно, змінився Deployment ID — візьміть новий у Manage deployments.'
        : `Відповідь не JSON (HTTP ${res.status}). Схоже, ID розгортання неправильний.`,
      res.status === 404 ? 'not_found' : 'not_json',
    )
  }

  if (body.ok !== true) throw errorFor(body)

  return {
    events: (body.events || []).map(toEvent),
    templates: (body.templates || []).map(toTemplate),
    // Read-only: the owner maintains this tab by hand and the app never writes it.
    categories: body.categories || [],
    settings: body.settings || {},
    hash: body.hash || '',
    fetchedAt: Date.now(),
  }
}

/**
 * Turns an API failure into something that says what to do about it.
 *
 * `unauthorized` in particular used to surface as the bare word, which says nothing
 * about the one thing to check — and the secret and the script drift apart every time
 * the script is redeployed from the repo copy, where it is a placeholder.
 *
 * @param {{ ok?: boolean, code?: string, message?: string, errors?: string[] }} body
 */
function errorFor(body) {
  const code = body.code || 'unknown'

  if (code === 'unauthorized') {
    return new ApiError(
      'Секрет не збігається з тим, що в скрипті (SHARED_SECRET). ' +
        'Перевірте його в Apps Script і не забудьте опублікувати нову версію.',
      code,
    )
  }
  if (code === 'invalid') {
    return new ApiError(`Недійсні дані: ${(body.errors || []).join('; ')}`, code)
  }
  return new ApiError(body.message || `Помилка: ${code}`, code)
}

function toEvent(raw) {
  return {
    id: String(raw.id ?? ''),
    day: Number(raw.day),
    start: String(raw.start ?? ''),
    duration_min: Number(raw.duration_min),
    title: String(raw.title ?? ''),
    colour: String(raw.colour ?? 'slate'),
    icon: raw.icon ? String(raw.icon) : undefined,
    category: raw.category ? String(raw.category) : undefined,
    note: raw.note ? String(raw.note) : undefined,
  }
}

function toTemplate(raw) {
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    colour: String(raw.colour ?? 'slate'),
    icon: raw.icon ? String(raw.icon) : undefined,
    category: raw.category ? String(raw.category) : undefined,
    duration_min: Number(raw.duration_min),
  }
}

/**
 * Replaces the whole schedule. Sends the hash from the last read; the API rejects the
 * write if the Sheet has moved on since — which is what catches the owner editing the
 * Sheet by hand (ADR-0003).
 *
 * @param {{ url: string, secret: string }} creds
 * @param {{ hash: string, events: any[], templates: any[], settings: Object }} payload
 * @returns {Promise<{ hash: string, written: Object }>}
 */
export async function saveSchedule(creds, payload) {
  let res
  try {
    res = await fetch(execUrl(creds), {
      method: 'POST',
      // text/plain is required, not sloppiness: it is CORS-safelisted, so the browser
      // skips the preflight OPTIONS that Apps Script cannot answer. The body is JSON.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({
        secret: creds.secret,
        action: 'save',
        hash: payload.hash,
        events: payload.events,
        templates: payload.templates,
        settings: payload.settings,
      }),
    })
  } catch {
    throw new ApiError('Немає зʼєднання. Зміни збережено локально.', 'network')
  }

  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError(`Відповідь не JSON (HTTP ${res.status}).`, 'not_json')
  }

  if (body.ok !== true) {
    if (body.code === 'stale') {
      throw new ApiError('Таблицю змінено деінде. Оновіть і повторіть.', 'stale')
    }
    throw errorFor(body)
  }

  return { hash: body.hash, written: body.written }
}
