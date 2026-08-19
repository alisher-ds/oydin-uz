/**
 * Tez yozilgan fikrlar ombori.
 *
 * Kalit ataylab `oydin-oqim` bo'lib qoldi: foydalanuvchilarda allaqachon
 * shu kalitda ma'lumot bor va uni ko'chirish keraksiz xavf. O'zgargan
 * narsa — nomi va joyi: alohida sahifa emas, Makon ichidagi panel.
 *
 * Qisqa muddat yashagan `oydin-inbox-v1` kaliti shu yerga birlashtiriladi,
 * shunda o'sha oraliqda yozilgan fikrlar ham yo'qolmaydi.
 */

import { readJson, removeKey, writeJson } from './storage.js';
import { uid } from './dom.js';

export const NOTES_KEY = 'oydin-oqim';
const LEGACY_KEY = 'oydin-inbox-v1';

export const MAX_LENGTH = 1000;

const isNote = value =>
  value != null && typeof value === 'object' && typeof value.text === 'string';

const normalize = raw =>
  (Array.isArray(raw) ? raw : []).filter(isNote).map(note => ({
    id: typeof note.id === 'string' ? note.id : uid(),
    text: note.text,
    createdAt: typeof note.createdAt === 'string' ? note.createdAt : new Date().toISOString(),
    ...(note.updatedAt ? { updatedAt: note.updatedAt } : {})
  }));

let migrated = false;

/**
 * Eski `oydin-inbox-v1` yozuvlarini asosiy omborga qo'shadi.
 * Bir marta bajariladi va eski kalit o'chiriladi.
 */
function migrateLegacy(current) {
  if (migrated) return current;
  migrated = true;

  const legacy = normalize(readJson(LEGACY_KEY, []));
  if (!legacy.length) return current;

  const seen = new Set(current.map(note => note.id));
  const merged = [...legacy.filter(note => !seen.has(note.id)), ...current];
  merged.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  writeJson(NOTES_KEY, merged);
  removeKey(LEGACY_KEY);
  return merged;
}

/** Barcha fikrlar, eng yangisidan boshlab. */
export function readNotes() {
  return migrateLegacy(normalize(readJson(NOTES_KEY, [])));
}

/** @returns {{ok: boolean, reason?: string}} */
export function writeNotes(notes) {
  const result = writeJson(NOTES_KEY, notes);
  return result?.ok === false ? { ok: false, reason: result.reason } : { ok: true };
}

/** Yangi fikr yaratadi (saqlamaydi — chaqiruvchi `writeNotes` bilan saqlaydi). */
export const makeNote = text => ({
  id: uid(),
  text: String(text).trim().slice(0, MAX_LENGTH),
  createdAt: new Date().toISOString()
});

export const notesCount = () => readNotes().length;
