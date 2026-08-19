import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { describe, it } from 'node:test';

import { SCHEMA_STATEMENTS } from '../../functions/_lib/schema.js';

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

/** Sxemani (jadval + indeks nomlari va ustunlari) o'qib olamiz. */
function describeSchema(db) {
  const objects = db
    .prepare(
      `SELECT type, name FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' AND name != 'd1_migrations'
       ORDER BY type, name`
    )
    .all();

  const out = {};
  for (const { type, name } of objects) {
    if (type === 'table') {
      out[`table:${name}`] = db
        .prepare(`PRAGMA table_info(${name})`)
        .all()
        .map(c => `${c.name}:${c.type}:${c.notnull}:${c.pk}`)
        .sort();
    } else if (type === 'index') {
      out[`index:${name}`] = true;
    }
  }
  return out;
}

function applyMigrations(db) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return files;
}

describe('sxema', () => {
  it('migratsiyalar toza bazada xatosiz qo‘llanadi', () => {
    const db = new DatabaseSync(':memory:');
    const files = applyMigrations(db);
    assert.ok(files.length >= 3, 'migratsiya fayllari topilmadi');
    const schema = describeSchema(db);
    for (const table of ['vaults', 'spaces', 'space_deletions', 'rate_limits', 'stats']) {
      assert.ok(schema[`table:${table}`], `${table} jadvali yaratilmadi`);
    }
    db.close();
  });

  it('bootstrap DDL ham xuddi shu jadvallarni yaratadi', () => {
    const db = new DatabaseSync(':memory:');
    for (const sql of SCHEMA_STATEMENTS) db.exec(sql);
    const schema = describeSchema(db);
    for (const table of ['vaults', 'spaces', 'space_deletions', 'rate_limits', 'stats']) {
      assert.ok(schema[`table:${table}`], `${table} jadvali yaratilmadi`);
    }
    db.close();
  });

  /**
   * Eng muhim test: `functions/_lib/schema.js` va `migrations/` ajralib
   * ketmasligi kerak. Biri o'zgarib, ikkinchisi qolib ketsa — CI qizil bo'ladi.
   */
  it('bootstrap va migratsiyalar BIR XIL sxema beradi', () => {
    const fromMigrations = new DatabaseSync(':memory:');
    applyMigrations(fromMigrations);
    const a = describeSchema(fromMigrations);
    fromMigrations.close();

    const fromBootstrap = new DatabaseSync(':memory:');
    for (const sql of SCHEMA_STATEMENTS) fromBootstrap.exec(sql);
    const b = describeSchema(fromBootstrap);
    fromBootstrap.close();

    assert.deepEqual(
      Object.keys(a).sort(),
      Object.keys(b).sort(),
      'jadval/indeks ro‘yxati mos kelmadi'
    );
    for (const key of Object.keys(a)) {
      assert.deepEqual(b[key], a[key], `${key} ustunlari mos kelmadi`);
    }
  });

  it('bootstrap ni ikki marta ishga tushirish xavfsiz (idempotent)', () => {
    const db = new DatabaseSync(':memory:');
    for (const sql of SCHEMA_STATEMENTS) db.exec(sql);
    db.exec("INSERT INTO vaults VALUES ('v1','h1','2026-01-01','2026-01-01')");
    for (const sql of SCHEMA_STATEMENTS) db.exec(sql);
    const rows = db.prepare('SELECT COUNT(*) AS n FROM vaults').get();
    assert.equal(rows.n, 1, 'mavjud ma‘lumot yo‘qoldi');
    db.close();
  });
});
