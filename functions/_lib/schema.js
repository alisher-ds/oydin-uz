/**
 * Sxema bootstrap — bazadagi jadvallar mavjudligini kafolatlaydi.
 *
 * Nima uchun kerak:
 * Deploy va migratsiya alohida qadamlar. Kod yangilanib, `wrangler d1
 * migrations apply --remote` unutilsa, `/api/sync` tushunarsiz `502` bilan
 * tushardi va foydalanuvchi sababini bilmasdi. Endi API o'zi kerakli
 * jadvallarni yaratadi — qo'lda qadam shart emas.
 *
 * Barcha iboralar `IF NOT EXISTS` bilan, ya'ni takroriy chaqirish xavfsiz va
 * mavjud ma'lumotga tegmaydi. Har izolyatda faqat bir marta bajariladi.
 *
 * Bu fayl sxemaning YAGONA manbai. Ilgari `migrations/` papkasi ham bor
 * edi va ikkalasi bir xil bo'lishi kerak edi — endi ajralib ketadigan
 * ikkinchi nusxa yo'q.
 */

export const SCHEMA_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS vaults (
     id TEXT PRIMARY KEY,
     token_hash TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS spaces (
     id TEXT NOT NULL,
     vault_id TEXT NOT NULL,
     title TEXT NOT NULL DEFAULT 'Yangi makon',
     data_json TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (vault_id, id),
     FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_spaces_vault_updated
     ON spaces(vault_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS space_deletions (
     vault_id TEXT NOT NULL,
     space_id TEXT NOT NULL,
     deleted_at TEXT NOT NULL,
     PRIMARY KEY (vault_id, space_id),
     FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_space_deletions_vault
     ON space_deletions(vault_id, deleted_at DESC)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
     bucket TEXT PRIMARY KEY,
     window_start INTEGER NOT NULL,
     hits INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_rate_limits_window
     ON rate_limits(window_start)`,
  // Anonim statistika: foydalanuvchi yozuvi emas, faqat kunlik sanoq.
  // Bu jadvaldagi qatorni birorta odamga bog'lab bo'lmaydi.
  `CREATE TABLE IF NOT EXISTS stats (
     day   TEXT NOT NULL,
     event TEXT NOT NULL,
     hits  INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (day, event)
   )`
]);

/** Har izolyat uchun bir marta bajariladigan va'da. */
let bootstrap = null;

/**
 * Jadvallar mavjudligini kafolatlaydi.
 * @returns {Promise<boolean>} sxema ishlatishga tayyormi
 */
export function ensureSchema(env) {
  if (!env?.OYDIN_DB) return Promise.resolve(false);

  bootstrap ??= env.OYDIN_DB.batch(SCHEMA_STATEMENTS.map(sql => env.OYDIN_DB.prepare(sql)))
    .then(() => true)
    .catch(error => {
      console.error('Sxema tayyorlanmadi:', error);
      // Keyingi so'rov qayta urinib ko'rsin.
      bootstrap = null;
      return false;
    });

  return bootstrap;
}

/** Testlar uchun: keshni tozalaydi. */
export function _resetSchemaCache() {
  bootstrap = null;
}
