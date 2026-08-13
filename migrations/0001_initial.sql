PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Yangi makon',
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spaces_vault_updated
  ON spaces(vault_id, updated_at DESC);
