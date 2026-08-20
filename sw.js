/**
 * Oydin service worker.
 *
 * Maqsad — tezlik. Makon keshdan ochilsa, foydalanuvchi tarmoqni umuman
 * kutmaydi: ikonkani bosdi — sahifa turibdi.
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

// Versiya o'zgarsa `activate` eski keshlarni tozalaydi. Uslub yoki
// modullar jiddiy o'zgarganda ko'tariladi — aks holda qaytgan
// foydalanuvchi yangi imkoniyatlarni bir yuklanish kechikib ko'radi.
const VERSION = 'oydin-v3';

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
  '/assets/js/core/storage.js',
  '/assets/js/core/notes.js',
  '/assets/js/core/theme.js',
  '/assets/js/core/app.js',
  '/assets/js/core/nudges.js',
  '/favicon.svg',
  '/manifest.webmanifest'
];

/**
 * Kesh nomiga ro'yxatning O'ZIDAN olingan iz qo'shiladi.
 *
 * NIMA UCHUN: fayl qayta nomlansa yoki birlashtirilsa, `VERSION` ni
 * qo'lda ko'tarish kerak edi. Bir marta unutildi — va oqibati og'ir
 * bo'ldi: eski keshdagi `boot-map.js` endi mavjud bo'lmagan modullarni
 * chaqirib, sahifani butunlay ishdan chiqardi.
 *
 * Endi ro'yxat o'zgarsa kesh nomi ham o'zi o'zgaradi, ya'ni eski nusxa
 * `activate` da avtomatik o'chadi. Faylning ICHI o'zgarganda esa
 * "keshdan ber, fonda yangila" strategiyasi ishlaydi.
 */
const fingerprint = list => {
  let hash = 5381;
  const text = list.join('|');
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
};

const TAG = `${VERSION}-${fingerprint(PRECACHE)}`;
const SHELL = `${TAG}-shell`;
const RUNTIME = `${TAG}-runtime`;

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
        Promise.all(keys.filter(key => !key.startsWith(TAG)).map(key => caches.delete(key)))
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
    const cached = (await matchCurrent(request)) ?? (await matchCurrent('/map.html'));
    if (cached) return cached;
    return new Response('Oflayn — bu sahifa hali keshlanmagan.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
};

/**
 * Faqat SHU versiyaning keshlaridan qidiradi.
 *
 * `caches.match(request)` BARCHA keshlarni ko'radi — jumladan eski
 * versiyanikini ham. Natijada yangi kesh to'g'ri to'ldirilgan bo'lsa
 * ham, eski nusxa javob berib qolishi mumkin edi.
 */
const matchCurrent = async request => {
  for (const name of [SHELL, RUNTIME]) {
    const cache = await caches.open(name);
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  return undefined;
};

/** Statik fayllar: keshdan darhol, fonda yangilanadi. */
const cacheFirst = async request => {
  const cached = await matchCurrent(request);
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
