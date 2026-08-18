import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  anchorPoint,
  autoLayout,
  boundsOf,
  buildPath,
  centerOf,
  clampZoom,
  connectionPath,
  fitToView,
  levelsOf
} from '../../assets/js/map/geometry.js';

const rect = (x, y, width = 200, height = 100) => ({ x, y, width, height });

describe('geometry', () => {
  it('markazni to‘g‘ri hisoblaydi', () => {
    assert.deepEqual(centerOf(rect(100, 100)), { x: 200, y: 150 });
  });

  it('zoomni ruxsat etilgan oraliqqa keltiradi', () => {
    assert.equal(clampZoom(10), 1.75);
    assert.equal(clampZoom(0.01), 0.5);
    assert.equal(clampZoom('salom'), 1);
  });

  describe('anchorPoint', () => {
    it('nuqtani kartaning MARKAZIDA emas, chetida qaytaradi', () => {
      const box = rect(0, 0, 200, 100);
      const point = anchorPoint(box, { x: 500, y: 50 }, 0);
      // Markaz (100,50); o‘ngdagi maqsad uchun chet x = 200.
      assert.equal(point.x, 200);
      assert.equal(point.y, 50);
      assert.notDeepEqual(point, centerOf(box));
    });

    it('`gap` qiymatiga tashqariga suradi', () => {
      const point = anchorPoint(rect(0, 0, 200, 100), { x: 500, y: 50 }, 8);
      assert.equal(point.x, 208);
    });

    it('vertikal yo‘nalishda yuqori/quyi chetni tanlaydi', () => {
      const point = anchorPoint(rect(0, 0, 200, 100), { x: 100, y: -400 }, 0);
      assert.equal(point.y, 0);
      assert.equal(point.x, 100);
    });

    it('nol o‘lchamli kartada ham NaN qaytarmaydi', () => {
      const point = anchorPoint({ x: 0, y: 0, width: 0, height: 0 }, { x: 10, y: 10 }, 4);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    });
  });

  describe('buildPath', () => {
    it('haqiqiy SVG kubik egri chizig‘ini qaytaradi', () => {
      const d = buildPath({ x: 0, y: 0 }, { x: 300, y: 0 });
      assert.match(d, /^M0,0 C[-\d.]+,[-\d.]+ [-\d.]+,[-\d.]+ 300,0$/);
    });

    it('bir xil kirish uchun bir xil natija (barqaror)', () => {
      const a = buildPath({ x: 5, y: 9 }, { x: 90, y: 120 });
      const b = buildPath({ x: 5, y: 9 }, { x: 90, y: 120 });
      assert.equal(a, b);
    });
  });

  it('connectionPath chiziqni ikki kartaning CHETIDAN quradi', () => {
    const d = connectionPath(rect(0, 0), rect(600, 0), 0);
    const [startX, startY] = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    // Boshlanish nuqtasi birinchi kartaning markazi (100,50) BO‘LMASLIGI kerak.
    assert.notEqual(`${startX},${startY}`, '100,50');
    assert.equal(startX, 200);
  });

  describe('levelsOf', () => {
    it('aloqalar bo‘yicha darajalarni belgilaydi', () => {
      const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const edges = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' }
      ];
      const levels = levelsOf(cards, edges);
      assert.equal(levels.get('a'), 0);
      assert.equal(levels.get('b'), 1);
      assert.equal(levels.get('c'), 2);
    });

    it('bog‘lanmagan kartani ham joylashtiradi', () => {
      const levels = levelsOf([{ id: 'a' }, { id: 'z' }], []);
      assert.equal(levels.get('z'), 0);
    });

    it('tsiklda cheksiz aylanmaydi', () => {
      const cards = [{ id: 'a' }, { id: 'b' }];
      const edges = [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' }
      ];
      const levels = levelsOf(cards, edges);
      assert.equal(levels.size, 2);
    });

    it('mavjud bo‘lmagan kartaga ishora qiluvchi aloqani e’tiborsiz qoldiradi', () => {
      const levels = levelsOf([{ id: 'a' }], [{ from: 'a', to: 'yoq' }]);
      assert.equal(levels.size, 1);
    });
  });

  describe('autoLayout', () => {
    it('kirish massivini o‘zgartirmaydi (sof funksiya)', () => {
      const cards = [
        { id: 'a', x: 10, y: 10 },
        { id: 'b', x: 20, y: 20 }
      ];
      const snapshot = JSON.stringify(cards);
      autoLayout(cards, [{ from: 'a', to: 'b' }], 1200);
      assert.equal(JSON.stringify(cards), snapshot);
    });

    it('bolani ota-onadan pastroqqa qo‘yadi', () => {
      const positions = autoLayout(
        [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 0, y: 0 }
        ],
        [{ from: 'a', to: 'b' }],
        1200
      );
      assert.ok(positions.get('b').y > positions.get('a').y);
    });
  });

  describe('fitToView', () => {
    it('kartalarni KO‘CHIRMAYDI — faqat kamera qiymatlarini qaytaradi', () => {
      const result = fitToView([rect(0, 0), rect(1000, 800)], { width: 800, height: 600 });
      assert.ok(Object.hasOwn(result, 'zoom'));
      assert.ok(Object.hasOwn(result, 'panX'));
      assert.ok(Object.hasOwn(result, 'panY'));
      assert.ok(result.zoom >= 0.5 && result.zoom <= 1.75);
    });

    it('bo‘sh ro‘yxatda xavfsiz standart qiymat beradi', () => {
      assert.deepEqual(fitToView([], { width: 800, height: 600 }), { zoom: 1, panX: 0, panY: 0 });
    });
  });

  it('boundsOf o‘rab turgan to‘rtburchakni qaytaradi', () => {
    const bounds = boundsOf([rect(10, 20, 100, 50), rect(200, 5, 100, 50)]);
    assert.deepEqual(
      { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY },
      { minX: 10, minY: 5, maxX: 300, maxY: 70 }
    );
  });
});
