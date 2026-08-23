/**
 * Ilova ishga tushishi: service worker va anonim statistika.
 *
 * Ikkalasi ham "sahifa ochilganda bir marta bajariladi va foydalanuvchi
 * ularni sezmaydi" turkumiga kiradi, shuning uchun bitta faylda.
 *
 * Statistika haqidagi asosiy va'da: serverga faqat yopiq ro'yxatdagi
 * hodisa NOMI ketadi. Matn, ID, sessiya, referrer — hech biri
 * yuborilmaydi va bu yerda o'qilmaydi ham.
 */

/**
 * Ruxsat etilgan hodisalar — `functions/api/stat.js` dagi
 * `ALLOWED_EVENTS` bilan bir xil bo'lishi SHART. Ajralib ketsa
 * `tests/unit/stat.test.js` CI'ni qizil qiladi.
 */
export const STAT_EVENTS = Object.freeze([
  'tashrif',
  'qaytish',
  'sahifa:oydin',
  'sahifa:makon',
  'ornatildi',
  'fikr',
  'aloqa',
  'makon',
  'tez',
  'tez:makonga',
  'recall:korsatildi',
  'recall:qabul',
  'recall:yopildi',
  'ai',
  'qollanma:boshlandi',
  'qollanma:tugadi',
  'qollanma:otkazildi'
]);

const KNOWN = new Set(STAT_EVENTS);

const STATE_KEY = 'oydin-stat-v1';
const OPT_OUT_KEY = 'oydin-stat';
const ENDPOINT = '/api/stat';
/** Bir necha hodisa bitta so'rovga yig'iladi. */
const FLUSH_MS = 400;

/**
 * Kunlik tashrif rejasi. SOF funksiya — shuning uchun to'liq test qilinadi.
 *
 * @param {{day?: string}|null} state oldingi holat
 * @param {string} day bugungi kun (YYYY-MM-DD)
 * @returns {{events: string[], next: {day: string}|null}}
 *   `next` — saqlanishi kerak bo'lgan yangi holat, o'zgarish bo'lmasa `null`.
 */
export function planVisit(state, day) {
  const previous = state?.day;
  if (previous === day) return { events: [], next: null };

  // Ilgari kirgan bo'lsa — bu qaytish, ya'ni odam saytni eslab qolgan.
  const events = previous ? ['tashrif', 'qaytish'] : ['tashrif'];
  return { events, next: { day } };
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1', '']);

/**
 * Qaror qabul qilish qoidasi. SOF funksiya — to'liq test qilinadi.
 *
 * Tartib ataylab shunday: foydalanuvchining ATAYLAB qilgan tanlovi
 * boshqa hamma narsadan ustun.
 *
 * @param {{flag?: string|null, dnt?: string|null, hostname?: string}} input
 */
export function decide({ flag, dnt, hostname } = {}) {
  if (flag === 'off') return false; // aniq rad — hech qanday istisno yo'q
  if (flag === 'on') return true; // aniq rozilik (lokal sinov uchun ham)
  if (dnt === '1' || dnt === 'yes') return false; // brauzer sozlamasi
  return !localHosts.has(hostname ?? ''); // lokal ishlab chiqish sanalmasin
}

/**
 * Foydalanuvchi statistikani ATAYLAB o'chirganmi.
 *
 * `isEnabled()` dan farqi bor: u "hozir yig'ilyaptimi" degan savolga
 * javob beradi va lokal manzil, Do Not Track kabi sabablarni ham
 * hisobga oladi. Bu esa faqat foydalanuvchining o'z tanlovini aytadi —
 * sozlama tugmasi aynan shuni ko'rsatishi kerak.
 */
export function statsOptedOut() {
  try {
    return globalThis.localStorage?.getItem(OPT_OUT_KEY) === 'off';
  } catch {
    return false;
  }
}

/**
 * Statistikani yoqadi yoki o'chiradi.
 *
 * Ilgari buni faqat konsolda `localStorage.setItem(...)` bilan qilish
 * mumkin edi — ya'ni "istagan payt o'chirishingiz mumkin" degan va'da
 * amalda dasturchilar uchun edi. Endi u tugma.
 *
 * @param {boolean} on
 */
export function setStatsEnabled(on) {
  try {
    if (on) globalThis.localStorage?.removeItem(OPT_OUT_KEY);
    else globalThis.localStorage?.setItem(OPT_OUT_KEY, 'off');
    return true;
  } catch {
    return false;
  }
}

/** Statistika yig'ilishi kerakmi. */
export function isEnabled() {
  if (typeof globalThis.navigator === 'undefined') return false;
  try {
    return decide({
      flag: globalThis.localStorage?.getItem(OPT_OUT_KEY),
      dnt: globalThis.navigator.doNotTrack ?? globalThis.doNotTrack,
      hostname: globalThis.location?.hostname
    });
  } catch {
    return false;
  }
}

let queue = new Set();
let timer = null;

function send(events) {
  if (!events.length) return;
  const body = JSON.stringify({ e: events });

  try {
    // `sendBeacon` sahifa yopilayotganda ham yetib boradi va asosiy
    // ishni sekinlashtirmaydi.
    const beacon = globalThis.navigator?.sendBeacon;
    if (beacon) {
      beacon.call(globalThis.navigator, ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  } catch {
    // Statistika hech qachon sahifani buzmasligi kerak.
  }
}

/** Navbatdagi hodisalarni darhol yuboradi. */
export function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.size) return;
  const events = [...queue];
  queue = new Set();
  send(events);
}

/**
 * Hodisani qayd etadi. Notanish nom jimgina tashlab yuboriladi.
 * Hech qachon xato tashlamaydi va hech narsani kutmaydi.
 */
export function track(...names) {
  if (!isEnabled()) return;
  for (const name of names) if (KNOWN.has(name)) queue.add(name);
  if (!queue.size || timer) return;
  timer = setTimeout(flush, FLUSH_MS);
}

/**
 * Sahifa ochilganda chaqiriladi: kunlik tashrifni hisoblaydi va
 * sahifa nomini qayd etadi.
 *
 * @param {string} pageEvent masalan `sahifa:makon`
 */
export function startStats(pageEvent) {
  if (!isEnabled()) return;

  let state = null;
  try {
    state = JSON.parse(globalThis.localStorage.getItem(STATE_KEY) ?? 'null');
  } catch {
    state = null;
  }

  const day = new Date().toISOString().slice(0, 10);
  const { events, next } = planVisit(state, day);

  if (next) {
    try {
      globalThis.localStorage.setItem(STATE_KEY, JSON.stringify(next));
    } catch {
      // Xotira to'lgan bo'lsa statistika baribir ikkinchi darajali.
    }
  }

  track(pageEvent, ...events);

  // Sahifa yopilayotganda navbatda qolgani yo'qolmasin.
  globalThis.addEventListener?.('pagehide', flush);
}

/** Testlar uchun: navbatni tozalaydi. */
export function _resetForTests() {
  if (timer) clearTimeout(timer);
  timer = null;
  queue = new Set();
}

/* --------------------------- service worker ------------------------------ */

/**
 * Service worker'ni ro'yxatdan o'tkazish.
 *
 * Buning yagona maqsadi — tezlik va oflayn ishlash: qobiq keshdan
 * ochilgani uchun ilova tarmoqni kutmaydi. Fikr kelganda kutish esa
 * fikrni yo'qotish demak.
 */
export function registerServiceWorker() {
  // Bosh ekranga o'rnatilgani — Oydin uchun eng muhim signal: odam
  // saytni bir marta emas, doim ishlatmoqchi degani.
  globalThis.addEventListener('appinstalled', () => track('ornatildi'));

  if (!('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('Service worker ro‘yxatdan o‘tmadi:', error);
    });
  };

  /*
   * DIQQAT, POYGA: bu funksiya `boot-map.js` da `await recoverMissing()`
   * dan KEYIN chaqiriladi. Modul darajasidagi `await` esa qolgan kodni
   * kechiktiradi — IndexedDB sekin javob bersa, `load` hodisasi allaqachon
   * o'tib ketgan bo'ladi va unga qo'yilgan tinglovchi HECH QACHON
   * ishlamaydi.
   *
   * Oqibati og'ir edi: service worker ro'yxatdan o'tmaydi, ya'ni ilova
   * bosh ekranga o'rnatilmaydi va oflayn ishlamaydi. Bundan ham yomoni —
   * eski keshga ega qurilmada yangi SW hech qachon faollashmaydi, ya'ni
   * eski nusxa cheksiz saqlanib qoladi.
   *
   * Bu qurilmaga qarab turlicha namoyon bo'ladi: bir telefonda ishlaydi,
   * bir noutbukda yo'q.
   */
  if (document.readyState === 'complete') register();
  else globalThis.addEventListener('load', register, { once: true });
}
