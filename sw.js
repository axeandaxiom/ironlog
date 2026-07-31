// Service worker: cache-first for the app shell so the gym's dead spot in the
// basement is a non-event. Bump CACHE when any file below changes.

const CACHE = 'ironlog-v23';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/util.js',
  './js/version.js',
  './js/store.js',
  './js/programs.js',
  './js/nutrition.js',
  './js/sensors.js',
  './js/movement.js',
  './js/data/exercises.js',
  './js/data/recipes.js',
  './js/views/train.js',
  './js/views/log.js',
  './js/views/lab.js',
  './js/views/health.js',
  './js/views/food.js',
  './js/views/more.js',
  './js/views/build.js',
  './js/views/rounds.js',
  './js/timer.js',
  './js/media.js',
  './js/views/attach.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing; a single 404 would leave the app uncached,
      // so each asset is added independently and failures are logged.
      .then((c) => Promise.all(ASSETS.map((url) =>
        c.add(url).catch((err) => console.warn('[sw] skipped', url, err.message)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // The test harness is a development artefact, not part of the app. Leaving
  // it out of the cache means edits show up on reload without having to clear
  // storage every time.
  if (/\/(tests|syntaxcheck)\.(html|js)$/.test(url.pathname)) return;

  // Network-first, cache as fallback.
  //
  // Cache-first would load marginally faster, but it also means a fixed bug
  // keeps running until the cache version is bumped — and a stale training
  // log that mis-states your working weight is worse than a slow one. The
  // network attempt is capped so a flaky gym connection falls back quickly
  // instead of hanging, and everything is precached on install, so with no
  // signal at all the app still opens fully.
  e.respondWith(
    Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 2500)),
    ])
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
