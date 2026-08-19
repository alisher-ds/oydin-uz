/**
 * Zaxira nusxa haqida bir martalik eslatma.
 *
 * MUAMMO: Oydin ma'lumotni brauzerda saqlaydi. Bu tez va maxfiy, lekin
 * brauzer ma'lumoti tozalansa yoki telefon yo'qolsa — hammasi ketadi.
 * Foydalanuvchi buni odatda faqat yo'qotgandan keyin tushunadi.
 *
 * QARORLAR:
 *
 *  1. FAQAT BIR MARTA. Yopilgach hech qachon qaytmaydi. Takrorlanadigan
 *     eslatma — bu reklama, ishonch emas.
 *  2. Faqat ma'lumoti BOR odamga. Bo'sh makonda "zaxira oling" deyish
 *     ma'nosiz va qo'rqitadi.
 *  3. Faqat ma'lumot ancha vaqt qurilmadan CHIQMAGAN bo'lsa. Sinxronlagan
 *     yoki eksport qilgan odamga aytadigan gap yo'q.
 *
 * Qaror mantig'i sof funksiyada — UI'siz to'liq test qilinadi.
 */

import { readJson, writeJson } from './storage.js';

export const BACKUP_KEY = 'oydin-backup-v1';

const DAY = 86_400_000;
/** Ma'lumot shuncha kun qurilmadan chiqmasa — bir marta eslatamiz. */
export const QUIET_DAYS = 7;

const time = value => {
  const ms = Date.parse(value ?? '');
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Eslatma ko'rsatilsinmi.
 *
 * @param {object} input
 * @param {string} [input.firstSeenAt] qurilma birinchi ko'rilgan vaqt
 * @param {string} [input.lastBackupAt] oxirgi sinxronizatsiya yoki eksport
 * @param {boolean} [input.dismissed] foydalanuvchi yopganmi
 * @param {boolean} input.hasData saqlashga arziydigan narsa bormi
 * @param {number} [input.now]
 */
export function shouldRemind({
  firstSeenAt,
  lastBackupAt,
  dismissed = false,
  hasData = false,
  now = Date.now()
} = {}) {
  if (dismissed || !hasData) return false;

  // Hisob boshlanadigan nuqta: oxirgi zaxira, u bo'lmasa — birinchi tashrif.
  const since = time(lastBackupAt) ?? time(firstSeenAt);
  if (since === null) return false;

  return now - since >= QUIET_DAYS * DAY;
}

/** Saqlangan holat (mavjud bo'lmasa — bo'sh obyekt). */
export const readBackupState = () => readJson(BACKUP_KEY, {}) ?? {};

/** Qurilma birinchi marta ko'rilganini qayd etadi (faqat bir marta). */
export function noteFirstSeen(now = Date.now()) {
  const state = readBackupState();
  if (state.firstSeenAt) return state;
  const next = { ...state, firstSeenAt: new Date(now).toISOString() };
  writeJson(BACKUP_KEY, next, { silent: true });
  return next;
}

/** Ma'lumot qurilmadan chiqdi — sinxronlandi yoki eksport qilindi. */
export function noteBackup(now = Date.now()) {
  const next = { ...readBackupState(), lastBackupAt: new Date(now).toISOString() };
  writeJson(BACKUP_KEY, next, { silent: true });
  return next;
}

/** Foydalanuvchi yopdi — boshqa hech qachon ko'rsatilmaydi. */
export function dismissBackupNotice() {
  const next = { ...readBackupState(), dismissed: true };
  writeJson(BACKUP_KEY, next, { silent: true });
  return next;
}
