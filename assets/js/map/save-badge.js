/**
 * "Saqlandi" ko'rsatkichi — ma'lumot xavfsizligini KO'RINADIGAN qiladi.
 *
 * Muammo shundaki, Oydin ma'lumotni ishonchli saqlaydi (localStorage +
 * IndexedDB zaxirasi + ixtiyoriy sinxronizatsiya), lekin foydalanuvchi
 * buni bilmaydi. Ishonch — bu ham UX.
 *
 * DIQQAT, TARIXIY XATO: bu ko'rsatkich kodda ancha vaqt bor edi va
 * to'g'ri ishlardi, lekin `map.css` da
 *
 *     .map-page #saveStatus { display: none !important; }
 *
 * qoidasi uni butunlay yashirib qo'ygan edi. Ya'ni javob ekranda bor,
 * ko'z uchun esa yo'q. Endi u sahifaning pastki o'ng burchagida doimiy
 * turadi.
 *
 * Bitta element, bitta haqiqat: mahalliy saqlash ham, sinxronizatsiya
 * ham shu yerda ko'rinadi. Ustunlik tartibi — mahalliy xato eng muhim,
 * chunki u ma'lumot YO'QOLISHI mumkinligini bildiradi.
 */

import { $, EVENTS, on } from '../core/index.js';
import { getToken } from '../sync/client.js';

/** Sinxronizatsiya holatlari — matn va ohang. */
const SYNC_TEXT = {
  syncing: ['sinxronlanmoqda…', 'pending'],
  ok: ['sinxronlandi', 'ok'],
  offline: ['oflayn — keyinroq sinxronlanadi', 'pending'],
  throttled: ['navbat kutyapmiz', 'pending'],
  error: ['sinxronlanmadi — ma’lumot shu qurilmada', 'pending']
};

/**
 * Sinxronizatsiyani YOQMAGAN odamga "sinxronlanmadi" deyish noto'g'ri:
 * u hech qachon so'ramagan va bu xato emas. Unga ma'lumot qayerdaligini
 * aytish kifoya.
 */
const LOCAL_ONLY = ['shu qurilmada saqlandi', 'ok'];

/** Mahalliy xato ko'rsatilgach shuncha vaqt sinxronizatsiya uni bosmaydi. */
const ERROR_HOLD_MS = 6000;

export function createSaveBadge() {
  const node = $('#saveStatus');
  if (!node) return { set: () => {} };

  let errorUntil = 0;
  let resetTimer = 0;

  /**
   * Ko'rsatkichni yangilaydi.
   *
   * @param {string} text ko'rinadigan matn
   * @param {'ok'|'pending'|'error'} tone
   */
  function set(text, tone = 'ok') {
    if (tone === 'error') errorUntil = Date.now() + ERROR_HOLD_MS;
    else if (Date.now() < errorUntil) return; // xato xabarini bosmaymiz

    node.textContent = text;
    node.dataset.tone = tone;

    clearTimeout(resetTimer);
    if (tone === 'ok' && text !== 'saqlandi') {
      resetTimer = setTimeout(() => {
        node.textContent = 'saqlandi';
        node.dataset.tone = 'ok';
      }, 2200);
    }
  }

  on(globalThis, EVENTS.sync, event => {
    const state = event.detail?.state;
    if ((state === 'error' || state === 'ok' || state === 'syncing') && !getToken()) {
      set(...LOCAL_ONLY);
      return;
    }
    const [text, tone] = SYNC_TEXT[state] ?? [];
    if (text) set(text, tone);
  });

  // Brauzer tarmoqni yo'qotganini sinxronizatsiya urinishisiz ham biladi.
  on(globalThis, 'offline', () => set(...SYNC_TEXT.offline));
  on(globalThis, 'online', () => set('saqlandi', 'ok'));

  if (globalThis.navigator?.onLine === false) set(...SYNC_TEXT.offline);

  return { set };
}
