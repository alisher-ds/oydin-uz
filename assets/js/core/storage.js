/**
 * Oydin saqlash qatlami.
 *
 * Bu modul localStorage bilan ishlashning YAGONA yo'li. Ilgari bu vazifani
 * `Storage.prototype.setItem` ni global almashtirish bajarardi — bu antipattern
 * edi: uni o'chirib bo'lmaydi, boshqa kutubxonalar bilan to'qnashadi va
 * xatolarni yashiradi. Endi hamma yozuv shu yerdan o'tadi.
 *
 * Kafolatlar:
 *  - kvota tugasa yozuv JIMGINA yo'qolmaydi — `oydin:storage-error` yuboriladi;
 *  - har yozuv IndexedDB ga zaxiralanadi va tiklash haqiqatan ishlaydi;
 *  - har o'zgarish `oydin:data-changed` hodisasini yuboradi.
 */

import { EVENTS } from './events.js';

const DB_NAME = 'oydin-storage';
const STORE = 'snapshots';
const DB_VERSION = 3;

/** IndexedDB ga zaxiralanadigan kalitlar. */
export const MIRRORED_KEYS = Object.freeze([
  'oydin-maps',
  'oydin-active-map',
  'oydin-oqim',
  'oydin-theme',
  'oydin-connection-relations-v1',
  'oydin-deleted-maps-v1',
  'oydin-vault-token-v1',
  // Taqsimlanmagan fikrlar — ular hali makonga tushmagan, ya'ni yagona
  // nusxa shu yerda. Zaxirasiz qolsa, brauzer xotirasi tozalanganda
  // yo'qoladi.
  'oydin-inbox-v1'
]);

const hasIndexedDB = () => typeof indexedDB !== 'undefined' && indexedDB !== null;

let dbPromise = null;

function openDB() {
  if (!hasIndexedDB()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/** Kalitni IndexedDB ga yozadi. Xatolar jimgina yutiladi — bu faqat zaxira. */
async function mirrorWrite(key, value) {
  const db = await openDB();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, value, version: DB_VERSION, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('[Oydin] zaxira nusxa yozilmadi', error);
  }
}

/**
 * Kalitni IndexedDB dan o'qiydi va XOM QIYMATNI qaytaradi.
 *
 * Eski kod bu yerda yozuv obyektini kutgan (`item.value`), holbuki funksiya
 * allaqachon qiymatning o'zini qaytarardi — shu sababli tiklash hech qachon
 * ishlamagan. Qaytish turi endi aniq: `string | null`.
 */
async function mirrorRead(key) {
  const db = await openDB();
  if (!db) return null;
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => {
        const record = request.result;
        resolve(typeof record?.value === 'string' ? record.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

function emit(type, detail) {
  globalThis.dispatchEvent?.(new CustomEvent(type, { detail }));
}

/** Xom satrni o'qiydi. */
export function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Xom satrni yozadi.
 * @returns {{ok: boolean, reason?: 'quota' | 'unavailable'}}
 */
export function writeRaw(key, value, { silent = false } = {}) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    const quota =
      error?.name === 'QuotaExceededError' ||
      error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error?.code === 22;
    const reason = quota ? 'quota' : 'unavailable';
    // Jimgina yo'qotmaymiz — chaqiruvchi va interfeys bundan xabardor bo'ladi.
    emit(EVENTS.storageError, { key, reason, error });
    return { ok: false, reason };
  }
  if (MIRRORED_KEYS.includes(key)) void mirrorWrite(key, value);
  if (!silent) emit(EVENTS.dataChanged, { key, value, operation: 'set' });
  return { ok: true };
}

/** JSON o'qiydi; buzuq bo'lsa `fallback` qaytadi. */
export function readJson(key, fallback) {
  const raw = readRaw(key);
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** JSON yozadi. */
export function writeJson(key, value, options) {
  return writeRaw(key, JSON.stringify(value), options);
}

/** Kalitni o'chiradi. */
export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (MIRRORED_KEYS.includes(key)) void mirrorWrite(key, null);
  emit(EVENTS.dataChanged, { key, value: null, operation: 'remove' });
  return { ok: true };
}

/** Kalitni qo'lda zaxiralaydi. */
export const backup = key =>
  MIRRORED_KEYS.includes(key) ? mirrorWrite(key, readRaw(key)) : Promise.resolve();

/**
 * localStorage da kalit yo'q bo'lsa, uni IndexedDB dan tiklaydi.
 * @returns {Promise<boolean>} tiklandimi
 */
export async function restore(key) {
  if (!MIRRORED_KEYS.includes(key)) return false;
  if (readRaw(key) !== null) return false;
  const value = await mirrorRead(key);
  if (typeof value !== 'string') return false;
  const result = writeRaw(key, value, { silent: true });
  if (!result.ok) return false;
  emit(EVENTS.storageRestored, { key });
  return true;
}

/**
 * Yuklanishda yo'qolgan kalitlarni tiklaydi.
 * @returns {Promise<string[]>} tiklangan kalitlar
 */
export async function recoverMissing(keys = MIRRORED_KEYS) {
  const recovered = [];
  for (const key of keys) {
    // Ketma-ket: bitta IndexedDB ulanishi, ziddiyatsiz.
    if (await restore(key)) recovered.push(key);
  }
  return recovered;
}

/** Testlar uchun: keshlangan ulanishni tozalaydi. */
export function _resetForTests() {
  dbPromise = null;
}
