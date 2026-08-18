-- Oydin 0003 — o'chirish tombstone'lari va haqiqiy rate limiting.
--
-- Nima uchun kerak:
--  1. Ilgari server hech qachon makonni o'chirmasdi va har sinxronizatsiyada
--     BARCHA makonlarni qaytarardi. Natijada bir qurilmada o'chirilgan makon
--     keyingi sinxronizatsiyada qaytib kelardi.
--  2. Rate limiting Worker izolyati xotirasidagi `Map` da edi. Cloudflare'da
--     har bir izolyat va har bir colo o'z nusxasiga ega — ya'ni global cheklov
--     amalda umuman yo'q edi. Endi hisoblagich D1 da, hamma uchun bitta.

PRAGMA foreign_keys = ON;

-- O'chirilgan makonlar. Mijoz tombstone yuboradi, server esa uni boshqa
-- qurilmalarga tarqatadi.
CREATE TABLE IF NOT EXISTS space_deletions (
  vault_id   TEXT NOT NULL,
  space_id   TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (vault_id, space_id),
  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_space_deletions_vault
  ON space_deletions(vault_id, deleted_at DESC);

-- Rate limiting: bitta oyna uchun bitta qator.
-- `bucket` — masalan `ip:1.2.3.4:chat` yoki `vault:vault_xxx:sync`.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON rate_limits(window_start);
