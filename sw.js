/**
 * Oydin service worker.
 *
 * Maqsad — tezlik va yangilikni birga ushlash.
 *
 * Strategiya ikki xil:
 *  - navigatsiya (HTML): avval tarmoq, u ishlamasa kesh. Shunda yangi
 *    versiya darhol ko'rinadi, lekin oflayn ham ochiladi.
 *  - kod (JS/CSS): avval tarmoq, u ishlamasa joriy deploy keshidan oladi.
 *    Build bosqichi yo'q va fayl nomlari o'zgarmaydi, shuning uchun kodni
 *    stale-while-revalidate qilish turli deploy avlodlarini aralashtirib,
 *    ES modul zanjirini sindirishi mumkin.
 *  - qolgan statik fayllar (rasm, shrift, ikonka): avval kesh, keyin fonda
 *    yangilanadi. Ular modullararo shartnomaga ega emas.
 *
 * API so'rovlari (`/api/...`) HECH QACHON keshlanmaydi — ular jonli
 * ma'lumot va eski javob zarar keltiradi.
 */

// Versiya o'zgarsa `activate` eski keshlarni tozalaydi. Uslub yoki
// modullar jiddiy o'zgarganda ko'tariladi — aks holda qaytgan
// foydalanuvchi yangi imkoniyatlarni bir yuklanish kechikib ko'radi.
const VERSION = 'oydin-v4';

/** Birinchi ochilishdayoq keshlanadigan minimal to'plam. */
const PRECACHE = [
  '/map.html',
  '/index.html',
  '/assets/css/tokens.css',
  '/assets/css/base.css',
  '/assets/css/components.css',
  '/assets/css/map.css',
  '/assets/js/boot-map.js',
  '/assets/js/recover.js',
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
 * network-first strategiyasi kodni imkon qadar darhol yangilaydi.
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

  /*
   * KOD (JS va CSS) ham avval tarmoqdan olinadi. Sabab jiddiy.
   *
   * Ilgari ular "keshdan ber, fonda yangila" yo'li bilan berilardi.
   * Fayl nomlari o'zgarmasligi sababli (build bosqichi yo'q, hash yo'q)
   * bitta modul eski keshdan, ikkinchisi tarmoqdan kelib qolishi mumkin
   * edi — ya'ni IKKI XIL AVLOD aralashardi.
   *
   * Oqibati butun ilovani o'ldirardi:
   *
   *   The requested module '../core/app.js' does not provide an
   *   export named 'setStatsEnabled'
   *
   * Bitta import yiqilsa modul zanjiri to'liq to'xtaydi — sahifa
   * ochiladi, lekin birorta tugma ishlamaydi. Buni takrorlab ko'rdim:
   * eski kesh + yangi deploy = aynan shu xato.
   *
   * Endi kod har doim bitta deploy'dan keladi. Kesh esa oflayn uchun
   * zaxira bo'lib qolaveradi. Narxi — bitta tarmoq murojaati; foydasi —
   * ilovani buzadigan butun bir xatolar sinfi yo'qoladi.
   */
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Rasm, shrift, ikonka — ularda modullararo shartnoma yo'q, ya'ni
  // eski nusxa hech narsani buzmaydi.
  event.respondWith(cacheFirst(request));
});

/** HTML va kod: yangi versiya muhim, lekin oflayn ham ochilsin. */
const networkFirst = async request => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await matchCurrent(request);
    if (cached) return cached;

    // Faqat SAHIFA so'ralganda makonni ko'rsatamiz. Kod so'ralganda
    // HTML qaytarish xatoni yashirib, tushunarsiz qilib qo'yardi.
    if (request.mode === 'navigate') {
      const shell = await matchCurrent('/map.html');
      if (shell) return shell;
    }
    return new Response('Oflayn — bu manba hali keshlanmagan.', {
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
