/* Service worker — precache the app shell + deck for offline, then serve
   network-first (so new code loads when online, cache when offline). The
   Anthropic API (Phase 2) is always bypassed — never cached. */

const CACHE = 'konus-v4';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'css/theme.css',
  'css/layout.css',
  'css/cards.css',
  'css/chat.css',
  'data/deck.json',
  'js/main.mjs',
  'js/app.mjs',
  'js/lib/reactive.mjs',
  'js/lib/day.mjs',
  'js/store/db.mjs',
  'js/store/settings.mjs',
  'js/srs/scheduler.mjs',
  'js/srs/queue.mjs',
  'js/deck/loader.mjs',
  'js/deck/schema.mjs',
  'js/audio/tts.mjs',
  'js/audio/asr.mjs',
  'js/ai/sse.mjs',
  'js/ai/client.mjs',
  'js/ai/vocab.mjs',
  'js/ai/prompts.mjs',
  'js/ai/pricing.mjs',
  'js/ai/helpers.mjs',
  'js/views/onboarding.mjs',
  'js/views/dashboard.mjs',
  'js/views/learn.mjs',
  'js/views/review.mjs',
  'js/views/settings.mjs',
  'js/views/chat.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GETs; let everything else (e.g. the Anthropic API)
  // go straight to the network, untouched and uncached.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('index.html'))),
  );
});
