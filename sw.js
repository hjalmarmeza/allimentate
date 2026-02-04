const CACHE_NAME = 'allimentate-recetas-v2'; // Incrementamos versión
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
    // Forzar activación inmediata de esta nueva versión
    self.skipWaiting();

    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Activación
self.addEventListener('activate', (e) => {
    // Tomar control de todas las pestañas abiertas inmediatamente
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

// Fetch: Estratégia Híbrida
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Estrategia Network-First (Internet Primero) para:
    // 1. La base de datos (para ver recetas nuevas siempre)
    // 2. El index.html (para ver cambios de diseño)
    if (url.pathname.endsWith('db.js') || url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    // Si hay internet, actualizamos la cache y respondemos
                    const resClone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
                    return res;
                })
                .catch(() => {
                    // Si falla internet, devolvemos lo que haya en cache
                    return caches.match(e.request);
                })
        );
        return;
    }

    // Estrategia Cache-First (Velocidad) para todo lo demás (imágenes, fuentes, css)
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});
