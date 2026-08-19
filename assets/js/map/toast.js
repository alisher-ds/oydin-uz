/**
 * Qisqa muddatli xabar (toast).
 *
 * Nima uchun kerak: `Ctrl+Z` bosilganda ekranda hech qanday javob yo'q
 * edi. Foydalanuvchi amal bajarilganini ham, uni qanday qaytarishni ham
 * bilmasdi — natijada bekor qilishdan qo'rqadi.
 *
 * Ataylab juda kam narsa qiladi: bitta xabar, uch soniya, so'ng
 * yo'qoladi. Navbat yo'q — yangi xabar eskisining o'rnini egallaydi,
 * chunki bir vaqtda ikkita "hozir nima bo'ldi" xabari mantiqsiz.
 *
 * `aria-live="polite"` — ekran o'quvchisi joriy o'qishini bo'lmaydi.
 */

import { el } from '../core/index.js';

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
