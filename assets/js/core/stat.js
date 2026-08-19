/**
 * Anonim statistika — mijoz tomoni.
 *
 * Oydin'ning asosiy va'dasi anonimlik, shuning uchun bu modul ataylab
 * juda kam narsa qiladi. Serverga yuboriladigan yagona narsa — yopiq
 * ro'yxatdagi hodisa NOMI. Matn, ID, sessiya, referrer — hech biri
 * yuborilmaydi va bu yerda ular hatto o'qilmaydi ham.
 *
 * "Nechta odam kirdi" sanog'i shu yerda, qurilmaning o'zida hisoblanadi:
 * brauzer oxirgi marta qaysi kuni yuborganini biladi va kun almashsa
 * serverga bitta `tashrif` so'zini yuboradi. Ya'ni server "unique
 * visitor" ni aniqlash uchun kerak bo'ladigan hech qanday ma'lumotga
 * (IP, cookie, fingerprint) muhtoj emas.
 *
 * Foydalanuvchi butunlay o'chirib qo'yishi mumkin:
 *   localStorage.setItem('oydin-stat', 'off')
 * Brauzerning "Do Not Track" sozlamasi ham hurmat qilinadi.
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
  'ai'
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
