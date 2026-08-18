/**
 * DOM yordamchilari.
 *
 * Muhim qoida: element havolalari HECH QACHON `id` global o'zgaruvchilaridan
 * olinmaydi. `<div id="canvas">` brauzerda `window.canvas` ni yaratadi va shunga
 * tayanish jimgina buziladigan kodga olib keladi (aynan shu narsa `layer is not
 * defined` regressiyasining yarmi edi). Har doim `$()` dan foydalaning.
 */

/** @type {(selector: string, scope?: ParentNode) => HTMLElement | null} */
export const $ = (selector, scope = document) => scope.querySelector(selector);

/** @type {(selector: string, scope?: ParentNode) => HTMLElement[]} */
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * HTML kontekstiga qo'yish uchun matnni ekranlaydi.
 * Loyihada faqat SHU funksiya ishlatiladi — takroriy nusxalari yo'q.
 */
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ESCAPE_MAP[ch]);

/** Barqaror noyob identifikator. */
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Element yaratish uchun qisqa yordamchi. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child != null) node.append(child);
  }
  return node;
}

/** Hodisaga obuna bo'lish; obunani bekor qiluvchi funksiyani qaytaradi. */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Foydalanuvchi harakat animatsiyalarini kamaytirishni so'raganmi? */
export const prefersReducedMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Sensorli (aniqligi past) qurilmami? */
export const isCoarsePointer = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Hozir modal dialog ochiqmi? Klaviatura qisqartmalari uchun kerak. */
export const hasOpenDialog = () => Boolean($('dialog[open]'));

/**
 * Fokus matn kiritish maydonidami? Qisqartmalar shunda ishlamasligi kerak.
 * `contenteditable` ham hisobga olinadi.
 */
export function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select')) return true;
  return Boolean(target.closest('[contenteditable]:not([contenteditable="false"])'));
}
