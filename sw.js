const CACHE_NAME = 'nagoya-v1';
const ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=DM+Mono:wght@300;400;500&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// 地圖 tile 快取策略：cache-first，最多存 200 張
const TILE_CACHE = 'nagoya-tiles-v1';
const MAX_TILES = 200;

// ── Install：預先快取所有靜態資源 ──────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(() => console.warn('Failed to cache:', url)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate：清除舊快取 ───────────────────────────
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

// ── Fetch：攔截請求 ────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 地圖 tile：cache-first + 限制數量
  if (url.hostname.includes('cartocdn') || url.hostname.includes('openstreetmap')) {
    e.respondWith(tileStrategy(e.request));
    return;
  }

  // 字體 / Leaflet CDN：cache-first
  if (url.hostname.includes('fonts.googleapis') ||
      url.hostname.includes('fonts.gstatic') ||
      url.hostname.includes('unpkg.com')) {
    e.respondWith(cacheFirst(e.request, CACHE_NAME));
    return;
  }

  // 主要頁面：network-first（確保更新），fallback 到 cache
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
  } catch {
    return new Response('Offline', { status: 503 });
  }
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
    // 限制 tile 數量，超過就刪舊的
    const keys = await cache.keys();
    if (keys.length >= MAX_TILES) {
      await cache.delete(keys[0]);
    }
    cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}
