/**
 * Backend yordamchilari — `functions/_lib/*`.
 *
 * Vault (kim), guard (qancha), sxema (qayerga) — va kalitni boshqarish
 * endpointi. Hammasi brauzersiz va tarmoqsiz test qilinadi.
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';

import { isValidToken, normalizeTimestamp, randomToken } from '../../functions/_lib/vault.js';
import { checkLimit, clientIp, ipBucket, json } from '../../functions/_lib/guard.js';
import { SCHEMA_STATEMENTS } from '../../functions/_lib/schema.js';
import { onRequestPost as vaultPost } from '../../functions/api/vault.js';

/* ------------------------------- vault ----------------------------------- */

describe('vault tokeni', () => {
  it('64 belgili hex token yaratadi', () => {
    const token = randomToken();
    assert.equal(token.length, 64);
    assert.match(token, /^[a-f0-9]{64}$/);
  });

  it('ketma-ket tokenlar takrorlanmaydi', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
    assert.equal(tokens.size, 200);
  });

  it('formatni tekshiradi', () => {
    assert.ok(isValidToken('a'.repeat(64)));
    assert.equal(isValidToken('A'.repeat(64)), false, 'katta harf rad etilishi kerak');
    assert.equal(isValidToken('a'.repeat(63)), false);
    assert.equal(isValidToken(''), false);
    assert.equal(isValidToken(null), false);
    assert.equal(isValidToken("' OR 1=1 --"), false);
  });
});

describe('normalizeTimestamp', () => {
  it('to‘g‘ri ISO sanani saqlaydi', () => {
    const iso = '2024-05-01T10:00:00.000Z';
    assert.equal(normalizeTimestamp(iso), iso);
  });

  it('KELAJAKDAGI sanani server vaqtiga qisqartiradi', () => {
    // Mijoz "9999" yuborib abadiy g‘olib bo‘lishga urinishi mumkin edi.
    const result = normalizeTimestamp('9999-01-01T00:00:00.000Z');
    assert.ok(Date.parse(result) <= Date.now() + 1000);
  });

  it('kichik soat farqiga (skew) ruxsat beradi', () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    assert.equal(normalizeTimestamp(soon), soon);
  });

  it('noto‘g‘ri qiymatni hozirgi vaqt bilan almashtiradi', () => {
    for (const bad of ['salom', '', null, undefined, {}, [], NaN]) {
      const result = normalizeTimestamp(bad);
      assert.ok(Number.isFinite(Date.parse(result)), `noto‘g‘ri natija: ${bad}`);
    }
  });

  it('1970 dan oldingi sanani rad etadi', () => {
    const result = normalizeTimestamp('1900-01-01T00:00:00.000Z');
    assert.ok(Date.parse(result) > 0);
  });
});

/* ------------------------- cheklovlar (guard) ---------------------------- */

/** Minimal D1 taqlidi: `rate_limits` jadvalining xotiradagi nusxasi. */
function fakeD1() {
  const rows = new Map();
  const calls = { prepare: 0 };

  return {
    calls,
    rows,
    prepare(sql) {
      calls.prepare += 1;
      let bound = [];
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async first() {
          if (sql.startsWith('SELECT hits, window_start FROM rate_limits')) {
            // "Peek" so'rovi — hisoblagichni oshirmaydi.
            const [bucket] = bound;
            const current = rows.get(bucket);
            return current ? { hits: current.hits, window_start: current.windowStart } : null;
          }
          if (sql.includes('INSERT INTO rate_limits')) {
            const [bucket, windowStart] = bound;
            const current = rows.get(bucket);
            const hits = current && current.windowStart === windowStart ? current.hits + 1 : 1;
            rows.set(bucket, { windowStart, hits });
            return { hits };
          }
          return null;
        },
        async run() {
          if (sql.startsWith('DELETE FROM rate_limits')) {
            const [cutoff] = bound;
            for (const [key, value] of rows) if (value.windowStart < cutoff) rows.delete(key);
          }
          return { success: true };
        }
      };
    }
  };
}

describe('json()', () => {
  it('himoya sarlavhalari bilan javob qaytaradi', async () => {
    const response = json({ ok: true });
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(await response.json(), { ok: true });
  });

  it('qo‘shimcha sarlavhalarni qo‘shadi', () => {
    const response = json({ error: 'x' }, 429, { 'retry-after': '60' });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
  });
});

describe('clientIp()', () => {
  const requestWith = headers => new Request('https://oydin-uz.pages.dev/api/sync', { headers });

  it('CF-Connecting-IP ni afzal ko‘radi', () => {
    assert.equal(
      clientIp(requestWith({ 'CF-Connecting-IP': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' })),
      '1.1.1.1'
    );
  });

  it('x-forwarded-for dagi birinchi IP ni oladi', () => {
    assert.equal(clientIp(requestWith({ 'x-forwarded-for': '3.3.3.3, 4.4.4.4' })), '3.3.3.3');
  });

  it('hech narsa bo‘lmasa "unknown" qaytaradi', () => {
    assert.equal(clientIp(requestWith({})), 'unknown');
  });
});

describe('checkLimit() — D1 asosidagi hisoblagich', () => {
  it('limitdan oshmaguncha ruxsat beradi', async () => {
    const db = fakeD1();
    const env = { OYDIN_DB: db };
    for (let i = 0; i < 5; i += 1) {
      const result = await checkLimit(env, 'ip:1.1.1.1:sync', 5, 60);
      assert.equal(result.ok, true, `${i + 1}-so‘rov rad etildi`);
    }
  });

  it('limitdan oshgach rad etadi', async () => {
    const env = { OYDIN_DB: fakeD1() };
    for (let i = 0; i < 3; i += 1) await checkLimit(env, 'ip:2.2.2.2:chat', 3, 60);
    const result = await checkLimit(env, 'ip:2.2.2.2:chat', 3, 60);
    assert.equal(result.ok, false);
    assert.ok(result.retryAfter > 0);
  });

  it('turli bucketlar bir-biriga xalaqit bermaydi', async () => {
    const env = { OYDIN_DB: fakeD1() };
    for (let i = 0; i < 3; i += 1) await checkLimit(env, 'ip:3.3.3.3:chat', 3, 60);
    // `chat` tugadi, lekin `sync` hali toza bo‘lishi kerak.
    assert.equal((await checkLimit(env, 'ip:3.3.3.3:chat', 3, 60)).ok, false);
    assert.equal((await checkLimit(env, 'ip:3.3.3.3:sync', 3, 60)).ok, true);
  });

  it('hisoblagich D1 da saqlanadi — izolyat xotirasida emas', async () => {
    const db = fakeD1();
    const env = { OYDIN_DB: db };
    await checkLimit(env, 'ip:4.4.4.4:sync', 10, 60);
    assert.ok(db.rows.has('ip:4.4.4.4:sync'), 'hisoblagich bazaga yozilmadi');
  });

  it('tabiiy rate limiter binding‘i bo‘lsa, u afzal ko‘riladi', async () => {
    const db = fakeD1();
    const env = {
      OYDIN_DB: db,
      OYDIN_RATE_LIMITER: { limit: async () => ({ success: false }) }
    };
    const result = await checkLimit(env, 'ip:5.5.5.5:sync', 100, 60);
    assert.equal(result.ok, false);
    assert.equal(db.calls.prepare, 0, 'binding bor bo‘lsa D1 ga murojaat qilinmasligi kerak');
  });

  it('binding ishlamasa D1 ga tushadi', async () => {
    const db = fakeD1();
    const env = {
      OYDIN_DB: db,
      OYDIN_RATE_LIMITER: {
        limit: async () => {
          throw new Error('binding ishlamadi');
        }
      }
    };
    assert.equal((await checkLimit(env, 'ip:6.6.6.6:sync', 10, 60)).ok, true);
    assert.ok(db.calls.prepare > 0, 'D1 zaxira yo‘li ishlamadi');
  });

  it('`count: false` hisoblagichni OSHIRMAYDI', async () => {
    const db = fakeD1();
    const env = { OYDIN_DB: db };
    // Yuz marta "peek" qilamiz — kvota yeyilmasligi kerak.
    for (let i = 0; i < 100; i += 1) {
      const result = await checkLimit(env, 'ip:8.8.8.8:vault-create', 3, 3600, { count: false });
      assert.equal(result.ok, true, `${i + 1}-tekshiruvda bloklandi`);
    }
    assert.equal(db.rows.has('ip:8.8.8.8:vault-create'), false, 'hisoblagich yozilib qolgan');
  });

  it('peek chegaraga yetganini to‘g‘ri ko‘radi', async () => {
    const env = { OYDIN_DB: fakeD1() };
    for (let i = 0; i < 3; i += 1) await checkLimit(env, 'ip:9.9.9.9:vault-create', 3, 3600);
    const peek = await checkLimit(env, 'ip:9.9.9.9:vault-create', 3, 3600, { count: false });
    assert.equal(peek.ok, false, 'chegara to‘lgani sezilmadi');
  });

  it('xotiradagi zaxirada ham `count: false` oshirmaydi', async () => {
    const env = {};
    for (let i = 0; i < 50; i += 1) {
      assert.equal((await checkLimit(env, 'ip:7.7.7.9:vc', 2, 60, { count: false })).ok, true);
    }
  });

  it('D1 ham bo‘lmasa xotiradagi zaxira ishlaydi', async () => {
    const env = {};
    for (let i = 0; i < 2; i += 1) {
      assert.equal((await checkLimit(env, 'ip:7.7.7.7:sync', 2, 60)).ok, true);
    }
    assert.equal((await checkLimit(env, 'ip:7.7.7.7:sync', 2, 60)).ok, false);
  });
});

describe('ipBucket() — IP ochiq saqlanmasligi', () => {
  const makeRequest = ip =>
    new Request('https://oydin-uz.pages.dev/api/sync', {
      headers: { 'CF-Connecting-IP': ip }
    });

  it('bucket kalitida OCHIQ IP bo‘lmaydi', async () => {
    const bucket = await ipBucket(makeRequest('203.0.113.42'), {}, 'sync');
    assert.ok(!bucket.includes('203.0.113.42'), `IP ochiq qoldi: ${bucket}`);
    assert.match(bucket, /^ip:[0-9a-f]{16}:sync$/);
  });

  it('turli IP — turli bucket (cheklov baribir ishlaydi)', async () => {
    const [a, b] = await Promise.all([
      ipBucket(makeRequest('203.0.113.1'), {}, 'sync'),
      ipBucket(makeRequest('203.0.113.2'), {}, 'sync')
    ]);
    assert.notEqual(a, b);
  });

  it('bir xil IP — bir xil bucket (aks holda cheklov ishlamaydi)', async () => {
    const [a, b] = await Promise.all([
      ipBucket(makeRequest('203.0.113.7'), {}, 'chat'),
      ipBucket(makeRequest('203.0.113.7'), {}, 'chat')
    ]);
    assert.equal(a, b);
  });

  it('tuz o‘zgarsa iz ham o‘zgaradi — hash qaytarib bo‘lmasin', async () => {
    const [a, b] = await Promise.all([
      ipBucket(makeRequest('203.0.113.9'), { IP_SALT: 'birinchi' }, 'sync'),
      ipBucket(makeRequest('203.0.113.9'), { IP_SALT: 'ikkinchi' }, 'sync')
    ]);
    assert.notEqual(a, b);
  });
});

/* -------------------------------- sxema ---------------------------------- */

const TABLES = ['vaults', 'spaces', 'space_deletions', 'rate_limits', 'stats'];

/** Sxemani (jadval + indeks nomlari va ustunlari) o'qib olamiz. */
function describeSchema(db) {
  const objects = db
    .prepare(
      `SELECT type, name FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`
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

const build = () => {
  const db = new DatabaseSync(':memory:');
  for (const sql of SCHEMA_STATEMENTS) db.exec(sql);
  return db;
};

describe('sxema', () => {
  it('barcha jadvallarni yaratadi', () => {
    const db = build();
    const schema = describeSchema(db);
    for (const table of TABLES) {
      assert.ok(schema[`table:${table}`], `${table} jadvali yaratilmadi`);
    }
    db.close();
  });

  it('kerakli indekslarni yaratadi', () => {
    const db = build();
    const schema = describeSchema(db);
    for (const index of [
      'idx_spaces_vault_updated',
      'idx_space_deletions_vault',
      'idx_rate_limits_window'
    ]) {
      assert.ok(schema[`index:${index}`], `${index} indeksi yaratilmadi`);
    }
    db.close();
  });

  it('ikki marta ishga tushirish xavfsiz (idempotent)', () => {
    const db = build();
    db.exec("INSERT INTO vaults VALUES ('v1','h1','2026-01-01','2026-01-01')");
    for (const sql of SCHEMA_STATEMENTS) db.exec(sql);
    const rows = db.prepare('SELECT COUNT(*) AS n FROM vaults').get();
    assert.equal(rows.n, 1, 'mavjud ma\u2018lumot yo\u2018qoldi');
    db.close();
  });

  it('statistika jadvalida faqat sanoq bor \u2014 shaxsiy ustun yo\u2018q', () => {
    const db = build();
    const ustunlar = describeSchema(db)['table:stats'].map(c => c.split(':')[0]);
    assert.deepEqual(ustunlar.sort(), ['day', 'event', 'hits']);
    db.close();
  });
});

/* ------------------------ kalitni boshqarish ----------------------------- */

/**
 * Kalit bir marta yaratilgach abadiy amal qilardi: uni ko'rgan har kim
 * serverdagi nusxaga cheksiz kira olardi, "uzish" esa faqat brauzerdagi
 * nusxani o'chirardi.
 */
describe('POST /api/vault', () => {
  const TOKEN = 'a'.repeat(64);

  /** D1 o'rnini bosuvchi: bajarilgan SQL ni yozib boradi. */
  const fakeDb = ({ vaultFound = true } = {}) => {
    const ran = [];
    return {
      ran,
      env: {
        OYDIN_DB: {
          prepare(sql) {
            return {
              bind(...args) {
                ran.push({ sql: sql.replace(/\s+/g, ' ').trim(), args });
                return this;
              },
              async first() {
                if (sql.includes('FROM vaults')) return vaultFound ? { id: 'vault_1' } : null;
                return null;
              },
              async run() {
                return { success: true };
              }
            };
          },
          async batch(list) {
            return list.map(() => ({ success: true }));
          }
        }
      }
    };
  };

  const ask = (env, { action = 'rotate', token = TOKEN } = {}) =>
    vaultPost({
      request: new Request('https://oydin-uz.pages.dev/api/vault', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Origin: 'https://oydin-uz.pages.dev',
          ...(token ? { 'X-Oydin-Vault': token } : {})
        },
        body: JSON.stringify({ action })
      }),
      env
    });

  it('kalitsiz so‘rovni rad etadi', async () => {
    const { env } = fakeDb();
    assert.equal((await ask(env, { token: '' })).status, 401);
  });

  it('buzuq kalitni rad etadi', async () => {
    const { env } = fakeDb();
    assert.equal((await ask(env, { token: 'qisqa' })).status, 401);
  });

  it('mavjud bo‘lmagan kalit ham 401 — vault borligi oshkor bo‘lmasin', async () => {
    const { env } = fakeDb({ vaultFound: false });
    const response = await ask(env);
    assert.equal(response.status, 401);
    assert.ok(!(await response.json()).error.includes('topilmadi vault'));
  });

  it('noma’lum amalni bajarmaydi', async () => {
    const { env, ran } = fakeDb();
    assert.equal((await ask(env, { action: 'delete-everything' })).status, 400);

    // `rate_limits` ga tegishi normal (bu `guard()` ning hisoblagichi).
    // Vault ma'lumotiga esa umuman tegilmasligi kerak.
    const tegdi = ran.filter(item => /vaults|spaces|space_deletions/.test(item.sql));
    assert.deepEqual(tegdi, [], 'vault ma’lumotiga tegildi');
  });

  it('rotate — YANGI kalit qaytaradi va u eskisidan farq qiladi', async () => {
    const { env } = fakeDb();
    const data = await (await ask(env, { action: 'rotate' })).json();
    assert.match(data.token, /^[a-f0-9]{64}$/);
    assert.notEqual(data.token, TOKEN);
  });

  it('rotate — bazada `token_hash` YANGILANADI (eski kalit o‘ladi)', async () => {
    const { env, ran } = fakeDb();
    await ask(env, { action: 'rotate' });

    const update = ran.find(item => item.sql.startsWith('UPDATE vaults SET token_hash'));
    assert.ok(update, 'token_hash yangilanmadi — eski kalit ishlayveradi');
    assert.match(update.args[0], /^[a-f0-9]{64}$/);
  });

  it('revoke — uchta jadvaldan ham o‘chiradi, yetim qator qolmaydi', async () => {
    const { env, ran } = fakeDb();
    const response = await ask(env, { action: 'revoke' });
    assert.equal(response.status, 200);

    const deletes = ran.filter(item => item.sql.startsWith('DELETE')).map(item => item.sql);
    for (const table of ['spaces', 'space_deletions', 'vaults']) {
      assert.ok(
        deletes.some(sql => sql.includes(`FROM ${table} `)),
        `${table} tozalanmadi`
      );
    }
  });

  it('revoke — faqat O‘SHA vaultning ma’lumotini o‘chiradi', async () => {
    const { env, ran } = fakeDb();
    await ask(env, { action: 'revoke' });

    for (const item of ran.filter(entry => entry.sql.startsWith('DELETE'))) {
      assert.deepEqual(item.args, ['vault_1'], `keng o‘chirish: ${item.sql}`);
    }
  });
});
