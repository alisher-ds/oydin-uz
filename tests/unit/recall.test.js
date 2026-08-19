import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COOLDOWN_DAYS,
  MIN_AGE_DAYS,
  humanAge,
  markShown,
  pickRecall
} from '../../assets/js/core/recall.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-08-19T12:00:00.000Z');
const daysAgo = n => new Date(NOW - n * DAY).toISOString();

const note = (id, days, text = `fikr ${id}`) => ({ id, text, createdAt: daysAgo(days) });

describe('pickRecall()', () => {
  it('yangi fikrni qaytarmaydi — u hali esda', () => {
    const result = pickRecall({ notes: [note('a', MIN_AGE_DAYS - 1)], now: NOW });
    assert.equal(result, null);
  });

  it('yetarlicha eski fikrni qaytaradi', () => {
    const result = pickRecall({ notes: [note('a', MIN_AGE_DAYS + 1)], now: NOW });
    assert.equal(result?.id, 'a');
    assert.equal(result?.source, 'note');
  });

  it('eng eskisini tanlaydi — u ko‘proq unutilgan', () => {
    const result = pickRecall({
      notes: [note('yangi', 20), note('eski', 200), note('orta', 60)],
      now: NOW
    });
    assert.equal(result?.id, 'eski');
  });

  it('makondagi kartalarni ham hisobga oladi', () => {
    const result = pickRecall({
      maps: {
        m1: { cards: [{ id: 'k1', text: 'kartadagi fikr', createdAt: daysAgo(100) }] }
      },
      now: NOW
    });
    assert.equal(result?.id, 'k1');
    assert.equal(result?.source, 'card');
    assert.equal(result?.mapId, 'm1');
  });

  it('kuniga bir martadan ko‘p ko‘rsatmaydi', () => {
    const state = { lastShownAt: new Date(NOW - 3 * 3600_000).toISOString() };
    assert.equal(pickRecall({ notes: [note('a', 100)], state, now: NOW }), null);
  });

  it('bir kun o‘tgach yana ko‘rsatadi', () => {
    const state = { lastShownAt: daysAgo(2) };
    assert.equal(pickRecall({ notes: [note('a', 100)], state, now: NOW })?.id, 'a');
  });

  it('yaqinda ko‘rsatilgan fikrni takrorlamaydi', () => {
    const state = { lastShownAt: daysAgo(2), seen: { a: daysAgo(5) } };
    assert.equal(pickRecall({ notes: [note('a', 100)], state, now: NOW }), null);
  });

  it('sovish muddati o‘tgach o‘sha fikrni qayta ko‘rsatadi', () => {
    const state = { lastShownAt: daysAgo(2), seen: { a: daysAgo(COOLDOWN_DAYS + 1) } };
    assert.equal(pickRecall({ notes: [note('a', 100)], state, now: NOW })?.id, 'a');
  });

  it('yaqinda ko‘rsatilgani bo‘lsa, keyingisini tanlaydi', () => {
    const state = { lastShownAt: daysAgo(2), seen: { eski: daysAgo(3) } };
    const result = pickRecall({
      notes: [note('eski', 200), note('keyingi', 150)],
      state,
      now: NOW
    });
    assert.equal(result?.id, 'keyingi');
  });

  it('mos narsa bo‘lmasa null qaytaradi', () => {
    assert.equal(pickRecall({ notes: [], maps: {}, now: NOW }), null);
  });

  it('bo‘sh matnli va sanasiz yozuvlarni chetlab o‘tadi', () => {
    const result = pickRecall({
      notes: [
        { id: 'bosh', text: '   ', createdAt: daysAgo(100) },
        { id: 'sanasiz', text: 'matn bor', createdAt: 'yaroqsiz' },
        note('yaxshi', 100)
      ],
      now: NOW
    });
    assert.equal(result?.id, 'yaxshi');
  });

  it('yoshni kunlarda qaytaradi', () => {
    assert.equal(pickRecall({ notes: [note('a', 30)], now: NOW })?.ageDays, 30);
  });

  it('buzuq kirish ma’lumotidan yiqilmaydi', () => {
    const result = pickRecall({
      notes: [null, undefined, 42, { id: 'x' }],
      maps: { m: null, m2: { cards: null }, m3: { cards: [null, 7] } },
      now: NOW
    });
    assert.equal(result, null);
  });
});

describe('markShown()', () => {
  it('ko‘rsatilgan vaqtni yozadi', () => {
    const next = markShown({}, 'a', NOW);
    assert.equal(next.seen.a, new Date(NOW).toISOString());
    assert.equal(next.lastShownAt, new Date(NOW).toISOString());
  });

  it('juda eski yozuvlarni tozalaydi — ombor cheksiz o‘smasin', () => {
    const state = { seen: { qadimiy: daysAgo(COOLDOWN_DAYS * 2 + 5), yaqin: daysAgo(3) } };
    const next = markShown(state, 'yangi', NOW);
    assert.ok(!('qadimiy' in next.seen));
    assert.ok('yaqin' in next.seen);
    assert.ok('yangi' in next.seen);
  });
});

describe('humanAge()', () => {
  it('kun, hafta, oy va yilni to‘g‘ri aytadi', () => {
    assert.equal(humanAge(3), '3 kun oldin');
    assert.equal(humanAge(21), '3 hafta oldin');
    assert.equal(humanAge(35), 'bir oy oldin');
    assert.equal(humanAge(90), '3 oy oldin');
    assert.equal(humanAge(400), 'bir yil oldin');
    assert.equal(humanAge(800), '2 yil oldin');
  });
});
