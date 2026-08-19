/**
 * Zaxira eslatmasi.
 *
 * Bu yerdagi testlar bitta narsani qo'riqlaydi: eslatma BEZOVTA
 * QILMASLIGI kerak. Ko'p marta chiqadigan yoki noto'g'ri paytda
 * chiqadigan eslatma foydali emas, zerikarli.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { QUIET_DAYS, shouldRemind } from '../../assets/js/core/backup-notice.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-08-19T12:00:00.000Z');
const daysAgo = n => new Date(NOW - n * DAY).toISOString();

const ask = extra => shouldRemind({ hasData: true, now: NOW, ...extra });

describe('shouldRemind()', () => {
  it('ma’lumoti yo‘q odamga hech qachon aytmaydi', () => {
    assert.equal(ask({ hasData: false, firstSeenAt: daysAgo(365) }), false);
  });

  it('yaqinda kelgan odamni bezovta qilmaydi', () => {
    assert.equal(ask({ firstSeenAt: daysAgo(QUIET_DAYS - 1) }), false);
  });

  it('bir hafta jim turgan bo‘lsa — aytadi', () => {
    assert.equal(ask({ firstSeenAt: daysAgo(QUIET_DAYS + 1) }), true);
  });

  it('yaqinda sinxronlagan yoki eksport qilganga aytmaydi', () => {
    assert.equal(ask({ firstSeenAt: daysAgo(365), lastBackupAt: daysAgo(2) }), false);
  });

  it('oxirgi zaxiradan beri bir hafta o‘tsa — yana aytadi', () => {
    assert.equal(ask({ firstSeenAt: daysAgo(365), lastBackupAt: daysAgo(QUIET_DAYS + 1) }), true);
  });

  it('BIR MARTA yopilgach hech qachon qaytmaydi', () => {
    assert.equal(ask({ firstSeenAt: daysAgo(365), dismissed: true }), false);
    assert.equal(ask({ firstSeenAt: daysAgo(9999), dismissed: true }), false);
  });

  it('sana noma’lum bo‘lsa jim turadi — taxmin qilib bezovta qilmaydi', () => {
    assert.equal(ask({}), false);
    assert.equal(ask({ firstSeenAt: 'yaroqsiz' }), false);
  });

  it('argumentsiz chaqirilsa yiqilmaydi', () => {
    assert.equal(shouldRemind(), false);
  });
});
