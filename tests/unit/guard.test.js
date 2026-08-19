import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkLimit, clientIp, json } from '../../functions/_lib/guard.js';

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
