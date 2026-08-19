/**
 * Statistika sahifasi.
 *
 * Eng muhim test — CSP testi. Sahifa `_headers` dagi `style-src 'self'`
 * ostida ishlaydi, ya'ni `<style>` bloki ham, `style="..."` atributi ham
 * jimgina bloklanadi: sahifa uslubsiz, buzuq holda ochiladi va buni
 * faqat brauzerda ko'rish mumkin. Shuning uchun uni shu yerda ushlaymiz.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderStatsPage } from '../../functions/_lib/stats-page.js';

const sample = (total, byDay = {}) =>
  renderStatsPage({ days: 30, since: '2026-07-20', total, byDay });

describe('renderStatsPage()', () => {
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

  it('sanani odam o‘qiydigan ko‘rinishda beradi', () => {
    assert.match(sample({ tashrif: 1 }), /20 iyldan buyon/);
  });
});
