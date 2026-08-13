PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS spaces_v2 (
  id TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Yangi makon',
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (vault_id, id),
  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

INSERT INTO spaces_v2 (id, vault_id, title, data_json, updated_at)
SELECT id, vault_id, title, data_json, updated_at
FROM spaces;

DROP TABLE spaces;
ALTER TABLE spaces_v2 RENAME TO spaces;

CREATE INDEX IF NOT EXISTS idx_spaces_vault_updated
  ON spaces(vault_id, updated_at DESC);

PRAGMA foreign_keys = ON;
