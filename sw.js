const CACHE_NAME = 'allimentate-premium-v1';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './data/db.js',
    './assets/logo.jpg',
    'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&family=Outfit:wght@300;400;600;700&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
];

// Instalación
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

// Activación
self.addEventListener('activate', (e) => {
    e.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
                );
            })
        ])
    );
});

// fetch: Smart Strategy
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // 1. DATA & CORE: Network-First with background Sync
    if (url.pathname.endsWith('db.js') || url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const resClone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // 2. IMAGES & UI: Stale-While-Revalidate (Speed Primary)
    e.respondWith(
        caches.match(e.request).then((cachedResponse) => {
            const fetchPromise = fetch(e.request).then((networkResponse) => {
                const resClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});
