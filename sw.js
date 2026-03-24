const CACHE_NAME = 'eanatomy-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './viewer.html',
    './css/style.css',
    './css/viewer.css',
    './js/app.js',
    './js/viewer.js',
    './data/catalog.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            })
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // Only intercept local requests
    if (!event.request.url.startsWith(self.location.origin)) return;
    
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            
            // Clone the request because it can only be used once
            const fetchRequest = event.request.clone();
            
            return fetch(fetchRequest).then(response => {
                // Return if not valid
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                
                // Clone response to cache
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                
                return response;
            }).catch(error => {
                // If network fails and we don't have cache, just fail gracefully
                console.error('Fetch failed:', error);
                throw error;
            });
        })
    );
});
