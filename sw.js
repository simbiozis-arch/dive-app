const CACHE_NAME = 'dive-v2';
const AUDIO_CACHE = 'dive-audio-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

const AUDIO_ASSETS = [
  '/audio/bookend_done.mp3',
  '/audio/bookend_ready.mp3',
  '/audio/bookend_sit.mp3',
  '/audio/bookend_sleep.mp3',
  '/audio/cue_breathe_in.mp3',
  '/audio/cue_breathe_out.mp3',
  '/audio/cue_hold.mp3',
  '/audio/cue_little_more.mp3',
  '/audio/cue_pause.mp3',
  '/audio/dive_intro_ambient.mp3',
  '/audio/dive_underwater.mp3',
  '/audio/ec_breathe_in.mp3',
  '/audio/ec_breathe_out.mp3',
  '/audio/ec_hold.mp3',
  '/audio/ec_more.mp3',
  '/audio/intro_box.mp3',
  '/audio/intro_cyclic_sigh.mp3',
  '/audio/intro_diaphragmatic.mp3',
  '/audio/intro_extended_exhale.mp3',
  '/audio/intro_segmented.mp3',
  '/audio/intro_tidal.mp3',
  '/audio/intro_ujjayi.mp3',
  '/audio/scan_full.mp3',
  '/audio/scan_short.mp3',
  '/audio/scan_sleep.mp3',
  '/audio/vis_ocean_calm.mp3',
  '/audio/vis_ocean_focus.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)),
      caches.open(AUDIO_CACHE).then(cache => cache.addAll(AUDIO_ASSETS)),
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== AUDIO_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip Supabase/PostHog/analytics — always network
  if (url.hostname.includes('supabase') || url.hostname.includes('posthog')) return;

  // Audio files: cache-first (pre-cached + runtime cached)
  if (url.pathname.startsWith('/audio/')) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  // CDN resources: cache-first
  if (
    url.hostname === 'unpkg.com' ||
    url.hostname === 'cdn.tailwindcss.com' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // App pages: network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
