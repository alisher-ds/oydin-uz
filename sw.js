/**
 * Oydin service worker.
 *
 * Maqsad — tezlik. `/tez` sahifasi keshdan ochilsa, foydalanuvchi tarmoqni
 * umuman kutmaydi: ikonkani bosdi — kursor turibdi.
 *
 * Strategiya ikki xil:
 *  - navigatsiya (HTML): avval tarmoq, u ishlamasa kesh. Shunda yangi
 *    versiya darhol ko'rinadi, lekin oflayn ham ochiladi.
 *  - qolgan fayllar (CSS/JS/rasm): avval kesh, keyin fonda yangilanadi.
 *    Bu "stale-while-revalidate": sahifa kutmaydi, lekin eskirib qolmaydi.
 *
 * API so'rovlari (`/api/...`) HECH QACHON keshlanmaydi — ular jonli
 * ma'lumot va eski javob zarar keltiradi.
 */

const VERSION = 'oydin-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

/** Birinchi ochilishdayoq keshlanadigan minimal to'plam. */
const PRECACHE = [
  '/map.html',
  '/index.html',
  '/assets/css/tokens.css',
  '/assets/css/base.css',
  '/assets/css/components.css',
  '/assets/css/map.css',
  '/assets/js/boot-map.js',
  '/assets/js/core/index.js',
  '/assets/js/core/dom.js',
  '/assets/js/core/events.js',
  '/assets/js/core/storage.js',
  '/assets/js/core/notes.js',
  '/assets/js/core/theme.js',
  '/assets/js/core/pwa.js',
  '/assets/js/core/stat.js',
  '/favicon.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Bitta fayl yetib kelmasa ham o'rnatish buzilmasin.
      .then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => !key.startsWith(VERSION)).map(key => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

/** HTML: yangi versiya muhim, lekin oflayn ham ochilsin. */
const networkFirst = async request => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match(request)) ?? (await caches.match('/map.html'));
    if (cached) return cached;
    return new Response('Oflayn — bu sahifa hali keshlanmagan.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
};

/** Statik fayllar: keshdan darhol, fonda yangilanadi. */
const cacheFirst = async request => {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(response => {
      if (response.ok) {
        caches.open(RUNTIME).then(cache => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;
  const response = await network;
  if (response) return response;
  return new Response('', { status: 504 });
};
