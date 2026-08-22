// dg-node's own service worker. Deliberately network-first, not cache-first: the legacy
// service worker this replaces (assets/common/history.html registered navigator.serviceWorker.
// register('/sw.js'), see /var/www/html/sw.js) cached a hardcoded file list forever under a
// cache name that was never bumped — any browser that visited while the legacy PHP site was
// live got permanently stuck on stale JS, invisible to every later fix (owner report:
// "isInstant doesn't work, every time" traced back to this). Cache-first is exactly the trap
// that caused that; this SW tries the network first and only serves a cached copy when the
// network genuinely fails (offline), caching opportunistically as it goes instead of a
// hand-maintained URL list that inevitably goes stale.
//
// Bump CACHE_NAME on any change that should invalidate old cached responses — activate()
// deletes every cache that doesn't match, which also cleans up the legacy 'pwa-fdg-v1' cache
// on browsers still carrying it.
const CACHE_NAME = 'dg-node-v1';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Only cache real, same-origin, successful responses — an opaque/cross-origin
                // or error response cached here would just serve that error offline forever.
                if (response.ok && response.type === 'basic') {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
