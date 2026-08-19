/**
 * Eski fikrni qaytarish.
 *
 * Yozilgan fikr vaqt o'tishi bilan o'lik bo'lib qoladi: hech kim eski
 * makonni ochib qayta o'qimaydi. Bu modul bittasini tanlab, yuzaga
 * chiqaradi — "bir vaqtlar siz shuni yozgan edingiz".
 *
 * Tanlash mantig'i ataylab UI'dan ajratilgan va SOF: kirish ma'lumoti
 * va vaqt berilsa, natija har doim bir xil. Shu sababli uni to'liq
 * test qilish mumkin.
 *
 * Qoidalar bezovta qilmaslikka qaratilgan:
 *  - fikr yetarlicha eski bo'lishi kerak (yangi yozilgani esda turadi);
 *  - kuniga bir martadan ko'p ko'rsatilmaydi;
 *  - bir marta ko'rsatilgani ancha vaqt qaytarilmaydi;
 *  - mos narsa bo'lmasa — HECH NARSA ko'rsatilmaydi, bo'sh holat ham yo'q.
 */

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
 * @returns {null | {id: string, text: string, createdAt: string, source: 'note'|'card', mapId?: string, ageDays: number}}
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
