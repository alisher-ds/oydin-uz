import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { installBrowserGlobals } from './helpers/browser-stub.js';

let harness;
let state;

before(async () => {
  harness = installBrowserGlobals();
  state = await import('../../assets/js/map/state.js');
});

after(() => {
  delete globalThis.localStorage;
  delete globalThis.dispatchEvent;
});

beforeEach(() => {
  harness.reset();
  state.loadState();
});

describe('normalizeMap', () => {
  it('mavjud bo‘lmagan kartaga ishora qiluvchi "arvoh" aloqalarni tashlaydi', () => {
    const map = state.normalizeMap({
      id: 'm',
      cards: [{ id: 'a', text: 'A' }],
      connections: [
        { id: 'e1', from: 'a', to: 'yoq' },
        { id: 'e2', from: 'a', to: 'a' }
      ]
    });
    assert.equal(map.connections.length, 1);
    assert.equal(map.connections[0].id, 'e2');
  });

  it('noto‘g‘ri turdagi qiymatlarni xavfsiz standartga keltiradi', () => {
    const map = state.normalizeMap({
      id: 'm',
      title: 123,
      space: 'mavjud-emas',
      cards: [{ id: 'a', text: null, type: 'YOLGON', x: 'salom', y: undefined }]
    });
    assert.equal(map.space, 'paper');
    assert.equal(map.cards[0].type, 'G‘oya');
    assert.equal(map.cards[0].text, '');
    assert.equal(typeof map.cards[0].x, 'number');
    assert.ok(Number.isFinite(map.cards[0].x));
  });

  it('sarlavhani cheklaydi', () => {
    const map = state.normalizeMap({ id: 'm', title: 'x'.repeat(500) });
    assert.equal(map.title.length, 160);
  });
});

describe('kartalar va aloqalar', () => {
  it('kartani qo‘shadi va topadi', () => {
    const card = state.addCard({ text: 'Birinchi fikr', type: 'Reja' });
    assert.equal(state.findCard(card.id).text, 'Birinchi fikr');
    assert.equal(state.cards().length, 1);
  });

  it('ota-ona bilan yaratilganda aloqa ham quriladi', () => {
    const parent = state.addCard({ text: 'Ota' });
    state.addCard({ text: 'Bola', parentId: parent.id });
    assert.equal(state.connections().length, 1);
  });

  it('takroriy aloqani ikkinchi marta qo‘shmaydi (ikki yo‘nalishda ham)', () => {
    const a = state.addCard({ text: 'A' });
    const b = state.addCard({ text: 'B' });
    assert.ok(state.connect(a.id, b.id));
    assert.equal(state.connect(a.id, b.id), null);
    assert.equal(state.connect(b.id, a.id), null);
    assert.equal(state.connections().length, 1);
  });

  it('kartani o‘zi bilan bog‘lamaydi', () => {
    const a = state.addCard({ text: 'A' });
    assert.equal(state.connect(a.id, a.id), null);
  });

  it('karta o‘chirilganda unga tegishli aloqalar ham ketadi', () => {
    const a = state.addCard({ text: 'A' });
    const b = state.addCard({ text: 'B' });
    state.connect(a.id, b.id);
    state.removeCard(a.id);
    assert.equal(state.cards().length, 1);
    assert.equal(state.connections().length, 0);
  });
});

describe('tombstone (o‘chirish belgisi)', () => {
  it('makon o‘chirilganda tombstone qoldiradi', () => {
    state.createMap();
    const target = state.activeMapId();
    assert.ok(state.deleteMap(target));
    assert.ok(state.tombstones()[target]);
  });

  it('oxirgi makonni o‘chirmaydi', () => {
    assert.equal(state.deleteMap(state.activeMapId()), false);
  });

  it('o‘chirilgan makon serverdan QAYTIB KELMAYDI', () => {
    state.createMap();
    const target = state.activeMapId();
    state.deleteMap(target);

    // Server hali eski nusxani biladi va uni qaytarib beryapti.
    state.mergeRemote([
      {
        id: target,
        title: 'Qaytib kelgan',
        cards: [],
        connections: [],
        updatedAt: '2020-01-01T00:00:00.000Z'
      }
    ]);
    assert.ok(!state.allMaps().some(map => map.id === target), 'o‘chirilgan makon qaytib keldi');
  });

  it('o‘chirishdan KEYIN yangilangan makon qaytadi', () => {
    state.createMap();
    const target = state.activeMapId();
    state.deleteMap(target);

    state.mergeRemote([
      {
        id: target,
        title: 'Boshqa qurilmada tahrirlangan',
        cards: [],
        connections: [],
        updatedAt: '2099-01-01T00:00:00.000Z'
      }
    ]);
    assert.ok(state.allMaps().some(map => map.id === target));
  });

  it('masofaviy tombstone lokal makonni o‘chiradi', () => {
    const created = state.createMap();
    state.persist();
    state.mergeRemote([], { [created.id]: '2099-01-01T00:00:00.000Z' });
    assert.ok(!state.allMaps().some(map => map.id === created.id));
  });
});

describe('mergeRemote', () => {
  it('yangiroq masofaviy nusxani oladi', () => {
    const id = state.activeMapId();
    state.setTitle('Lokal');
    state.persist();
    state.mergeRemote([
      { id, title: 'Masofaviy', cards: [], connections: [], updatedAt: '2099-01-01T00:00:00.000Z' }
    ]);
    assert.equal(state.allMaps().find(map => map.id === id).title, 'Masofaviy');
  });

  it('eskiroq masofaviy nusxani rad etadi', () => {
    const id = state.activeMapId();
    state.setTitle('Lokal yangi');
    state.persist();
    state.mergeRemote([
      { id, title: 'Eski', cards: [], connections: [], updatedAt: '1999-01-01T00:00:00.000Z' }
    ]);
    assert.equal(state.allMaps().find(map => map.id === id).title, 'Lokal yangi');
  });

  it('hech qachon bo‘sh holatda qolmaydi', () => {
    state.mergeRemote([], {});
    assert.ok(state.allMaps().length >= 1);
    assert.ok(state.activeMap());
  });
});

describe('undo (bekor qilish)', () => {
  it('oxirgi o‘zgarishni qaytaradi', () => {
    state.addCard({ text: 'Birinchi' });
    state.persist();
    state.addCard({ text: 'Ikkinchi' });
    state.persist();
    assert.equal(state.cards().length, 2);

    assert.ok(state.undo());
    assert.equal(state.cards().length, 1);
    assert.equal(state.cards()[0].text, 'Birinchi');
  });

  it('tarix bo‘sh bo‘lsa false qaytaradi', () => {
    while (state.undo()) {
      /* tarixni tugatamiz */
    }
    assert.equal(state.undo(), false);
  });
});
