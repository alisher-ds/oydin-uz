/** Vault (qurilmalararo kalit) yordamchilari. */

const encoder = new TextEncoder();
const HEX = /^[a-f0-9]{64}$/;

/** Kriptografik tasodifiy token (standart: 32 bayt = 64 hex belgi). */
export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** Token hech qachon xom holda saqlanmaydi — faqat SHA-256 hash. */
export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** Token formatini tekshiradi. */
export const isValidToken = token => HEX.test(String(token ?? ''));

export const safeId = (prefix = 'id') => `${prefix}_${crypto.randomUUID()}`;

export const now = () => new Date().toISOString();

/**
 * Mijoz bergan vaqt belgisini ishonchli ISO satrga keltiradi.
 *
 * Ilgari `space.updatedAt` tekshirilmasdan olinar va ham `ORDER BY` uchun,
 * ham konflikt yechish sharti uchun ishlatilardi. `"9999-01-01"` yuborgan
 * mijoz abadiy g'olib bo'lardi; noto'g'ri format esa tartiblashni buzardi.
 *
 * @param {unknown} value
 * @param {number} maxSkewMs kelajakka ruxsat etilgan chekinish (standart 5 daqiqa)
 */
export function normalizeTimestamp(value, maxSkewMs = 5 * 60 * 1000) {
  const parsed = Date.parse(String(value ?? ''));
  const nowMs = Date.now();
  if (!Number.isFinite(parsed)) return new Date(nowMs).toISOString();
  // Kelajakdagi sanani server vaqtiga qisqartiramiz.
  if (parsed > nowMs + maxSkewMs) return new Date(nowMs).toISOString();
  // Juda eski sana (1970 dan oldin) ham ishonchsiz.
  if (parsed < 0) return new Date(nowMs).toISOString();
  return new Date(parsed).toISOString();
}
