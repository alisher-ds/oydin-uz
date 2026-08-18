/**
 * Regressiya testlari.
 *
 * Har bir test auditda topilgan ANIQ bir xatoga bog'langan. Ular shu xato
 * qaytib kelmasligi uchun yozilgan — kod o'zgarganda birinchi bo'lib shular
 * ogohlantiradi.
 */

import { expect, test } from '@playwright/test';
import {
  blockExternalRequests,
  cardCenter,
  collectErrors,
  connectionStart,
  openCardActions,
  seedMap
} from './helpers.js';

test.beforeEach(async ({ page }) => {
  await blockExternalRequests(page);
});

test.describe('K1 — `layer is not defined` regressiyasi', () => {
  test('makon sahifasi konsol xatosisiz yuklanadi', async ({ page }) => {
    const errors = collectErrors(page);
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(700);
    expect(errors, `konsol xatolari: ${errors.join(' | ')}`).toEqual([]);
  });

  test('bo‘sh sathni surish kamerani harakatlantiradi (pan tirik)', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(500);

    const before = await page.evaluate(() => document.querySelector('#canvas').style.transform);

    // Haqiqatan bo‘sh nuqtani topamiz — karta yoki panel ustida sudrash
    // pan hisoblanmaydi.
    const blank = await page.evaluate(() => {
      const workspace = document.querySelector('#workspace');
      const box = workspace.getBoundingClientRect();
      for (let y = box.top + 70; y < box.bottom - 90; y += 24) {
        for (let x = box.left + 30; x < box.right - 30; x += 24) {
          const target = document.elementFromPoint(x, y);
          const blocked = target?.closest(
            '.thought-card, button, input, textarea, select, dialog, .workspace-toolbar, .flow-panel, .space-hint, .relation-panel'
          );
          if (target && !blocked && workspace.contains(target)) return { x, y };
        }
      }
      return null;
    });
    expect(blank, 'bo‘sh nuqta topilmadi').not.toBeNull();

    await page.mouse.move(blank.x, blank.y);
    await page.mouse.down();
    await page.mouse.move(blank.x - 130, blank.y - 80, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => document.querySelector('#canvas').style.transform);
    expect(after).not.toBe(before);
    expect(after).toMatch(/translate3d/);
  });

  test('aloqa chizig‘i karta MARKAZIDAN emas, chetidan boshlanadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    const start = await connectionStart(page);
    const center = await cardCenter(page, 'c1');
    expect(start).not.toBeNull();
    expect(center).not.toBeNull();

    const distance = Math.hypot(start.x - center.x, start.y - center.y);
    expect(distance, 'chiziq kartaning markazidan boshlanyapti').toBeGreaterThan(20);
  });

  test('fikrlash qatlami ishlaydi: ◎ fokus tugmasi mavjud', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);
    await expect(page.locator('article[data-card-id="c1"] .focus')).toHaveCount(1);
    await expect(page.locator('article[data-card-id="c1"] .focus')).toHaveAttribute(
      'aria-label',
      /atrofini/
    );
  });

  test('fokus rejimi qo‘shnisi bo‘lmagan kartani xiralashtiradi', async ({ page }) => {
    await seedMap(page, {
      m1: {
        id: 'm1',
        title: 'T',
        space: 'paper',
        updatedAt: '2024-01-01T00:00:00.000Z',
        cards: [
          { id: 'c1', text: 'Markaz', type: 'G‘oya', x: 100, y: 100, detail: {} },
          { id: 'c2', text: 'Qo‘shni', type: 'Reja', x: 400, y: 300, detail: {} },
          { id: 'c3', text: 'Uzoq', type: 'Savol', x: 700, y: 120, detail: {} }
        ],
        connections: [{ id: 'e1', from: 'c1', to: 'c2' }]
      }
    });
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    // Amallar paneli hover (sichqoncha) yoki bosish (sensor) bilan ochiladi.
    await openCardActions(page, 'c1');
    await page.locator('article[data-card-id="c1"] .focus').click();
    await page.waitForTimeout(300);

    await expect(page.locator('article[data-card-id="c2"]')).not.toHaveClass(/is-dimmed/);
    await expect(page.locator('article[data-card-id="c3"]')).toHaveClass(/is-dimmed/);
  });

  test('aloqa turi paneli ochiladi va yorliq chiziqda ko‘rinadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    await page.locator('.connection-group').first().click();
    await expect(page.locator('.relation-panel')).toBeVisible();

    await page.locator('.relation-options button', { hasText: 'Sabab' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.connection-label')).toHaveText('Sabab');
  });
});

test.describe('K2 — CSS sintaksis xatosi', () => {
  test('kartaning `box-shadow` qoidasi parse qilinadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(400);

    const hasShadow = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of rules) {
          if (rule.selectorText === '.map-page .thought-card' && rule.style.boxShadow) return true;
        }
      }
      return false;
    });
    expect(hasShadow, '`box-shadow` e’loni parse qilinmadi').toBe(true);
  });

  test('sahifada muvozanatsiz qavsli CSS yo‘q', async ({ request }) => {
    for (const file of ['tokens.css', 'base.css', 'map.css', 'oqim.css', 'ai.css']) {
      const response = await request.get(`/assets/css/${file}`);
      const text = await response.text();
      const open = (text.match(/\(/g) ?? []).length;
      const close = (text.match(/\)/g) ?? []).length;
      expect(close, `${file} qavslari muvozanatsiz`).toBe(open);
    }
  });
});

test.describe('F1 — "Joylash" foydalanuvchi joylashuvini buzmaydi', () => {
  test('"Sig‘dirish" kartalarni KO‘CHIRMAYDI', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    const before = await page.evaluate(() =>
      [...document.querySelectorAll('.thought-card')].map(node => node.style.left)
    );
    await page.locator('#fitMap').click();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() =>
      [...document.querySelectorAll('.thought-card')].map(node => node.style.left)
    );
    expect(after).toEqual(before);
  });

  test('"Joylash" avval TASDIQ so‘raydi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    const before = await page.evaluate(() =>
      [...document.querySelectorAll('.thought-card')].map(node => node.style.left)
    );
    await page.locator('#autoLayout').click();
    await expect(page.locator('#confirmDialog')).toBeVisible();

    // Bekor qilinganda hech narsa o‘zgarmaydi.
    await page.locator('#confirmDialog [data-action="cancel"]').click();
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('.thought-card')].map(node => node.style.left)
      )
    ).toEqual(before);
  });

  test('tasdiqlangandan keyin joylashuv o‘zgaradi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    const before = await page.evaluate(() =>
      [...document.querySelectorAll('.thought-card')].map(node => node.style.left)
    );
    await page.locator('#autoLayout').click();
    await page.locator('#confirmDialog [data-action="confirm"]').click();
    await page.waitForTimeout(500);

    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('.thought-card')].map(node => node.style.left)
      )
    ).not.toEqual(before);
  });
});

test.describe('F2 — klaviatura qisqartmalari dialog ochiqda ishlamaydi', () => {
  test('Yordam oynasi ochiqda `n` yangi fikr oynasini OCHMAYDI', async ({ page }) => {
    await page.goto('/map.html');
    await page.waitForTimeout(500);

    await page.locator('#help').click();
    await expect(page.locator('#helpDialog')).toBeVisible();

    await page.keyboard.press('n');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.querySelector('#cardDialog').open)).toBeFalsy();
  });

  test('hech narsa ochiq bo‘lmaganda `n` ishlaydi', async ({ page }) => {
    await page.goto('/map.html');
    await page.waitForTimeout(500);
    await page.keyboard.press('n');
    await expect(page.locator('#cardDialog')).toBeVisible();
  });
});

test.describe('F6 — `data-id` to‘qnashuvi', () => {
  test('karta selektori faqat bitta elementga tushadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);
    await page.locator('#railNotes').click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-card-id="c1"]')).toHaveCount(1);
  });
});

test.describe('M1 — IndexedDB tiklash', () => {
  // DIQQAT: bu yerda `seedMap` ishlatilmaydi — `addInitScript` HAR
  // navigatsiyada qayta ishga tushadi va localStorage ni qayta to‘ldirib,
  // tiklashni tekshirib bo‘lmay qoladi.
  test('localStorage yo‘qolsa, ma’lumot IndexedDB dan QAYTADI', async ({ page }) => {
    await page.goto('/map.html');
    await page.waitForTimeout(500);

    // Ilovaning o‘zi orqali yozamiz — shunda IndexedDB zaxirasi hosil bo‘ladi.
    await page.locator('#mapTitle').fill('Tiklanadigan makon');
    await page.waitForTimeout(1200);

    const backedUp = await page.evaluate(
      () =>
        new Promise(resolve => {
          const request = indexedDB.open('oydin-storage', 3);
          request.onsuccess = () => {
            const db = request.result;
            const get = db
              .transaction('snapshots', 'readonly')
              .objectStore('snapshots')
              .get('oydin-maps');
            get.onsuccess = () => resolve(typeof get.result?.value === 'string');
            get.onerror = () => resolve(false);
          };
          request.onerror = () => resolve(false);
        })
    );
    expect(backedUp, 'IndexedDB ga zaxira yozilmadi').toBe(true);

    // Endi localStorage ni butunlay yo‘qotamiz (IndexedDB qoladi).
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(1500);

    await expect(page.locator('#mapTitle')).toHaveValue('Tiklanadigan makon');
  });
});

test.describe('M3 — saqlash xatosi ko‘rinadi', () => {
  test('kvota tugaganda holat maydonida xato chiqadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(500);

    // localStorage.setItem ni kvota xatosi bilan almashtiramiz.
    await page.evaluate(() => {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      Storage.prototype.setItem = () => {
        throw error;
      };
    });

    await page.locator('#addFirst').click();
    await page.locator('#thoughtText').fill('Kvota testi');
    await page.locator('#submitCard').click();
    await page.waitForTimeout(400);

    await expect(page.locator('#saveStatus')).toHaveAttribute('data-tone', 'error');
    await expect(page.locator('#saveStatus')).toContainText('saqlanmadi');
  });
});

test.describe('A1/A2 — foydalanish imkoniyati', () => {
  test('aloqalar `aria-hidden` ichida EMAS va klaviaturaga ochiq', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    await expect(page.locator('#connections')).not.toHaveAttribute('aria-hidden', 'true');
    const group = page.locator('.connection-group').first();
    await expect(group).toHaveAttribute('role', 'button');
    await expect(group).toHaveAttribute('tabindex', '0');
    await expect(group).toHaveAttribute('aria-label', /Aloqa/);
  });

  test('aloqani klaviatura bilan tanlash mumkin', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    await page.locator('.connection-group').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.relation-panel')).toBeVisible();
  });

  test('karta klaviatura bilan ko‘chadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    const card = page.locator('article[data-card-id="c1"]');
    await card.focus();
    const before = await card.evaluate(node => parseFloat(node.style.left));
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    expect(await card.evaluate(node => parseFloat(node.style.left))).toBeGreaterThan(before);
  });

  test('karta amallarida `aria-label` bor', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);
    for (const button of await page
      .locator('article[data-card-id="c1"] .card-actions button')
      .all()) {
      await expect(button).toHaveAttribute('aria-label', /.+/);
    }
  });

  test('har bir sahifada "asosiy kontentga o‘tish" havolasi bor', async ({ page }) => {
    for (const path of ['/index.html', '/oqim.html', '/map.html']) {
      // Tashqi shriftlar tarmoqsiz muhitda `load` hodisasini kechiktiradi.
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.skip-link')).toHaveCount(1);
    }
  });
});

test.describe('A3 — mavzu va tizim sozlamalari', () => {
  test('tungi rejimda `theme-color` yangilanadi', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(400);

    const before = await page.getAttribute('meta[name="theme-color"]', 'content');
    await page.locator('#themeToggle').click();
    await page.waitForTimeout(250);
    const after = await page.getAttribute('meta[name="theme-color"]', 'content');

    expect(after).not.toBe(before);
    await expect(page.locator('body')).toHaveClass(/night/);
  });

  test('tizim tungi rejimni so‘rasa, sahifa tungi ochiladi', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/index.html');
    await page.waitForTimeout(400);
    await expect(page.locator('body')).toHaveClass(/night/);
    await context.close();
  });
});

test.describe('F11 — "Bir daqiqa" namunani sizniki deb ko‘rsatmaydi', () => {
  test('bo‘sh matnda halol bo‘sh holat chiqadi', async ({ page }) => {
    await page.goto('/birdaqiqa/index.html');
    await page.locator('#begin').click();
    await page.locator('#finish').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.reveal-empty')).toBeVisible();
    await expect(page.locator('#constellation .node')).toHaveCount(0);
    await expect(page.locator('#signalTitle')).toContainText('Hali signal yo‘q');
  });
});
