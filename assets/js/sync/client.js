/**
 * Oydin sinxronizatsiya mijozi.
 *
 * Tuzatilgan kamchiliklar:
 *  - o'chirilgan makonlar tombstone bilan yuboriladi, shuning uchun ular
 *    serverdan qaytib kelmaydi;
 *  - sahifa yopilayotganda `keepalive` ishlatiladi — ilgari oddiy `fetch`
 *    unload paytida bekor qilinib, oxirgi saqlash yo'qolardi;
 *  - xatolar (jumladan 429) endi interfeysga uzatiladi, jimgina yutilmaydi.
 */

import { EVENTS, readJson, readRaw, writeRaw } from '../core/index.js';

const TOKEN_KEY = 'oydin-vault-token-v1';
const LAST_KEY = 'oydin-sync-last-v1';
const MAX_SPACES = 50;
const DEBOUNCE_MS = 1500;
/** Ketma-ket xatolardan keyin kutish vaqti (eksponensial). */
const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000, 300_000];

const normalizeList = value => {
  if (Array.isArray(value))
    return value.filter(item => item && typeof item === 'object' && item.id);
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([id, item]) =>
        item && typeof item === 'object' ? { ...item, id: item.id ?? id } : null
      )
      .filter(Boolean);
  }
  return [];
};

export const getToken = () => readRaw(TOKEN_KEY);
export const lastSyncedAt = () => readRaw(LAST_KEY);

function emit(detail) {
  globalThis.dispatchEvent(new CustomEvent(EVENTS.sync, { detail }));
}

/** Bir vaqtda faqat bitta so'rov: mutex sifatida promise ishlatamiz. */
let pending = null;
let queued = false;
let timer = 0;
let failures = 0;

async function runSync({ keepalive = false, create = false } = {}) {
  const existing = getToken();

  /*
   * Vault YO'Q va uni yaratish so'ralmagan — so'rov umuman yuborilmaydi.
   *
   * Ilgari `startSync()` sahifa ochilishi bilan shartsiz so'rov yuborardi
   * va server tokensiz so'rovga javoban HAR SAFAR yangi vault yaratardi.
   * Natijada saytga kirgan har bir odam — hech narsa bosmasa ham, hech
   * qachon sinxronizatsiyani yoqmasa ham — bazada doimiy qator qoldirardi.
   * Bu "sinxronizatsiya ixtiyoriy" degan va'daga zid edi.
   *
   * Endi vault faqat ATAYLAB yaratiladi: foydalanuvchi kalitni so'raganda
   * yoki AI suhbatiga birinchi savol yuborilganda.
   */
  if (!existing && !create) {
    emit({ state: 'idle' });
    return null;
  }

  emit({ state: 'syncing' });

  try {
    const token = existing;
    const spaces = normalizeList(readJson('oydin-maps', {}))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
      .slice(0, MAX_SPACES);
    const deleted = readJson('oydin-deleted-maps-v1', {}) ?? {};

    const headers = { 'content-type': 'application/json' };
    if (token) headers['X-Oydin-Vault'] = token;

    const response = await fetch('/api/sync', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      keepalive,
      body: JSON.stringify({ spaces, deleted })
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || 60;
      failures += 1;
      emit({ state: 'throttled', retryAfter, message: 'Juda ko‘p so‘rov — biroz kutamiz.' });
      schedule(retryAfter * 1000);
      return null;
    }
    if (!response.ok) throw new Error(data.error || `Sinxronizatsiya xatosi (${response.status})`);

    if (data.token && !token) writeRaw(TOKEN_KEY, data.token, { silent: true });

    const syncedAt = data.syncedAt || new Date().toISOString();
    writeRaw(LAST_KEY, syncedAt, { silent: true });
    failures = 0;

    if (Array.isArray(data.spaces)) {
      globalThis.dispatchEvent(
        new CustomEvent(EVENTS.remoteSynced, {
          detail: { spaces: data.spaces, deleted: data.deleted ?? {} }
        })
      );
    }
    emit({ state: 'ok', at: syncedAt });
    return data;
  } catch (error) {
    failures += 1;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    emit({
      state: offline ? 'offline' : 'error',
      message: offline ? 'Oflayn — o‘zgarishlar shu qurilmada saqlanyapti.' : error.message
    });
    // Eksponensial kutish: server tushib qolsa uni bombardimon qilmaymiz.
    schedule(BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)]);
    return null;
  }
}

/**
 * Bir marta sinxronlaydi. Allaqachon ketayotgan so'rov bo'lsa, unga qo'shiladi
 * va tugagach yana bir marta rejalashtiradi.
 * @param {{keepalive?: boolean, create?: boolean}} options
 *   `create: true` — vault hali yo'q bo'lsa, uni ATAYLAB yaratadi.
 */
export function sync(options) {
  if (pending) {
    queued = true;
    return pending;
  }
  pending = runSync(options).finally(() => {
    pending = null;
    if (queued) {
      queued = false;
      schedule(200);
    }
  });
  return pending;
}

/** Sinxronizatsiyani rejalashtiradi (oxirgi chaqiruvdan keyin). */
export function schedule(delay = DEBOUNCE_MS) {
  clearTimeout(timer);
  timer = setTimeout(() => void sync(), delay);
}

/** Tokenni almashtiradi — boshqa qurilmadagi vaultga ulanish uchun. */
export function useToken(token) {
  const value = String(token ?? '')
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) return false;
  writeRaw(TOKEN_KEY, value, { silent: true });
  schedule(0);
  return true;
}

/** Sinxronizatsiyani ataylab yoqadi — vault shu paytda yaratiladi. */
export const enableSync = () => sync({ create: true });

/**
 * Kalitni boshqarish so'rovi (`rotate` yoki `revoke`).
 * @returns {Promise<object|null>} javob, yoki muvaffaqiyatsiz bo'lsa `null`
 */
async function manageVault(action) {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await fetch('/api/vault', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Oydin-Vault': token },
      credentials: 'same-origin',
      body: JSON.stringify({ action })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Kalitni yangilaydi: o'sha vaultga yangi kalit, eskisi shu zahoti
 * ishlamay qoladi. Ma'lumot joyida qoladi.
 *
 * DIQQAT: boshqa qurilmalar ham uziladi — ular yangi kalitni kiritishi
 * kerak bo'ladi. Bu xatolik emas, aynan maqsad.
 *
 * @returns {Promise<boolean>}
 */
export async function rotateToken() {
  const data = await manageVault('rotate');
  if (!/^[a-f0-9]{64}$/.test(String(data?.token ?? ''))) return false;
  writeRaw(TOKEN_KEY, data.token, { silent: true });
  return true;
}

/**
 * Vaultni va uning SERVERDAGI barcha ma'lumotini o'chiradi.
 * Qurilmadagi fikrlarga tegilmaydi.
 *
 * @returns {Promise<boolean>}
 */
export async function revokeVault() {
  const data = await manageVault('revoke');
  if (!data?.ok) return false;
  forgetToken();
  return true;
}

/** Ushbu qurilmani vaultdan uzadi (ma'lumot lokalda qoladi). */
export function forgetToken() {
  writeRaw(TOKEN_KEY, '', { silent: true });
  localStorage.removeItem(TOKEN_KEY);
}

export function startSync() {
  globalThis.addEventListener('online', () => schedule(300));
  globalThis.addEventListener('offline', () => emit({ state: 'offline' }));
  globalThis.addEventListener(EVENTS.dataChanged, event => {
    const key = event.detail?.key;
    if (key === 'oydin-maps' || key === 'oydin-deleted-maps-v1') schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(300);
  });
  // `keepalive: true` — brauzer sahifa yopilgandan keyin ham so'rovni yuboradi.
  globalThis.addEventListener('pagehide', () => {
    if (navigator.onLine !== false) void sync({ keepalive: true });
  });
  schedule(800);
}
