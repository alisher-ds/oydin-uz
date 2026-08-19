/**
 * Tez yozish panelining TO'LIQ funksional tekshiruvi.
 *
 * Bu panel ilgari alohida "Oqim" sahifasi edi. Sahifa olib tashlanganda
 * bironta imkoniyat yo'qolmasligi kerak edi — quyidagi ro'yxat aynan
 * shuni qo'riqlaydi. Har bir band alohida tekshiriladi va yiqilganlari
 * bitta ro'yxatda ko'rsatiladi, shunda birinchi xato qolganlarini
 * yashirmaydi.
 */

import { expect, test } from '@playwright/test';
import { skipTour } from './helpers.js';

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`✅ ${name}`);
  } catch (e) {
    results.push(`❌ ${name} — ${String(e).split('\n')[0].slice(0, 110)}`);
  }
};

test.beforeEach(async ({ page }) => {
  await skipTour(page);
});

test('to‘liq funksional tekshiruv', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const open = async () => {
    await page.locator('#railTez').click();
    await expect(page.locator('#tezPanel')).toBeVisible();
  };
  const addVia = async (text, how) => {
    await page.locator('#tezInput').fill(text);
    if (how === 'button') await page.locator('#tezPanel .primary-button').first().click();
    else await page.locator('#tezInput').press(how);
  };

  await page.goto('/map.html');
  await page.waitForTimeout(600);

  await check('yon paneldagi tugma ko‘rinadi', async () =>
    expect(page.locator('#railTez')).toBeVisible()
  );

  await check('tugma panelni ochadi', open);

  await check('bo‘sh holat matni chiqadi', async () =>
    expect(page.locator('.oqim-empty')).toHaveText('Hozircha bu yer bo‘sh.')
  );

  await check('tugma bilan qo‘shish', async () => {
    await addVia('Birinchi fikr', 'button');
    await expect(page.locator('.idea-row')).toHaveCount(1);
  });

  await check('Enter bilan qo‘shish', async () => {
    await addVia('Ikkinchi fikr', 'Enter');
    await expect(page.locator('.idea-row')).toHaveCount(2);
  });

  await check('Ctrl+Enter bilan qo‘shish', async () => {
    await addVia('Uchinchi fikr', 'Control+Enter');
    await expect(page.locator('.idea-row')).toHaveCount(3);
  });

  await check('Shift+Enter saqlamaydi, yangi qator qo‘shadi', async () => {
    await page.locator('#tezInput').fill('yarim');
    await page.locator('#tezInput').press('Shift+Enter');
    await expect(page.locator('.idea-row')).toHaveCount(3);
    await expect(page.locator('#tezInput')).toHaveValue(/yarim\n/);
    await page.locator('#tezInput').fill('');
  });

  await check('bo‘sh matn saqlanmaydi', async () => {
    await addVia('   ', 'Enter');
    await expect(page.locator('.idea-row')).toHaveCount(3);
  });

  await check('belgi hisoblagichi yangilanadi', async () => {
    await page.locator('#tezInput').fill('abcde');
    await expect(page.locator('#tezCount')).toHaveText('5 / 1000');
    await page.locator('#tezInput').fill('');
  });

  await check('eng yangi fikr birinchi turadi', async () =>
    expect(page.locator('.idea-text').first()).toHaveText('Uchinchi fikr')
  );

  await check('sana ko‘rsatiladi', async () =>
    expect(page.locator('.idea-date').first()).not.toBeEmpty()
  );

  await check('qidiruv filtrlaydi', async () => {
    await page.locator('#tezSearch').fill('ikkinchi');
    await expect(page.locator('.idea-row')).toHaveCount(1);
  });

  await check('qidiruv topilmasa xabar beradi', async () => {
    await page.locator('#tezSearch').fill('zzzz');
    await expect(page.locator('.oqim-empty')).toHaveText('Mos fikr topilmadi.');
    await page.locator('#tezSearch').fill('');
  });

  await check('tahrirlash saqlanadi', async () => {
    await page.locator('.idea-row').first().locator('[aria-label="Fikrni tahrirlash"]').click();
    await page.locator('.idea-edit').fill('Tahrirlangan');
    await page.locator('.idea-save').click();
    await expect(page.locator('.idea-text').first()).toHaveText('Tahrirlangan');
  });

  await check('tahrirlashni bekor qilish', async () => {
    await page.locator('.idea-row').first().locator('[aria-label="Fikrni tahrirlash"]').click();
    await page.locator('.idea-edit').fill('BEKOR');
    await page.locator('[aria-label="Tahrirlashni bekor qilish"]').click();
    await expect(page.locator('.idea-text').first()).toHaveText('Tahrirlangan');
  });

  await check('o‘chirish ishlaydi', async () => {
    await page.locator('.idea-row').first().locator('[aria-label="Fikrni o‘chirish"]').click();
    await expect(page.locator('.idea-row')).toHaveCount(2);
  });

  await check('Makonga ko‘chiradi', async () => {
    await page.locator('.idea-row').first().locator('.soft-button').click();
    await expect(page.locator('.idea-row')).toHaveCount(1);
    await expect(page.locator('#tezStatus')).toHaveText('Makonga ko‘chirildi.');
  });

  await check('hisoblagich yangilanadi', async () =>
    expect(page.locator('#railTezCount')).toHaveText('1')
  );

  await check('Escape panelni yopadi', async () => {
    await page.keyboard.press('Escape');
    await expect(page.locator('#tezPanel')).toHaveCount(0);
  });

  await check('karta Makonda paydo bo‘ldi', async () =>
    expect(page.locator('.thought-card')).toHaveCount(1)
  );

  await check('`t` qisqartmasi panelni ochadi', async () => {
    await page.keyboard.press('t');
    await expect(page.locator('#tezPanel')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  await check('yangilashdan keyin hammasi joyida', async () => {
    await page.reload();
    await page.waitForTimeout(700);
    await expect(page.locator('.thought-card')).toHaveCount(1);
    await expect(page.locator('#railTezCount')).toHaveText('1');
    await page.locator('#railTez').click();
    await expect(page.locator('.idea-text')).toHaveCount(1);
  });

  console.log('\n' + results.join('\n'));
  console.log(`\nkonsol xatolari: ${errors.length ? errors.join(' | ') : 'yo‘q'}`);
  expect(
    results.filter(r => r.startsWith('❌')),
    results.join('\n')
  ).toEqual([]);
});

test.describe('Telefonda', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('panel sig‘adi va amallar barmoq uchun yetarli', async ({ page }) => {
    await page.goto('/map.html');
    await page.waitForTimeout(600);
    await page.locator('#railTez').click();

    await page.locator('#tezInput').fill('Telefonda yozilgan fikr');
    await page.locator('#tezPanel .primary-button').first().click();
    await expect(page.locator('.idea-row')).toHaveCount(1);

    const m = await page.evaluate(() => {
      const rect = document.querySelector('#tezPanel').getBoundingClientRect();
      const input = document.querySelector('#tezInput');
      return {
        fits: rect.left >= -1 && rect.right <= innerWidth + 1,
        fontSize: parseFloat(getComputedStyle(input).fontSize),
        docW: document.documentElement.scrollWidth,
        winW: innerWidth
      };
    });

    expect(m.fits, 'panel ekrandan chiqmasligi kerak').toBe(true);
    expect(m.docW, 'sahifa yon tomonga aylanmasligi kerak').toBeLessThanOrEqual(m.winW);
    // 16px dan kichik shriftda iOS fokusda sahifani kattalashtiradi.
    expect(m.fontSize).toBeGreaterThanOrEqual(16);

    // Telefonda hover yo'q — amal tugmalari doim ko'rinishi shart.
    await expect(page.locator('.idea-actions').first()).toHaveCSS('opacity', '1');

    const sizes = await page.locator('#tezPanel button').evaluateAll(els =>
      els
        .filter(el => el.offsetParent !== null)
        .map(el => {
          const r = el.getBoundingClientRect();
          return Math.round(Math.min(r.width, r.height));
        })
    );
    expect(
      sizes.filter(size => size < 44),
      `kichik tugmalar: ${sizes}`
    ).toEqual([]);
  });
});
