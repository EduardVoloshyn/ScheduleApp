/*
 * Service worker. Hand-written, because there is no bundler to generate one (ADR-0006).
 *
 * Strategy: stale-while-revalidate over the app shell. The cached copy is served
 * immediately — so the app opens offline and instantly — while a fresh copy is fetched
 * in the background for next time.
 *
 * The API is deliberately NOT cached. Schedule data lives in localStorage, which the app
 * manages itself; caching the Apps Script responses here would create a second, stale
 * copy with its own invalidation problem.
 *
 * BUMP `VERSION` whenever any precached file changes, or clients keep the old copy.
 */

const VERSION = 'v29'
const CACHE = `scheduleapp-${VERSION}`

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/app.js',
  './src/version.js',
  './src/design/tokens.css',
  './src/design/app.css',
  './src/fixtures/seed.js',
  './src/layout/index.js',
  './src/layout/time.js',
  './src/layout/axis.js',
  './src/layout/overlap.js',
  './src/layout/layout.js',
  './src/model/schedule.js',
  './src/model/icons.js',
  './src/model/categories.js',
  './src/sync/api.js',
  './src/sync/storage.js',
  './src/sync/reset.js',
  './src/sync/single-flight.js',
  './src/ui/dom.js',
  './src/ui/grid.js',
  './src/ui/week-view.js',
  './src/ui/day-view.js',
  './src/ui/event-block.js',
  './src/ui/setup-card.js',
  './src/ui/edit-sheet.js',
  './src/ui/template-sheet.js',
  './src/ui/fields.js',
  './src/ui/buttons.js',
  './src/ui/category-bar.js',
  './src/ui/about-panel.js',
  './src/ui/templates-panel.js',
  './src/ui/settings-panel.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one 404 cannot fail the whole install and leave the app
      // permanently uninstallable.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Cross-origin means the Apps Script API. Never intercept it.
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached || caches.match('./index.html'))

      // Cached first when we have it: opening must never wait on the network.
      return cached || network
    }),
  )
})
