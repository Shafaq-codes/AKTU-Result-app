const CACHE_NAME = 'aktu-offline-cache-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/name-search.html',
  '/result.html',
  '/style.css',
  '/app.js',
  '/name-search.js',
  '/result.js',
  '/security.js',
  '/students-data.js',
  'https://erp.aktu.ac.in/Images/Site/FileHandler-new.png',
  'https://oneview.aktu.ac.in/Images/Site/AKTUBanner.jpg'
];

// Install Event: Cache all core UI pages and scripts
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => {}))
      );
    })
  );
});

// Activate Event: Clean up older caches immediately
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
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-first for local static pages/scripts, ignoreSearch for query strings
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass API requests to network
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ success: false, error: 'Offline - Network unavailable' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Static Assets & UI Navigation: Match cache ignoring query parameters
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // Background refresh when online
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for HTML navigations when offline
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          if (url.pathname.includes('result')) {
            return caches.match('/result.html', { ignoreSearch: true });
          }
          if (url.pathname.includes('name-search')) {
            return caches.match('/name-search.html', { ignoreSearch: true });
          }
          return caches.match('/index.html', { ignoreSearch: true });
        }
      });
    })
  );
});