/**
 * Turtkilar — foydalanuvchiga o'zi so'ramagan narsani ko'rsatish qoidalari.
 *
 * Ikkita turtki bor va ikkalasining ham eng muhim vazifasi BEZOVTA
 * QILMASLIK:
 *
 *  1. Eski fikrni qaytarish — unutilgan yozuvni yuzaga chiqarish;
 *  2. Zaxira eslatmasi — ma'lumot faqat shu qurilmada ekanini aytish.
 *
 * Ikkalasining ham qaror mantig'i SOF: kirish ma'lumoti va vaqt berilsa,
 * natija har doim bir xil. Shuning uchun ular UI'siz to'liq test
 * qilinadi va aynan shu sabab bitta faylda — bu fayl "qachon gapiramiz"
 * degan yagona savolga javob beradi.
 */

import { readJson, writeJson } from './storage.js';

/* ------------------------ eski fikrni qaytarish -------------------------- */

export const RECALL_KEY = 'oydin-recall-v1';

const DAY = 86_400_000;

/** Fikr shuncha kundan eski bo'lsa, uni unutilgan deb hisoblaymiz. */
export const MIN_AGE_DAYS = 14;
/** Bir marta ko'rsatilgan fikr shuncha kun qaytarilmaydi. */
export const COOLDOWN_DAYS = 45;

const time = value => {
  const ms = Date.parse(value ?? '');
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Makonlar va yozuvlardan bitta nomzodni tanlaydi.
 *
 * @param {object} input
 * @param {Array}  input.notes  Tez yozish ro'yxati
 * @param {object} input.maps   `oydin-maps` ko'rinishidagi obyekt
 * @param {object} input.state  {lastShownAt, seen: {id: iso}}
 * @param {number} input.now    Hozirgi vaqt (ms)
 * @returns {null | {id: string, text: string, createdAt: string,
 *   source: 'note'|'card', mapId?: string, ageDays: number}}
 */
export function pickRecall({ notes = [], maps = {}, state = {}, now = Date.now() }) {
  const lastShown = time(state.lastShownAt);
  // Kuniga bir marta yetarli.
  if (lastShown !== null && now - lastShown < DAY) return null;

  const seen = state.seen ?? {};
  const candidates = [];

  for (const note of notes) {
    if (!note || typeof note.text !== 'string' || !note.text.trim()) continue;
    const created = time(note.createdAt);
    if (created === null) continue;
    candidates.push({
      id: String(note.id),
      text: note.text,
      createdAt: note.createdAt,
      created,
      source: 'note'
    });
  }

  for (const [mapId, map] of Object.entries(maps)) {
    for (const card of map?.cards ?? []) {
      if (!card || typeof card.text !== 'string' || !card.text.trim()) continue;
      const created = time(card.createdAt ?? map?.createdAt);
      if (created === null) continue;
      candidates.push({
        id: String(card.id),
        text: card.text,
        createdAt: card.createdAt ?? map.createdAt,
        created,
        source: 'card',
        mapId
      });
    }
  }

  const ready = candidates.filter(item => {
    if (now - item.created < MIN_AGE_DAYS * DAY) return false;
    const shownAt = time(seen[item.id]);
    return shownAt === null || now - shownAt >= COOLDOWN_DAYS * DAY;
  });

  if (!ready.length) return null;

  // Eng eskisi birinchi: aynan u ko'proq unutilgan bo'ladi.
  ready.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  const chosen = ready[0];

  return {
    id: chosen.id,
    text: chosen.text,
    createdAt: chosen.createdAt,
    source: chosen.source,
    ...(chosen.mapId ? { mapId: chosen.mapId } : {}),
    ageDays: Math.floor((now - chosen.created) / DAY)
  };
}

/** Ko'rsatilgandan keyingi yangi holat. Eski yozuvlar tozalab turiladi. */
export function markShown(state = {}, id, now = Date.now()) {
  const seen = { ...(state.seen ?? {}), [id]: new Date(now).toISOString() };

  for (const [key, value] of Object.entries(seen)) {
    const shownAt = time(value);
    if (shownAt !== null && now - shownAt > COOLDOWN_DAYS * 2 * DAY) delete seen[key];
  }

  return { lastShownAt: new Date(now).toISOString(), seen };
}

/** "3 hafta oldin" ko'rinishidagi matn. */
export function humanAge(days) {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return years === 1 ? 'bir yil oldin' : `${years} yil oldin`;
  }
  if (days >= 60) return `${Math.floor(days / 30)} oy oldin`;
  if (days >= 30) return 'bir oy oldin';
  if (days >= 14) return `${Math.floor(days / 7)} hafta oldin`;
  return `${days} kun oldin`;
}

/* -------------------------- zaxira eslatmasi ----------------------------- */

export const BACKUP_KEY = 'oydin-backup-v1';

/** Ma'lumot shuncha kun qurilmadan chiqmasa — bir marta eslatamiz. */
export const QUIET_DAYS = 7;

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
