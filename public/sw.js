const CACHE_NAME = 'kiosk-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/kiosk.html',
  '/kiosk-manifest.json',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Do NOT skipWaiting — let the AutoUpdater handle controlled updates.
  // Aggressive skipWaiting can cause mid-session message channel errors.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle http(s) GET requests; skip API calls, chrome-extension, etc.
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    (url.protocol !== 'http:' && url.protocol !== 'https:')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Ignore network errors offline */});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // If offline and request is navigation, return cached kiosk.html
        if (event.request.mode === 'navigate') {
          return caches.match('/kiosk.html');
        }
      });
    })
  );
});
