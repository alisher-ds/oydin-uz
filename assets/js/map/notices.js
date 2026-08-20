/**
 * Makondagi uchta xabar yuzasi.
 *
 * Uchalasi ham foydalanuvchiga gapiradi, lekin ishini to'xtatmaydi —
 * shuning uchun bitta faylda:
 *
 *  1. `showToast` — qisqa muddatli xabar ("Bekor qilindi");
 *  2. `createSaveBadge` — doimiy holat ("saqlandi", "oflayn");
 *  3. `createRecallBar` — eski fikrni qaytaruvchi chiziq.
 *
 * Qaror mantig'i bu yerda EMAS: nima ko'rsatishni `core/nudges.js`
 * hal qiladi, bu fayl esa faqat chizadi.
 */

import { $, EVENTS, el, on, readJson, writeJson } from '../core/index.js';
import { RECALL_KEY, humanAge, markShown, pickRecall } from '../core/nudges.js';
import { getToken } from '../sync/client.js';
import { track } from '../core/app.js';

/* -------------------------- qisqa xabar (toast) --------------------------- */

const VISIBLE_MS = 3000;

let host = null;
let timer = 0;

function ensureHost() {
  if (host?.isConnected) return host;
  host = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
  document.body.append(host);
  return host;
}

/**
 * Xabarni ko'rsatadi.
 *
 * @param {string} text asosiy xabar
 * @param {{hint?: string}} options `hint` — klaviatura maslahati
 */
export function showToast(text, { hint } = {}) {
  const node = ensureHost();
  node.replaceChildren();

  const bubble = el('div', { class: 'toast' });
  bubble.append(el('span', { class: 'toast-text', text }));
  if (hint) bubble.append(el('span', { class: 'toast-hint', text: hint }));
  node.append(bubble);

  // Qayta chizishni majburlaymiz — aks holda ketma-ket kelgan ikkita
  // xabarda animatsiya qayta boshlanmaydi.
  void bubble.offsetWidth;
  bubble.dataset.shown = 'true';

  clearTimeout(timer);
  timer = setTimeout(() => {
    bubble.dataset.shown = 'false';
    timer = setTimeout(() => node.replaceChildren(), 220);
  }, VISIBLE_MS);
}

/** Testlar uchun: xabarni darhol olib tashlaydi. */
export function _clearToast() {
  clearTimeout(timer);
  host?.replaceChildren();
}

/* -------------------------- saqlash holati -------------------------------- */

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

/* -------------------------- eski fikr chizig‘i ---------------------------- */

export function createRecallBar({ onOpenMap, onPlace }) {
  const host = $('#recall');
  if (!host) return { refresh: () => {} };

  function hide() {
    host.hidden = true;
    host.replaceChildren();
  }

  /**
   * Qaror qabul qilinganini bildiradi.
   *
   * Bu shunchaki test uchun emas: chiziq ilova ishga tushgandan keyin
   * paydo bo'ladi, ya'ni "hali qaror qilinmagan" va "ko'rsatadigan narsa
   * yo'q" holatlari tashqaridan bir xil ko'rinadi. Belgi ularni ajratadi.
   */
  const markDecided = () => {
    host.dataset.recall = 'decided';
  };

  function show() {
    const state = readJson(RECALL_KEY, {}) ?? {};
    const item = pickRecall({
      notes: readJson('oydin-oqim', []) ?? [],
      maps: readJson('oydin-maps', {}) ?? {},
      state
    });

    if (!item) {
      hide();
      markDecided();
      return;
    }

    host.replaceChildren();
    host.hidden = false;

    const label = el('p', { class: 'recall-label', text: humanAge(item.ageDays).toUpperCase() });
    const text = el('p', { class: 'recall-text' });
    text.textContent = item.text;

    const actions = el('div', { class: 'recall-actions' });

    if (item.source === 'card' && item.mapId) {
      const openButton = el('button', { type: 'button', class: 'soft-button', text: 'Ochish' });
      openButton.addEventListener('click', () => {
        onOpenMap(item.mapId, item.id);
        track('recall:qabul');
        hide();
      });
      actions.append(openButton);
    } else {
      const placeButton = el('button', { type: 'button', class: 'soft-button', text: 'Makonga' });
      placeButton.addEventListener('click', () => {
        onPlace(item.text, item.id);
        track('recall:qabul');
        hide();
      });
      actions.append(placeButton);
    }

    const dismiss = el('button', {
      type: 'button',
      class: 'icon-button',
      'aria-label': 'Yopish',
      text: '×'
    });
    dismiss.addEventListener('click', () => {
      track('recall:yopildi');
      hide();
    });
    actions.append(dismiss);

    host.append(el('div', { class: 'recall-body' }, [label, text]), actions);

    // Ko'rsatilgani darhol qayd etiladi: foydalanuvchi hech narsa
    // bosmasa ham, ertaga boshqa fikr chiqishi kerak.
    writeJson(RECALL_KEY, markShown(state, item.id));
    track('recall:korsatildi');
    markDecided();
  }

  return { refresh: show, hide };
}
