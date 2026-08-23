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

import { STAT_EVENTS, decide, planVisit } from '../../assets/js/core/app.js';
import { ALLOWED_EVENTS, normalizeEvents, onRequestGet } from '../../functions/api/stat.js';
import { renderStatsPage } from '../../functions/_lib/stats-page.js';

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

const sample = (total, byDay = {}) =>
  renderStatsPage({ days: 30, since: '2026-07-20', total, byDay });

describe('renderStatsPage()', () => {
  /**
   * Yangi hodisa qo'shilib, unga nom berilmasa, jadvalda texnik nomi
   * (`qollanma:boshlandi`) chiqib qoladi. Aynan shu bo'ldi ham.
   */
  it('HAR BIR hodisaning odam o‘qiydigan nomi bor', () => {
    const html = renderStatsPage({
      days: 30,
      since: '2026-07-20',
      total: Object.fromEntries(ALLOWED_EVENTS.map(name => [name, 1]))
    });

    const nomsiz = ALLOWED_EVENTS.filter(name => {
      // Jadvalda "Nomi" ustuni texnik nomni ko'rsatadi — u har doim bor.
      // Birinchi ustunda esa texnik nom TURMASLIGI kerak.
      const row = html.match(new RegExp(`<tr><td>([^<]*)</td><td class="code">${name}<`));
      return !row || row[1] === name;
    });
    assert.deepEqual(nomsiz, [], `nomsiz hodisalar: ${nomsiz.join(', ')}`);
  });

  it('CSP buzadigan inline uslub ISHLATMAYDI', () => {
    const html = sample({ tashrif: 5, fikr: 2 }, { '2026-08-19': { tashrif: 5 } });
    assert.ok(!html.includes('<style'), '<style> bloki CSP tomonidan bloklanadi');
    assert.ok(!/\sstyle=/.test(html), 'style="..." atributi CSP tomonidan bloklanadi');
  });

  it('uslub va tokenlarni tashqi fayldan oladi', () => {
    const html = sample({ tashrif: 1 });
    assert.match(html, /assets\/css\/tokens\.css/);
    assert.match(html, /assets\/css\/stat\.css/);
  });

  it('qidiruv tizimlariga indekslanmaydi', () => {
    assert.match(sample({ tashrif: 1 }), /noindex/);
  });

  it('ma’lumot yo‘q bo‘lsa halol bo‘sh holat ko‘rsatadi', () => {
    const html = sample({});
    assert.match(html, /Hali ma’lumot yo‘q/);
    assert.ok(!html.includes('<table'), 'bo‘sh jadval chizilmasligi kerak');
    assert.ok(!html.includes('<svg'), 'bo‘sh diagramma chizilmasligi kerak');
  });

  it('katta raqamlarni chiqaradi', () => {
    const html = sample({ tashrif: 96, qaytish: 31, fikr: 38, tez: 19 });
    for (const value of ['96', '31', '38', '19']) {
      assert.ok(html.includes(`<b>${value}</b>`), `${value} ko‘rinmadi`);
    }
  });

  it('ulushni to‘g‘ri hisoblaydi: (fikr + tez) / tashrif', () => {
    // 38 + 12 = 50, 100 tashrifdan → 50%
    assert.match(sample({ tashrif: 100, fikr: 38, tez: 12 }), /<strong>50%<\/strong>/);
  });

  it('tashrif nol bo‘lsa nolga bo‘lmaydi', () => {
    const html = sample({ fikr: 3 });
    assert.ok(!html.includes('NaN'), 'NaN chiqdi');
    assert.ok(!html.includes('Infinity'), 'Infinity chiqdi');
  });

  it('har bir kun uchun bitta ustun chizadi', () => {
    const byDay = {
      '2026-08-17': { tashrif: 3 },
      '2026-08-18': { tashrif: 7 },
      '2026-08-19': { tashrif: 5 }
    };
    const html = sample({ tashrif: 15 }, byDay);
    assert.equal((html.match(/<rect /g) ?? []).length, 3);
  });

  it('ustunlar eski→yangi tartibda va sanalar chetlarda', () => {
    const byDay = {
      '2026-08-19': { tashrif: 1 },
      '2026-08-01': { tashrif: 9 }
    };
    const html = sample({ tashrif: 10 }, byDay);
    const axis = html.match(/<p class="axis">(.*?)<\/p>/)?.[1] ?? '';
    assert.match(axis, /1 avg[\s\S]*19 avg/);
  });

  it('nol qiymatli kun ham ko‘rinadigan ustun beradi', () => {
    const html = sample(
      { tashrif: 4 },
      { '2026-08-18': { tashrif: 0 }, '2026-08-19': { tashrif: 4 } }
    );
    assert.ok(!/height="0"/.test(html), 'nol balandlik — ustun ko‘rinmay qoladi');
  });

  it('notanish hodisa nomi HTML sifatida bajarilmaydi', () => {
    const html = renderStatsPage({
      days: 30,
      since: '2026-07-20',
      total: { '<img src=x onerror=alert(1)>': 3 }
    });
    assert.ok(!html.includes('<img src=x'), 'xavfli belgilar ekranlanmadi');
    assert.match(html, /&lt;img/);
  });

  /**
   * Yalang'och raqam ("47 tashrif") hech narsani anglatmaydi — u ko'p
   * ham, kam ham emas. Ma'no faqat taqqoslashda tug'iladi.
   */
  describe('oldingi davrga nisbatan farq', () => {
    const withPrevious = (total, previous) =>
      renderStatsPage({ days: 30, since: '2026-07-20', total, previous });

    it('o‘sishni ko‘rsatadi', () => {
      const html = withPrevious({ tashrif: 120 }, { tashrif: 100 });
      assert.match(html, /class="up">\+20 · 20%/);
    });

    it('kamayishni ham ko‘rsatadi', () => {
      const html = withPrevious({ tashrif: 80 }, { tashrif: 100 });
      assert.match(html, /class="down">−20 · 20%/);
    });

    it('o‘zgarmagani aniq aytiladi', () => {
      assert.match(withPrevious({ tashrif: 50 }, { tashrif: 50 }), /o‘zgarmadi/);
    });

    /**
     * Noldan o'sish har doim "+100%" bo'lib chiqadi va bu yolg'on
     * ishonch beradi. Shuning uchun ko'rsatilmaydi.
     */
    it('oldingi davr BO‘SH bo‘lsa farq ko‘rsatmaydi', () => {
      const html = withPrevious({ tashrif: 40 }, {});
      assert.ok(!/class="up"/.test(html), 'noldan o‘sish foizi ko‘rsatildi');
      assert.ok(!/class="down"/.test(html));
    });

    it('taqqoslash davri sarlavhada aytiladi', () => {
      assert.match(withPrevious({ tashrif: 1 }, { tashrif: 1 }), /oldingi 30 kunga nisbatan/);
    });
  });

  it('qaytish ulushini ham hisoblaydi', () => {
    const html = renderStatsPage({
      days: 30,
      since: '2026-07-20',
      total: { tashrif: 100, qaytish: 32, fikr: 10 }
    });
    assert.match(html, /<strong>32%<\/strong> — qaytib kelgan/);
  });

  it('sanani odam o‘qiydigan ko‘rinishda beradi', () => {
    assert.match(sample({ tashrif: 1 }), /20 iyldan buyon/);
  });
});
