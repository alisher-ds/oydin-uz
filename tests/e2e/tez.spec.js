/**
 * Tez yozish va Kiruvchi uchun testlar.
 *
 * Mahsulot nuqtai nazaridan bu sahifaning bitta vazifasi bor: fikr
 * kelganda kursor allaqachon turgan bo'lsin va yozilgan narsa hech
 * qachon yo'qolmasin. Quyidagi testlar aynan shuni qo'riqlaydi.
 */

import { expect, test } from '@playwright/test';
import { blockExternalRequests } from './helpers.js';

const INBOX_KEY = 'oydin-inbox-v1';

const readInbox = page =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), INBOX_KEY);

test.beforeEach(async ({ page }) => {
  await blockExternalRequests(page);
});

test.describe('Tez yozish', () => {
  test('ochilishi bilan kursor maydonda turadi', async ({ page }) => {
    await page.goto('/tez/');
    // Eng muhim xususiyat: hech narsa bosmasdan yozish mumkin.
    await expect(page.locator('#fikr')).toBeFocused();
  });

  test('tashqi shrift YUKLAMAYDI', async ({ page }) => {
    // Google Fonts render'ni to'sadi — sekin tarmoqda bu bir necha
    // soniya. Bu sahifada tezlik hamma narsadan muhim.
    const external = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.hostname.includes('127.0.0.1') && !url.hostname.includes('localhost')) {
        external.push(url.hostname);
      }
    });
    await page.goto('/tez/', { waitUntil: 'load' });
    expect(external, `tashqi so‘rovlar: ${external.join(', ')}`).toHaveLength(0);
  });

  test('Enter fikrni Kiruvchiga saqlaydi va maydonni bo‘shatadi', async ({ page }) => {
    await page.goto('/tez/');
    await page.fill('#fikr', 'Portfolio qilishim kerak');
    await page.press('#fikr', 'Enter');

    await expect(page.locator('#fikr')).toHaveValue('');
    await expect(page.locator('.tez-item p')).toHaveText(['Portfolio qilishim kerak']);

    const inbox = await readInbox(page);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].text).toBe('Portfolio qilishim kerak');
  });

  test('Shift+Enter yangi qator qo‘shadi, saqlamaydi', async ({ page }) => {
    await page.goto('/tez/');
    await page.fill('#fikr', 'birinchi qator');
    await page.press('#fikr', 'Shift+Enter');
    await page.keyboard.type('ikkinchi qator');

    expect(await readInbox(page)).toHaveLength(0);
    await expect(page.locator('#fikr')).toHaveValue(/birinchi qator\nikkinchi qator/);
  });

  test('bo‘sh matn saqlanmaydi', async ({ page }) => {
    await page.goto('/tez/');
    await page.fill('#fikr', '   ');
    await page.press('#fikr', 'Enter');
    expect(await readInbox(page)).toHaveLength(0);
  });

  test('yozilgan matn sahifa yopilsa ham qoladi', async ({ page }) => {
    // Qoralama: fikr yozilib, saqlanmasdan sahifa yopilsa yo'qolmasin.
    await page.goto('/tez/');
    await page.fill('#fikr', 'yarim yozilgan fikr');
    await page.waitForTimeout(120);

    await page.reload();
    await expect(page.locator('#fikr')).toHaveValue('yarim yozilgan fikr');
  });

  test('eng yangi fikr birinchi turadi', async ({ page }) => {
    await page.goto('/tez/');
    for (const text of ['birinchi', 'ikkinchi', 'uchinchi']) {
      await page.fill('#fikr', text);
      await page.press('#fikr', 'Enter');
    }
    await expect(page.locator('.tez-item p')).toHaveText(['uchinchi', 'ikkinchi', 'birinchi']);
  });
});

test.describe('Kiruvchi Makonda', () => {
  const seed = async page => {
    await page.goto('/tez/');
    for (const text of ['Portfolio qilishim kerak', 'Ingliz tili']) {
      await page.fill('#fikr', text);
      await page.press('#fikr', 'Enter');
    }
  };

  test('Kiruvchi bo‘sh bo‘lsa tugma KO‘RINMAYDI', async ({ page }) => {
    // Ishlatilmaydigan tugma faqat ekranni to'ldiradi.
    await page.goto('/map.html');
    await expect(page.locator('#railInbox')).toBeHidden();
  });

  test('fikr yozilgach tugma va hisoblagich paydo bo‘ladi', async ({ page }) => {
    await seed(page);
    await page.goto('/map.html');
    await expect(page.locator('#railInbox')).toBeVisible();
    await expect(page.locator('#railInboxCount')).toHaveText('2');
  });

  test('fikrni makonga ko‘chiradi va Kiruvchidan olib tashlaydi', async ({ page }) => {
    await seed(page);
    await page.goto('/map.html');
    await page.locator('#railInbox').click();

    const panel = page.locator('#inboxPanel');
    await expect(panel).toBeVisible();
    // Ro'yxat eng yangisidan boshlanadi, ya'ni birinchi qator — "Ingliz tili".
    await panel.locator('.inbox-add').first().click();

    await expect(page.locator('.thought-card', { hasText: 'Ingliz tili' })).toHaveCount(1);

    const inbox = await readInbox(page);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].text).toBe('Portfolio qilishim kerak');

    // Eng muhimi: ko'chirilgan fikr SAQLANGAN bo'lishi kerak. Ilgari
    // `save()` chaqirilmagani uchun karta faqat ekranda ko'rinardi va
    // sahifa yangilanishi bilan yo'qolardi.
    await page.reload();
    await expect(page.locator('.thought-card', { hasText: 'Ingliz tili' })).toHaveCount(1);
  });

  test('"Hammasini qo‘shish" barchasini ko‘chiradi va panelni yopadi', async ({ page }) => {
    await seed(page);
    await page.goto('/map.html');
    await page.locator('#railInbox').click();
    await page.locator('.inbox-all').click();

    expect(await readInbox(page)).toHaveLength(0);
    await expect(page.locator('#inboxPanel')).toHaveCount(0);
    await expect(page.locator('#railInbox')).toBeHidden();
  });
});

/**
 * Oflayn ishlash — bu sahifaning asosiy va'dasi. Metroda, liftda yoki
 * tarmoq yo'q joyda fikr kelsa, ilova baribir ochilishi kerak.
 */
test.describe('Oflayn', () => {
  test('tarmoqsiz ham ochiladi va yozish mumkin', async ({ page, context }) => {
    // Birinchi tashrif service worker'ni o'rnatadi.
    await page.goto('/tez/');
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto('/tez/');

    await expect(page.locator('#fikr')).toBeVisible();
    await page.fill('#fikr', 'tarmoqsiz yozilgan fikr');
    await page.press('#fikr', 'Enter');

    const inbox = await readInbox(page);
    expect(inbox.map(entry => entry.text)).toContain('tarmoqsiz yozilgan fikr');

    await context.setOffline(false);
  });
});
