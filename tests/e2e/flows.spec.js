/**
 * Asosiy foydalanuvchi oqimlari.
 *
 * Regressiya testlaridan farqli o'laroq, bu yerda mahsulot haqiqatan
 * ishlayotgani tekshiriladi: fikr yozish, bog'lash, o'chirish, bekor qilish.
 */

import { expect, test } from '@playwright/test';
import {
  blockExternalRequests,
  clickHitTested,
  collectErrors,
  openCardActions,
  pickSpaceTone,
  seedMap,
  skipTour
} from './helpers.js';

test.beforeEach(async ({ page }) => {
  await blockExternalRequests(page);
  await skipTour(page);
});

test.describe('Makon: asosiy oqim', () => {
  test('fikr yozish, bog‘lash va o‘chirishning to‘liq yo‘li', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/map.html');
    await page.waitForTimeout(400);

    // 1) Birinchi fikr
    await page.locator('#emptyAdd').click();
    await page.locator('#thoughtText').fill('Portfolio qilishim kerak');
    await page.locator('.type[data-type="Reja"]').click();
    await page.locator('#submitCard').click();
    await expect(page.locator('.thought-card')).toHaveCount(1);
    await expect(page.locator('#count')).toHaveText('1');

    // 2) Ikkinchi fikr
    await page.locator('#addFirst').click();
    await page.locator('#thoughtText').fill('Nimadan boshlayman?');
    await page.locator('.type[data-type="Savol"]').click();
    await page.locator('#submitCard').click();
    await expect(page.locator('.thought-card')).toHaveCount(2);

    // 3) Ularni bog‘laymiz
    const firstId = await page.locator('.thought-card').first().getAttribute('data-card-id');
    await openCardActions(page, firstId);
    await page.locator(`article[data-card-id="${firstId}"] .link`).click();
    await page.locator('.thought-card').nth(1).click();
    await expect(page.locator('#connectionCount')).toHaveText('1');
    await expect(page.locator('.connection-group')).toHaveCount(1);

    // 4) Sahifa yangilangandan keyin ham saqlanadi
    await page.reload();
    await page.waitForTimeout(700);
    await expect(page.locator('.thought-card')).toHaveCount(2);
    await expect(page.locator('#connectionCount')).toHaveText('1');

    expect(errors, `konsol xatolari: ${errors.join(' | ')}`).toEqual([]);
  });

  test('fikrni o‘chirish tasdiq so‘raydi va bekor qilinadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    const card = await openCardActions(page, 'c1');
    await card.locator('.delete').click();
    await expect(page.locator('#confirmDialog')).toBeVisible();

    await page.locator('#confirmDialog [data-action="cancel"]').click();
    await expect(page.locator('.thought-card')).toHaveCount(2);

    await openCardActions(page, 'c1');
    await card.locator('.delete').click();
    await page.locator('#confirmDialog [data-action="confirm"]').click();
    await expect(page.locator('.thought-card')).toHaveCount(1);
    // Kartaga tegishli aloqa ham ketadi.
    await expect(page.locator('#connectionCount')).toHaveText('0');
  });

  test('Ctrl+Z oxirgi o‘zgarishni qaytaradi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    await page.locator('#addFirst').click();
    await page.locator('#thoughtText').fill('Uchinchi fikr');
    await page.locator('#submitCard').click();
    await expect(page.locator('.thought-card')).toHaveCount(3);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    await expect(page.locator('.thought-card')).toHaveCount(2);
  });

  test('ichki qatlam (izoh, muddat, holat) saqlanadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    const card = await openCardActions(page, 'c1');
    await card.locator('.detail').click();
    await expect(page.locator('#detailDialog')).toBeVisible();

    await page.locator('#detailSummary').fill('Bu eng muhim qadam');
    await page.locator('#detailDue').fill('2026-12-01');
    await page.locator('#detailStatus').selectOption('Jarayonda');
    await page.locator('#saveDetail').click();

    await page.reload();
    await page.waitForTimeout(700);
    await openCardActions(page, 'c1');
    await page.locator('article[data-card-id="c1"] .detail').click();
    await expect(page.locator('#detailSummary')).toHaveValue('Bu eng muhim qadam');
    await expect(page.locator('#detailStatus')).toHaveValue('Jarayonda');
  });

  test('makon ohangini almashtirish saqlanadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(500);

    await pickSpaceTone(page, 'ink');
    await expect(page.locator('#workspace')).toHaveClass(/space-ink/);
    await expect(page.locator('#spaceName')).toHaveText('Siyoh makon');

    await page.reload();
    await page.waitForTimeout(700);
    await expect(page.locator('#workspace')).toHaveClass(/space-ink/);
  });

  test('qidiruv kartani topadi va unga o‘tadi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    await page.keyboard.press('/');
    await expect(page.locator('#mapSearchDialog')).toBeVisible();
    await page.locator('#mapSearchInput').fill('Ikkinchi');
    await page.waitForTimeout(200);
    await expect(page.locator('.search-result')).toHaveCount(1);

    await page.locator('.search-result').click();
    await expect(page.locator('#mapSearchDialog')).not.toBeVisible();
  });

  test('makonlar oynasida yangi makon yaratiladi va o‘chiriladi', async ({ page }) => {
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    await page.locator('#openMapsTop').click();
    await page.locator('#createMap').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.thought-card')).toHaveCount(0);

    await page.locator('#openMapsTop').click();
    await expect(page.locator('.saved-map')).toHaveCount(2);
  });
});

/**
 * Tez yozish — ilgari alohida "Oqim" sahifasi edi, endi Makon ichidagi
 * panel. Sahifa olib tashlandi, lekin IMKONIYATLARI to'liq saqlanishi
 * kerak: qo'shish, qidirish, tahrirlash, Makonga ko'chirish.
 */
test.describe('Tez yozish paneli', () => {
  const openPanel = async page => {
    await page.goto('/map.html');
    await page.waitForTimeout(400);
    await page.locator('#railTez').click();
    await expect(page.locator('#tezPanel')).toBeVisible();
  };

  test('fikr yozish, qidirish va Makonga ko‘chirish', async ({ page }) => {
    const errors = collectErrors(page);
    await openPanel(page);

    await page.locator('#tezInput').fill('Ertaga vazifani tugatish');
    await page.locator('#tezPanel .primary-button').first().click();
    await page.locator('#tezInput').fill('Ingliz tilini o‘rganish');
    await page.locator('#tezPanel .primary-button').first().click();
    await expect(page.locator('.idea-row')).toHaveCount(2);

    await page.locator('#tezSearch').fill('ingliz');
    await expect(page.locator('.idea-row')).toHaveCount(1);
    await page.locator('#tezSearch').fill('');
    await expect(page.locator('.idea-row')).toHaveCount(2);

    // Makonga ko'chirish: ro'yxatdan chiqadi va kartaga aylanadi.
    await page.locator('.idea-row').first().locator('.soft-button').click();
    await expect(page.locator('.idea-row')).toHaveCount(1);

    await page.locator('#tezPanel .dialog-close').click();
    await expect(page.locator('.thought-card')).toHaveCount(1);

    // Sahifa yangilangandan keyin ham turadi.
    await page.reload();
    await page.waitForTimeout(600);
    await expect(page.locator('.thought-card')).toHaveCount(1);

    expect(errors, `konsol xatolari: ${errors.join(' | ')}`).toEqual([]);
  });

  test('fikrni tahrirlash saqlanadi', async ({ page }) => {
    await openPanel(page);
    await page.locator('#tezInput').fill('Boshlang‘ich matn');
    await page.locator('#tezPanel .primary-button').first().click();

    await page.locator('.idea-row [aria-label="Fikrni tahrirlash"]').click();
    await page.locator('.idea-edit').fill('Yangilangan matn');
    await clickHitTested(page, '.idea-save');
    await expect(page.locator('.idea-text')).toHaveText('Yangilangan matn');

    await page.reload();
    await page.waitForTimeout(500);
    await page.locator('#railTez').click();
    await expect(page.locator('.idea-text')).toHaveText('Yangilangan matn');
  });

  test('eski "Oqim" ma’lumoti yo‘qolmaydi', async ({ page }) => {
    // Kalit o'zgarmadi (`oydin-oqim`), lekin buni test bilan
    // mustahkamlaymiz: foydalanuvchining eski fikrlari ko'rinishi shart.
    await page.goto('/map.html');
    await page.evaluate(() => {
      localStorage.setItem(
        'oydin-oqim',
        JSON.stringify([{ id: 'eski1', text: 'Eski fikr', createdAt: '2026-01-01T00:00:00.000Z' }])
      );
    });
    await page.reload();
    await page.waitForTimeout(400);

    await page.locator('#railTez').click();
    await expect(page.locator('.idea-text')).toHaveText('Eski fikr');
  });
});

test.describe('Bosh sahifa', () => {
  test('xatosiz yuklanadi va suhbat oynasi ochiladi', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/index.html');
    await page.waitForTimeout(400);

    await page.locator('#oydinAiOpen').click();
    await expect(page.locator('#oydinAiDialog')).toBeVisible();
    await expect(page.locator('#aiInput')).toBeFocused();

    expect(errors, `konsol xatolari: ${errors.join(' | ')}`).toEqual([]);
  });
});

test.describe('Xavfsizlik', () => {
  test('kartadagi HTML matn sifatida ko‘rsatiladi (XSS yo‘q)', async ({ page }) => {
    await page.goto('/map.html');
    await page.waitForTimeout(400);

    const payload = '<img src=x onerror="window.__xss=1"> <script>window.__xss=1</script>';
    await page.locator('#emptyAdd').click();
    await page.locator('#thoughtText').fill(payload);
    await page.locator('#submitCard').click();
    await page.waitForTimeout(400);

    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(page.locator('.thought-card p')).toHaveText(payload);
    await expect(page.locator('.thought-card img')).toHaveCount(0);
  });

  test('makon nomidagi HTML ham ekranlanadi', async ({ page }) => {
    await page.goto('/map.html');
    await page.waitForTimeout(400);
    await page.locator('#mapTitle').fill('<img src=x onerror="window.__xss2=1">');
    await page.waitForTimeout(700);

    await page.locator('#openMapsTop').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__xss2)).toBeUndefined();
    await expect(page.locator('.saved-map-main img')).toHaveCount(0);
  });
});
