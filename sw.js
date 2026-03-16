const CACHE_NAME = 'nagoya-v1';
const BASE = '/-nagoya-pwa';
const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.json',
  BASE + '/icon-192.png',
  BASE + '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=DM+Mono:wght@300;400;500&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

const TILE_CACHE = 'nagoya-tiles-v1';
const MAX_TILES = 200;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== TILE_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('cartocdn') || url.hostname.includes('openstreetmap')) {
    e.respondWith(tileStrategy(e.request)); return;
  }
  if (url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic') || url.hostname.includes('unpkg.com')) {
    e.respondWith(cacheFirst(e.request, CACHE_NAME)); return;
  }
  e.respondWith(networkFirst(e.request));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    return response;
  } catch { return new Response('Offline', { status: 503 }); }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function tileStrategy(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const keys = await cache.keys();
    if (keys.length >= MAX_TILES) await cache.delete(keys[0]);
    cache.put(request, response.clone());
    return response;
  } catch { return new Response('', { status: 503 }); }
}
