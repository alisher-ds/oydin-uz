import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { installBrowserGlobals } from './helpers/browser-stub.js';

let harness;
let storage;

before(async () => {
  harness = installBrowserGlobals({ quotaBytes: 400 });
  storage = await import('../../assets/js/core/storage.js');
});

after(() => {
  delete globalThis.localStorage;
  delete globalThis.dispatchEvent;
});

beforeEach(() => harness.reset());

describe('storage', () => {
  it('yozadi va o‘qiydi', () => {
    assert.deepEqual(storage.writeJson('oydin-maps', { a: 1 }), { ok: true });
    assert.deepEqual(storage.readJson('oydin-maps', null), { a: 1 });
  });

  it('buzuq JSON uchun zaxira qiymat qaytaradi', () => {
    globalThis.localStorage.setItem('oydin-maps', '{buzuq');
    assert.deepEqual(storage.readJson('oydin-maps', { zaxira: true }), { zaxira: true });
  });

  it('kvota tugaganda JIMGINA yo‘qotmaydi — ok:false qaytaradi', () => {
    const result = storage.writeRaw('oydin-maps', 'x'.repeat(1000));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'quota');
  });

  it('kvota xatosida `oydin:storage-error` hodisasini yuboradi', () => {
    storage.writeRaw('oydin-maps', 'x'.repeat(1000));
    const errors = harness.events.filter(event => event.type === 'oydin:storage-error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].detail.reason, 'quota');
  });

  it('muvaffaqiyatli yozuvda `oydin:data-changed` yuboradi', () => {
    storage.writeRaw('oydin-maps', '{}');
    assert.ok(harness.events.some(event => event.type === 'oydin:data-changed'));
  });

  it('`silent` rejimda hodisa yubormaydi', () => {
    storage.writeRaw('oydin-maps', '{}', { silent: true });
    assert.equal(harness.events.filter(e => e.type === 'oydin:data-changed').length, 0);
  });

  it('IndexedDB mavjud bo‘lmaganda restore() xatoga uchramaydi', async () => {
    assert.equal(await storage.restore('oydin-maps'), false);
  });

  it('kuzatilmaydigan kalitni tiklashga urinmaydi', async () => {
    assert.equal(await storage.restore('boshqa-kalit'), false);
  });
});
