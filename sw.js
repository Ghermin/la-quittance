var CACHE = 'quittance-loyer-v4';
var ASSETS = [
    './',
    './index.html',
    './css/app.css',
    './js/pdf.js',
    './js/core.js',
    './js/native.js',
    './js/app.js',
    './js/vendor/jspdf.umd.min.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE)
            .then(function (cache) { return cache.addAll(ASSETS); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
            })
            .then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    event.respondWith(
        caches.open(CACHE).then(function (cache) {
            return cache.match(req, { ignoreSearch: true }).then(function (cached) {
                var network = fetch(req).then(function (res) {
                    if (res && res.ok) cache.put(req, res.clone());
                    return res;
                }).catch(function () {
                    if (cached) return cached;
                    if (req.mode === 'navigate') return cache.match('./index.html');
                    return Response.error();
                });
                return cached || network;
            });
        })
    );
});
