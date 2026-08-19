/**
 * Anonim statistika.
 *
 * Bu yerdagi eng muhim testlar — MAXFIYLIK testlari. Ular kod
 * o'zgarganda ham quyidagi va'dalar buzilmasligini kafolatlaydi:
 *  - serverga faqat yopiq ro'yxatdagi hodisa nomi ketadi;
 *  - fikr matni hodisa nomi sifatida "yashirincha" o'tolmaydi;
 *  - foydalanuvchi o'chirib qo'yishi mumkin va bu tanlov ustun turadi.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STAT_EVENTS, decide, planVisit } from '../../assets/js/core/stat.js';
import { ALLOWED_EVENTS, normalizeEvents, onRequestGet } from '../../functions/api/stat.js';

describe('mijoz va server ro‘yxati', () => {
  it('BIR XIL bo‘ladi — ajralib ketsa hodisa jimgina yo‘qoladi', () => {
    assert.deepEqual([...STAT_EVENTS].sort(), [...ALLOWED_EVENTS].sort());
  });

  it('hodisa nomlari matn saqlamaydi — hammasi qisqa va oldindan ma’lum', () => {
    for (const name of STAT_EVENTS) {
      assert.ok(name.length <= 20, `${name} juda uzun`);
      assert.match(name, /^[a-z:]+$/, `${name} kutilmagan belgilar saqlaydi`);
    }
  });
});

describe('planVisit()', () => {
  it('birinchi tashrifda faqat "tashrif"', () => {
    const { events, next } = planVisit(null, '2026-08-19');
    assert.deepEqual(events, ['tashrif']);
    assert.deepEqual(next, { day: '2026-08-19' });
  });

  it('boshqa kuni qaytgan odam "qaytish" ham beradi', () => {
    const { events } = planVisit({ day: '2026-08-01' }, '2026-08-19');
    assert.deepEqual(events, ['tashrif', 'qaytish']);
  });

  it('o‘sha kuni ikkinchi marta ochilsa hech narsa yuborilmaydi', () => {
    const { events, next } = planVisit({ day: '2026-08-19' }, '2026-08-19');
    assert.deepEqual(events, []);
    assert.equal(next, null);
  });

  it('buzuq holatdan yiqilmaydi', () => {
    assert.deepEqual(planVisit(undefined, '2026-08-19').events, ['tashrif']);
    assert.deepEqual(planVisit({}, '2026-08-19').events, ['tashrif']);
  });
});

describe('decide() — foydalanuvchi tanlovi', () => {
  it('"off" hamma narsadan ustun', () => {
    assert.equal(decide({ flag: 'off', hostname: 'oydin-uz.pages.dev' }), false);
    assert.equal(decide({ flag: 'off', dnt: null, hostname: 'oydin-uz.pages.dev' }), false);
  });

  it('Do Not Track hurmat qilinadi', () => {
    assert.equal(decide({ dnt: '1', hostname: 'oydin-uz.pages.dev' }), false);
    assert.equal(decide({ dnt: 'yes', hostname: 'oydin-uz.pages.dev' }), false);
  });

  it('lokal ishlab chiqish statistikani ifloslantirmaydi', () => {
    assert.equal(decide({ hostname: 'localhost' }), false);
    assert.equal(decide({ hostname: '127.0.0.1' }), false);
    assert.equal(decide({ hostname: '' }), false);
  });

  it('aniq rozilik lokalda ham yoqadi — sinov uchun kerak', () => {
    assert.equal(decide({ flag: 'on', hostname: 'localhost' }), true);
  });

  it('odatiy holatda yoqilgan', () => {
    assert.equal(decide({ hostname: 'oydin-uz.pages.dev' }), true);
  });
});

describe('normalizeEvents() — serverning himoyasi', () => {
  it('notanish nomni QABUL QILMAYDI', () => {
    assert.deepEqual(normalizeEvents(['fikr', 'ixtiyoriy-nom']), ['fikr']);
  });

  it('fikr matnini hodisa nomi sifatida o‘tkazib bo‘lmaydi', () => {
    const maxfiy = 'Ertaga shifokorga borishim kerak';
    assert.deepEqual(normalizeEvents([maxfiy, 'tashrif']), ['tashrif']);
  });

  it('takrorni bir marta sanaydi', () => {
    assert.deepEqual(normalizeEvents(['fikr', 'fikr', 'fikr']), ['fikr']);
  });

  it('juda uzun ro‘yxatni kesadi', () => {
    const many = Array.from({ length: 500 }, () => 'fikr');
    assert.deepEqual(normalizeEvents(many), ['fikr']);
  });

  it('massiv bo‘lmagan kirishdan yiqilmaydi', () => {
    for (const bad of [null, undefined, 'fikr', 42, {}, { e: 'fikr' }]) {
      assert.deepEqual(normalizeEvents(bad), []);
    }
  });

  it('ro‘yxatdagi hamma nom qabul qilinadi', () => {
    assert.equal(normalizeEvents([...ALLOWED_EVENTS]).length, ALLOWED_EVENTS.length);
  });
});

/**
 * `GET /api/stat` — kim, qanday va nima ko'rishi.
 *
 * Bu yerda uchta xavf tekshiriladi: (1) endpoint tasodifan ochiq qolib
 * ketmasin, (2) brauzer sahifa, dastur JSON olsin, (3) noto'g'ri token
 * "topilmadi" deb javob bersin — "noto'g'ri parol" deb emas, aks holda
 * endpoint mavjudligi oshkor bo'ladi.
 */
describe('GET /api/stat', () => {
  /** Minimal D1 o'rnini bosuvchi. */
  const fakeDb = rows => ({
    prepare: () => ({
      bind: () => ({ all: async () => ({ results: rows }), first: async () => null }),
      first: async () => null,
      run: async () => {}
    }),
    batch: async () => {}
  });

  const ask = (env, { accept = 'application/json', token = 'kalit' } = {}) =>
    onRequestGet({
      request: new Request(`https://oydin-uz.pages.dev/api/stat?token=${token}`, {
        headers: { accept }
      }),
      env
    });

  const ROWS = [
    { day: '2026-08-19', event: 'tashrif', hits: 5 },
    { day: '2026-08-19', event: 'fikr', hits: 2 }
  ];

  it('STATS_TOKEN o‘rnatilmagan bo‘lsa endpoint umuman yo‘q', async () => {
    const response = await ask({ OYDIN_DB: fakeDb(ROWS) });
    assert.equal(response.status, 404);
  });

  it('noto‘g‘ri token ham 404 — endpoint borligi oshkor bo‘lmasin', async () => {
    const env = { STATS_TOKEN: 'kalit', OYDIN_DB: fakeDb(ROWS) };
    const response = await ask(env, { token: 'boshqa' });
    assert.equal(response.status, 404);
  });

  it('to‘g‘ri token bilan JSON qaytaradi', async () => {
    const env = { STATS_TOKEN: 'kalit', OYDIN_DB: fakeDb(ROWS) };
    const response = await ask(env);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');

    const data = await response.json();
    assert.equal(data.jami.tashrif, 5);
    assert.equal(data.kunlar['2026-08-19'].fikr, 2);
  });

  it('brauzer so‘rasa — o‘qiladigan sahifa', async () => {
    const env = { STATS_TOKEN: 'kalit', OYDIN_DB: fakeDb(ROWS) };
    const response = await ask(env, { accept: 'text/html,application/xhtml+xml' });

    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.match(html, /<!doctype html>/);
    assert.ok(html.includes('<b>5</b>'), 'tashrif soni ko‘rinmadi');
  });

  it('sahifa keshlanmaydi — raqamlar eskirib qolmasin', async () => {
    const env = { STATS_TOKEN: 'kalit', OYDIN_DB: fakeDb(ROWS) };
    const response = await ask(env, { accept: 'text/html' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});
