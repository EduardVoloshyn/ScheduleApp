/*
 * localStorage, not IndexedDB. The whole schedule is a few KB, and synchronous reads
 * mean the first paint already has data — no loading state on open.
 *
 * Credentials live here and only here: never in the repo, never in the deployed files,
 * because a static bundle is readable by anyone who loads it (ADR-0004).
 */

const KEY_CREDS = 'scheduleapp.credentials'
const KEY_SNAPSHOT = 'scheduleapp.snapshot'
const KEY_PENDING = 'scheduleapp.pending'
const KEY_PREFS = 'scheduleapp.prefs'

/** @param {string} key */
function read(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    // Private browsing, or a corrupt value. Treat as absent rather than crashing.
    return null
  }
}

/** @param {string} key @param {unknown} value */
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or private mode — the app still works, it just won't remember */
  }
}

/**
 * @returns {{ deploymentId: string, secret: string } | null}
 *
 * A device set up before the id-only change has a full `url` stored. It is converted
 * here rather than anywhere else, so the rest of the app only ever sees an id.
 */
export function loadCredentials() {
  const c = read(KEY_CREDS)
  if (!c || !c.secret) return null

  if (c.deploymentId) return { deploymentId: String(c.deploymentId), secret: String(c.secret) }

  if (c.url) {
    const match = String(c.url).match(/\/macros\/s\/([^/\s?]+)/)
    if (match) {
      const migrated = { deploymentId: match[1], secret: String(c.secret) }
      write(KEY_CREDS, migrated)
      return migrated
    }
  }
  return null
}

/** @param {{ deploymentId: string, secret: string }} c */
export function saveCredentials(c) {
  write(KEY_CREDS, {
    deploymentId: String(c.deploymentId).trim(),
    secret: String(c.secret).trim(),
  })
}

export function clearCredentials() {
  try {
    localStorage.removeItem(KEY_CREDS)
  } catch {
    /* ignore */
  }
}

/** @returns {{ events: any[], templates: any[], settings: Object, hash: string, fetchedAt: number } | null} */
export function loadSnapshot() {
  const s = read(KEY_SNAPSHOT)
  return s && Array.isArray(s.events) ? s : null
}

export function saveSnapshot(s) {
  write(KEY_SNAPSHOT, s)
}

/*
 * A write takes ~4 seconds against Apps Script (ADR-0005) — ample time to close the
 * tab mid-save. The pending payload is therefore persisted before the request goes out
 * and cleared only once the server confirms, so a save survives the app being closed.
 */

export function loadPending() {
  return read(KEY_PENDING)
}

export function savePending(payload) {
  write(KEY_PENDING, payload)
}

export function clearPending() {
  try {
    localStorage.removeItem(KEY_PENDING)
  } catch {
    /* ignore */
  }
}

/** Device-local preferences: editing flag, default duration override, theme. */
export function loadPrefs() {
  return read(KEY_PREFS) || {}
}

export function savePrefs(prefs) {
  write(KEY_PREFS, prefs)
}
