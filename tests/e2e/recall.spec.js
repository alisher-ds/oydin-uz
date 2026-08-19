/**
 * Eski fikrni qaytarish — brauzerda.
 *
 * Tanlash mantig'i `tests/unit/recall.test.js` da to'liq qoplangan; bu
 * yerda chiziqning haqiqatan ko'rinishi va tugmalari ishlashi
 * tekshiriladi.
 *
 * Tartib muhim: ma'lumot yozishdan OLDIN birinchi qaror tugashini
 * kutamiz. Aks holda poyga chiqadi — qaror seed'ni ko'rib qoladi,
 * "bugun ko'rsatildi" deb belgilaydi va qayta yuklashda hech narsa
 * chiqmaydi.
 */

import { expect, test } from '@playwright/test';
import { blockExternalRequests } from './helpers.js';

const DAY = 86_400_000;
const daysAgo = n => new Date(Date.now() - n * DAY).toISOString();

/** Chiziq qaror qabul qilgunini kutadi (sahifa avval IndexedDB'ni tiklaydi). */
const decided = page =>
  page.waitForSelector('#recall[data-recall="decided"]', { state: 'attached' });

const seedNote = (page, days, text) =>
  page.evaluate(
    ([created, body]) =>
      localStorage.setItem(
        'oydin-oqim',
        JSON.stringify([{ id: 'eski-fikr', text: body, createdAt: created }])
      ),
    [daysAgo(days), text]
  );

/** Sahifani ochadi, birinchi qarorni kutadi, fikr ekib qayta yuklaydi. */
const withNote = async (page, days, text) => {
  await page.goto('/map.html');
  await decided(page);
  await seedNote(page, days, text);
  await page.reload();
  await decided(page);
};

test.beforeEach(async ({ page }) => {
  await blockExternalRequests(page);
});

test.describe('Eski fikrni qaytarish', () => {
  test('yangi fikr bo‘lsa chiziq KO‘RINMAYDI', async ({ page }) => {
    await withNote(page, 2, 'Bugungi fikr');
    await expect(page.locator('#recall')).toBeHidden();
  });

  test('eski fikr yuzaga chiqadi va yoshi ko‘rsatiladi', async ({ page }) => {
    await withNote(page, 90, 'Portfolio qilishim kerak');

    await expect(page.locator('#recall')).toBeVisible();
    await expect(page.locator('.recall-text')).toHaveText('Portfolio qilishim kerak');
    await expect(page.locator('.recall-label')).toHaveText('3 OY OLDIN');
  });

  test('"Makonga" bosilsa karta bo‘ladi va saqlanadi', async ({ page }) => {
    await withNote(page, 90, 'Ingliz tilini yaxshilash');

    await page.locator('.recall-actions .soft-button').click();
    const card = page.locator('.thought-card', { hasText: 'Ingliz tilini yaxshilash' });
    await expect(card).toHaveCount(1);
    await expect(page.locator('#recall')).toBeHidden();

    await page.reload();
    await decided(page);
    await expect(
      page.locator('.thought-card', { hasText: 'Ingliz tilini yaxshilash' })
    ).toHaveCount(1);
  });

  test('yopilgach o‘sha kuni qaytmaydi', async ({ page }) => {
    await withNote(page, 90, 'Bir marta ko‘rsatiladi');
    await expect(page.locator('#recall')).toBeVisible();

    await page.locator('.recall-actions [aria-label="Yopish"]').click();
    await expect(page.locator('#recall')).toBeHidden();

    await page.reload();
    await decided(page);
    await expect(page.locator('#recall')).toBeHidden();
  });

  test('makondagi eski karta ham qaytadi va "Ochish" ishlaydi', async ({ page }) => {
    await page.goto('/map.html');
    await decided(page);

    await page.evaluate(created => {
      localStorage.setItem(
        'oydin-maps',
        JSON.stringify({
          eski: {
            id: 'eski',
            title: 'Eski makon',
            space: 'paper',
            updatedAt: created,
            cards: [{ id: 'k1', text: 'Kartadagi eski fikr', x: 40, y: 40, createdAt: created }],
            connections: []
          }
        })
      );
    }, daysAgo(120));

    await page.reload();
    await decided(page);

    await expect(page.locator('.recall-text')).toHaveText('Kartadagi eski fikr');
    await page.locator('.recall-actions .soft-button').click();

    await expect(page.locator('#recall')).toBeHidden();
    await expect(page.locator('.thought-card', { hasText: 'Kartadagi eski fikr' })).toHaveCount(1);
  });
});
