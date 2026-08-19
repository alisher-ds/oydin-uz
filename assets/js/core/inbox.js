/**
 * "Kiruvchi" — taqsimlanmagan fikrlar uchun joy.
 *
 * Nima uchun alohida ombor kerak: fikr kelganda miya "qaysi makonga?"
 * degan savolga javob berishga tayyor emas, va o'sha savol fikrni
 * yo'qotadi. Shuning uchun yozish va joylashtirish ajratilgan — avval
 * yozib qo'yiladi, keyin xotirjam taqsimlanadi.
 *
 * Ombor `oydin-maps` dan mustaqil: `/tez` sahifasi makonlar mantiqini
 * umuman yuklamaydi, shuning uchun u bir necha o'n millisekundda ochiladi.
 */

import { readJson, writeJson } from './storage.js';
import { uid } from './dom.js';

export const INBOX_KEY = 'oydin-inbox-v1';

/** Ombor cheksiz o'smasin: eng eskisi tashlab yuboriladi. */
const MAX_ITEMS = 500;
const MAX_CHARS = 4000;

const isEntry = value =>
  value != null &&
  typeof value === 'object' &&
  typeof value.id === 'string' &&
  typeof value.text === 'string';

/** Saqlangan ro'yxatni o'qiydi; buzuq yozuvlar chetlab o'tiladi. */
export function readInbox() {
  const raw = readJson(INBOX_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isEntry);
}

/**
 * Yangi fikr qo'shadi. Bo'sh matn yozilmaydi.
 * @returns {{ok: boolean, entry?: object, reason?: string}}
 */
export function addToInbox(text) {
  const trimmed = String(text ?? '')
    .trim()
    .slice(0, MAX_CHARS);
  if (!trimmed) return { ok: false, reason: 'empty' };

  const entry = { id: uid('fikr'), text: trimmed, createdAt: new Date().toISOString() };
  const next = [entry, ...readInbox()].slice(0, MAX_ITEMS);
  const result = writeJson(INBOX_KEY, next);
  return result?.ok === false ? { ok: false, reason: result.reason } : { ok: true, entry };
}

/** Bitta fikrni olib tashlaydi (makonga ko'chirilgach yoki o'chirilganda). */
export function removeFromInbox(id) {
  const next = readInbox().filter(entry => entry.id !== id);
  writeJson(INBOX_KEY, next);
  return next;
}

/** Hammasini tozalaydi. */
export function clearInbox() {
  writeJson(INBOX_KEY, []);
  return [];
}

export const inboxCount = () => readInbox().length;
