/**
 * Telefon uchun regressiya testlari.
 *
 * Auditda o'lchangan muammolar (390×844):
 *  - bosh sahifa va Oqim gorizontal aylanardi (460px va 483px);
 *  - Makonda asboblar paneli 184px balandlikda edi va uning ikkinchi
 *    klasteri (Yangi makon / Saqlash) ekrandan tashqarida — x=395..569 —
 *    qolib, telefonda umuman bosilmasdi;
 *  - yon panel 235px joy egallab, ish maydoni ekranning yarmidan pastda
 *    boshlanardi;
 *  - kartalar bitta nuqtaga yopishib qolardi;
 *  - o'nlab tugma 44px dan kichik, `#thoughtText` esa 13px shriftda edi
 *    (iOS fokusda sahifani kattalashtiradi).
 */

import { expect, test } from '@playwright/test';
import { blockExternalRequests, skipTour } from './helpers.js';

const MIN_TAP = 44;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await blockExternalRequests(page);
  await skipTour(page);
});

/** Ko'rinadigan interaktiv elementlarning o'lchamini tekshiradi. */
async function tooSmallTargets(page) {
  return page.evaluate(min => {
    const out = [];
    for (const el of document.querySelectorAll('button, a, input, select, textarea')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height < min || box.width < min) {
        out.push(
          `${(el.getAttribute('aria-label') || el.textContent || el.id).trim().slice(0, 24)} ${Math.round(box.width)}×${Math.round(box.height)}`
        );
      }
    }
    return [...new Set(out)];
  }, MIN_TAP);
}

const hasHorizontalScroll = page =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

for (const path of ['/index.html', '/map.html']) {
  test.describe(path, () => {
    test('gorizontal aylanish yo‘q', async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      expect(await hasHorizontalScroll(page)).toBe(false);
    });

    test('barcha tugmalar barmoq uchun yetarli', async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const small = await tooSmallTargets(page);
      expect(small, `kichik nishonlar: ${small.join(', ')}`).toEqual([]);
    });

    test('kiritish maydonlari 16px dan kichik emas', async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const tiny = await page.evaluate(() =>
        [...document.querySelectorAll('input, textarea, select')]
          .filter(el => {
            const cs = getComputedStyle(el);
            return cs.display !== 'none' && parseFloat(cs.fontSize) < 16;
          })
          .map(el => `${el.id || el.tagName} ${getComputedStyle(el).fontSize}`)
      );
      expect(tiny, 'iOS fokusda sahifani kattalashtiradi').toEqual([]);
    });
  });
}

test.describe('Makon telefonda', () => {
  test('sahifa vertikal ham sig‘adi', async ({ page }) => {
    await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const extra = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight
    );
    expect(extra, 'sahifa ekrandan baland').toBeLessThanOrEqual(8);
  });

  test('asboblar paneli bitta qatorga sig‘adi', async ({ page }) => {
    await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const height = await page
      .locator('.workspace-toolbar')
      .evaluate(el => el.getBoundingClientRect().height);
    // Ilgari 184px edi.
    expect(height).toBeLessThan(80);
  });

  test('paneldagi tugmalar ekran ichida', async ({ page }) => {
    await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll('.workspace-toolbar button')]
        .filter(el => getComputedStyle(el).display !== 'none')
        .filter(el => {
          const b = el.getBoundingClientRect();
          return b.right > window.innerWidth + 1 || b.left < -1;
        })
        .map(el => (el.getAttribute('aria-label') || el.textContent).trim())
    );
    expect(outside, 'tugma ekrandan tashqarida').toEqual([]);
  });

  test('barcha amallar "⋯" varag‘i orqali yetib boradi', async ({ page }) => {
    await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    await expect(page.locator('#mobileActionsOpen')).toBeVisible();
    await page.locator('#mobileActionsOpen').click();
    await expect(page.locator('#mobileActions')).toBeVisible();

    for (const label of ['Barcha yozuvlar', 'Avtomatik joylash', 'Yangi makon', 'Saqlash']) {
      await expect(page.locator('.mobile-action', { hasText: label })).toHaveCount(1);
    }
    // Varaq ham ekranga sig‘adi.
    const fits = await page
      .locator('#mobileActions')
      .evaluate(el => el.getBoundingClientRect().width <= window.innerWidth);
    expect(fits).toBe(true);
  });

  test('makon ohangi varaqda va ishlaydi', async ({ page }) => {
    await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.locator('#mobileActionsOpen').click();
    await page.locator('.mobile-swatch[data-space="ink"]').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#workspace')).toHaveClass(/space-ink/);
  });

  test('kartalar ustma-ust tushmaydi', async ({ page }) => {
    await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    for (const text of ['Birinchi fikr', 'Ikkinchi fikr', 'Uchinchi fikr']) {
      await page.locator('#addFirst').click();
      await page.locator('#thoughtText').fill(text);
      await page.locator('#submitCard').click();
      await page.waitForTimeout(300);
    }

    const positions = await page.evaluate(() =>
      [...document.querySelectorAll('.thought-card')].map(el => `${el.style.left}|${el.style.top}`)
    );
    expect(new Set(positions).size, 'kartalar bir nuqtada').toBe(positions.length);
  });

  test('to‘liq oqim: fikr yozish va bog‘lash', async ({ page }) => {
    await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    await page.locator('#emptyAdd').click();
    await page.locator('#thoughtText').fill('Telefondan yozilgan');
    await page.locator('#submitCard').click();
    await expect(page.locator('.thought-card')).toHaveCount(1);

    await page.locator('#addFirst').click();
    await page.locator('#thoughtText').fill('Ikkinchisi');
    await page.locator('#submitCard').click();
    await expect(page.locator('.thought-card')).toHaveCount(2);

    const id = await page.locator('.thought-card').first().getAttribute('data-card-id');
    await page.locator(`article[data-card-id="${id}"]`).click({ position: { x: 20, y: 15 } });
    await page.locator(`article[data-card-id="${id}"] .link`).click();
    await page.locator('.thought-card').nth(1).click();
    await expect(page.locator('#connectionCount')).toHaveText('1');
  });
});

/**
 * Makon sahifasida telefonda markaziy navigatsiya yashirilgan (asboblar
 * paneli baland bo'lib ketmasligi uchun), shuning uchun sahifalar "⋯"
 * varaqda bo'lishi shart — aks holda Makondan chiqib bo'lmaydi.
 */
test.describe('Telefonda navigatsiya', () => {
  test('Makonda sahifalar "⋯" varaqda qo‘l ostida', async ({ page }) => {
    await page.goto('/map.html');
    await expect(page.locator('.map-center-nav')).toBeHidden();

    const expected = await page.locator('.map-center-nav .topnav-link:not(.active)').count();
    expect(expected).toBeGreaterThan(0);

    await page.locator('.mobile-actions-trigger button').click();
    await expect(page.locator('.mobile-action-page')).toHaveCount(expected);

    await page.locator('.mobile-action-page').first().click();
    await expect(page).toHaveURL(/index\.html$/);
  });

  test('"Tez yozish" varaqda ham bor', async ({ page }) => {
    await page.goto('/map.html');
    await page.locator('.mobile-actions-trigger button').click();
    await expect(page.locator('.mobile-action', { hasText: 'Tez yozish' })).toHaveCount(1);
  });
});
