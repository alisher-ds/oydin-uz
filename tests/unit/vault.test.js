import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isValidToken, normalizeTimestamp, randomToken } from '../../functions/_lib/vault.js';

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
