/**
 * Service worker ro'yxati.
 *
 * NIMA UCHUN: fayl qayta nomlansa yoki birlashtirilsa, `PRECACHE` dagi
 * yo'l jimgina eskirib qoladi. `cache.add()` xatosi `Promise.allSettled`
 * ichida yutiladi — ya'ni oflayn rejim asta-sekin buziladi va buni hech
 * kim sezmaydi.
 *
 * Aynan shu bo'ldi ham: modullar birlashtirilgach `core/events.js`
 * ro'yxatda qolib ketgan edi.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const source = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

/** `PRECACHE` massividagi yo'llarni o'qiydi. */
const precached = () => {
  const block = source.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(block, 'PRECACHE ro‘yxati topilmadi');
  return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
};

describe('service worker', () => {
  it('oldindan keshlanadigan har bir fayl MAVJUD', () => {
    const yoq = precached().filter(url => !existsSync(path.join(ROOT, url)));
    assert.deepEqual(yoq, [], `ro‘yxatda yo‘q fayllar bor: ${yoq.join(', ')}`);
  });

  it('ikkita sahifa ham ro‘yxatda — oflayn ochilishi kerak', () => {
    const list = precached();
    for (const page of ['/index.html', '/map.html']) {
      assert.ok(list.includes(page), `${page} oldindan keshlanmaydi`);
    }
  });

  it('API javoblari HECH QACHON keshlanmaydi', () => {
    assert.match(source, /url\.pathname\.startsWith\('\/api\/'\)/);
    assert.ok(!precached().some(url => url.startsWith('/api/')), 'API yo‘li ro‘yxatda');
  });
});
