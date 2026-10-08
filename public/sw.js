// Kurinji service worker: makes the game installable and keeps heavy media
// (music, voices, effects, art, fonts) on the device after the first play.
// Code and pages are always fetched fresh first, so updates arrive normally.
const MEDIA = 'kurinji-media-v1', SHELL = 'kurinji-shell-v1'
const MEDIA_RE = /\/(audio|voice|sfx|art|fonts|icons)\//

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (![MEDIA, SHELL].includes(k)) await caches.delete(k)
  await self.clients.claim()
})()))

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin || req.headers.has('range')) return
  if (MEDIA_RE.test(new URL(req.url).pathname)) {
    // media never changes under the same name: cache first
    e.respondWith(caches.open(MEDIA).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok && r.status === 200) c.put(req, r.clone()); return r })))
    return
  }
  // everything else: network first, cached copy when offline
  e.respondWith(fetch(req).then(r => { if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(req, copy)) } return r }).catch(() => caches.match(req).then(r => r || caches.match('./'))))
})
