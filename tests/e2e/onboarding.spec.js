/**
 * Birinchi tashrif tajribasi va ma'lumot ishonchliligi.
 *
 * Uchta narsa tekshiriladi:
 *  1. Qo'llanma — FAQAT birinchi marta, har doim to'xtatib bo'ladigan;
 *  2. Saqlash ko'rsatkichi — HAQIQATAN ko'rinadigan (u bir vaqtlar
 *     `display: none !important` bilan yashirilgan edi);
 *  3. Bekor qilish — ekranda javob beradigan.
 */

import { expect, test } from '@playwright/test';
import { blockExternalRequests, seedMap, skipTour } from './helpers.js';

/** Qo'llanma ko'rsatilgan deb belgilangan qurilma. */
const asReturning = page => skipTour(page);

test.beforeEach(async ({ page }) => {
  await blockExternalRequests(page);
});

test.describe('Birinchi kirgan odam uchun qo‘llanma', () => {
  test('birinchi tashrifda O‘ZI ochiladi', async ({ page }) => {
    await page.goto('/map.html');
    await expect(page.locator('.tour')).toBeVisible();
    await expect(page.locator('.tour-card h2')).toHaveText('Bu — sizning makoningiz');
  });

  test('ikkinchi tashrifda ochilmaydi', async ({ page }) => {
    await page.goto('/map.html');
    await expect(page.locator('.tour')).toBeVisible();

    // Oxirigacha o'tamiz.
    for (let step = 0; step < 4; step += 1) {
      await page.locator('.tour-card .primary-button').click();
    }
    await page.locator('.tour-card .primary-button').click();
    await expect(page.locator('.tour')).toHaveCount(0);

    await page.reload();
    await page.waitForTimeout(700);
    await expect(page.locator('.tour')).toHaveCount(0);
  });

  test('beshta qadamning hammasi ko‘rinadi', async ({ page }) => {
    await page.goto('/map.html');
    const sarlavhalar = [];
    for (let step = 0; step < 5; step += 1) {
      sarlavhalar.push(await page.locator('.tour-card h2').textContent());
      await page.locator('.tour-card .primary-button').click();
    }
    expect(sarlavhalar).toHaveLength(5);
    expect(new Set(sarlavhalar).size).toBe(5);
    await expect(page.locator('.tour')).toHaveCount(0);
  });

  test('Esc bilan chiqib ketish mumkin va u qaytmaydi', async ({ page }) => {
    await page.goto('/map.html');
    await expect(page.locator('.tour')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.tour')).toHaveCount(0);

    await page.reload();
    await page.waitForTimeout(700);
    await expect(page.locator('.tour')).toHaveCount(0);
  });

  test('"O‘tkazib yuborish" ham ishlaydi', async ({ page }) => {
    await page.goto('/map.html');
    await page.locator('.tour-skip').click();
    await expect(page.locator('.tour')).toHaveCount(0);
  });

  test('ishi bor odamga O‘ZI ochilmaydi', async ({ page }) => {
    // Belgi yo'q, lekin makonda fikrlar bor — bu odam yangi emas.
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(700);
    await expect(page.locator('.tour')).toHaveCount(0);
  });

  test('Yordam oynasidagi tugma qo‘llanmani qayta ochadi', async ({ page }) => {
    await asReturning(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);
    await expect(page.locator('.tour')).toHaveCount(0);

    await page.locator('#help').click();
    await page.locator('#replayTour').click();
    await expect(page.locator('.tour')).toBeVisible();
  });

  /**
   * Qadam yo'q elementga ishora qilsa, qo'llanma bo'sh joyni yoritadi va
   * yolg'on gapiradi. Bu test aynan shuni ushlaydi.
   */
  test('har bir qadamning nishoni HAQIQATAN sahifada bor', async ({ page }) => {
    await asReturning(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    const yoq = await page.evaluate(async () => {
      const { STEPS } = await import('/assets/js/map/tour.js');
      return STEPS.filter(step => step.target && !document.querySelector(step.target)).map(
        step => step.target
      );
    });
    expect(yoq).toEqual([]);
  });
});

test.describe('Saqlash ko‘rsatkichi', () => {
  /**
   * Regressiya: bu element kodda bor edi va to'g'ri ishlardi, lekin
   * `.map-page #saveStatus { display: none !important }` uni butunlay
   * yashirib qo'ygan edi.
   */
  test('HAQIQATAN ko‘rinadi — yashirilgan emas', async ({ page }) => {
    await asReturning(page);
    await page.goto('/map.html');
    await expect(page.locator('#saveStatus')).toBeVisible();

    const olcham = await page.locator('#saveStatus').boundingBox();
    expect(olcham.width).toBeGreaterThan(40);
    expect(olcham.height).toBeGreaterThan(16);
  });

  test('ekranning pastki o‘ng burchagida turadi', async ({ page }) => {
    await asReturning(page);
    await page.goto('/map.html');
    const box = await page.locator('#saveStatus').boundingBox();
    const view = page.viewportSize();
    expect(box.x + box.width).toBeGreaterThan(view.width * 0.6);
    expect(box.y).toBeGreaterThan(view.height * 0.6);
  });

  test('internet yo‘qolsa buni aytadi', async ({ page, context }) => {
    await asReturning(page);
    await page.goto('/map.html');
    await page.waitForTimeout(600);

    await context.setOffline(true);
    await page.waitForTimeout(400);
    await expect(page.locator('#saveStatus')).toContainText('oflayn');

    await context.setOffline(false);
  });
});

test.describe('Bekor qilish ko‘rinadigan bo‘ldi', () => {
  test('Ctrl+Z xabar chiqaradi va qaytarish yo‘lini aytadi', async ({ page }) => {
    await asReturning(page);
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(700);

    // Tarix uchun bitta o'zgarish kerak.
    await page.locator('#addFirst').click();
    await page.locator('#thoughtText').fill('Bekor qilinadigan fikr');
    await page.locator('#cardForm button[type="submit"]').click();
    await expect(page.locator('.thought-card', { hasText: 'Bekor qilinadigan fikr' })).toHaveCount(
      1
    );

    await page.keyboard.press('Control+z');
    await expect(page.locator('.toast')).toBeVisible();
    await expect(page.locator('.toast-text')).toHaveText('Bekor qilindi.');
    await expect(page.locator('.toast-hint')).toContainText('Ctrl+Shift+Z');
    await expect(page.locator('.thought-card', { hasText: 'Bekor qilinadigan fikr' })).toHaveCount(
      0
    );
  });

  test('Ctrl+Shift+Z HAQIQATAN qaytaradi — xabar yolg‘on emas', async ({ page }) => {
    await asReturning(page);
    await seedMap(page);
    await page.goto('/map.html');
    await page.waitForTimeout(700);

    await page.locator('#addFirst').click();
    await page.locator('#thoughtText').fill('Qaytariladigan fikr');
    await page.locator('#cardForm button[type="submit"]').click();

    await page.keyboard.press('Control+z');
    await expect(page.locator('.thought-card', { hasText: 'Qaytariladigan fikr' })).toHaveCount(0);

    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('.thought-card', { hasText: 'Qaytariladigan fikr' })).toHaveCount(1);
    await expect(page.locator('.toast-text')).toHaveText('Qaytarildi.');
  });
});

test.describe('Zaxira eslatmasi', () => {
  /**
   * DIQQAT: `addInitScript` HAR navigatsiyada ishlaydi, shuning uchun
   * faqat BIR MARTA ekamiz. Aks holda `reload()` dan keyin ilova yozgan
   * "yopildi" belgisi qayta yozilib ketardi va test yolg'on natija
   * berardi. Xuddi shu tuzoq `seedMap` da ham hujjatlashtirilgan.
   */
  const seedQuiet = (page, days) =>
    page.addInitScript(quiet => {
      const MARKER = '__oydin_backup_seeded';
      if (localStorage.getItem(MARKER)) return;
      localStorage.setItem(
        'oydin-backup-v1',
        JSON.stringify({ firstSeenAt: new Date(Date.now() - quiet * 86400000).toISOString() })
      );
      localStorage.setItem(MARKER, '1');
    }, days);

  test('ma’lumot bir haftadan beri qurilmadan chiqmagan bo‘lsa chiqadi', async ({ page }) => {
    await asReturning(page);
    await seedMap(page);
    await seedQuiet(page, 30);
    await page.goto('/map.html');

    await expect(page.locator('#backupNotice')).toBeVisible();
    await expect(page.locator('#backupNotice')).toContainText('faqat shu qurilmada');
  });

  test('yangi kelgan odamni bezovta qilmaydi', async ({ page }) => {
    await asReturning(page);
    await seedMap(page);
    await seedQuiet(page, 1);
    await page.goto('/map.html');
    await page.waitForTimeout(600);
    await expect(page.locator('#backupNotice')).toBeHidden();
  });

  test('yopilgach BOSHQA HECH QACHON qaytmaydi', async ({ page }) => {
    await asReturning(page);
    await seedMap(page);
    await seedQuiet(page, 30);
    await page.goto('/map.html');

    await page.locator('#backupNotice [aria-label="Yopish"]').click();
    await expect(page.locator('#backupNotice')).toBeHidden();

    await page.reload();
    await page.waitForTimeout(700);
    await expect(page.locator('#backupNotice')).toBeHidden();
  });
});

/**
 * Vault faqat SO'RALGANDA yaratiladi.
 *
 * Ilgari `startSync()` sahifa ochilishi bilan shartsiz so'rov yuborardi
 * va server tokensiz so'rovga javoban yangi vault yaratardi. Ya'ni
 * saytga kirgan har bir odam — hech narsa bosmasa ham — bazada doimiy
 * qator qoldirardi. Bu "sinxronizatsiya ixtiyoriy" degan va'daga zid.
 *
 * Tekshiruv tarmoq darajasida: sahifa ASLIDA nima yuborayotgani
 * o'qiladi, kodning niyati emas.
 */
test.describe('Sinxronizatsiya ixtiyoriy', () => {
  const TOKEN = 'a'.repeat(64);

  /** `/api/sync` ga ketgan so'rovlarni yig'adi. */
  const captureSync = page => {
    const seen = [];
    page.on('request', request => {
      if (request.url().includes('/api/sync')) seen.push(request.method());
    });
    return seen;
  };

  test('sahifa ochilishida serverga HECH NARSA yuborilmaydi', async ({ page }) => {
    await asReturning(page);
    const seen = captureSync(page);

    await page.goto('/map.html');
    await page.waitForTimeout(1800); // `schedule(800)` + zaxira

    expect(seen, 'tokensiz so‘rov ketdi — vault yaratilardi').toEqual([]);
  });

  test('fikr yozilganda ham yuborilmaydi', async ({ page }) => {
    await asReturning(page);
    const seen = captureSync(page);

    await page.goto('/map.html');
    await page.locator('#addFirst').click();
    await page.locator('#thoughtText').fill('Lokal fikr');
    await page.locator('#cardForm button[type="submit"]').click();
    await page.waitForTimeout(2200); // debounce 1500ms dan uzoq

    expect(seen).toEqual([]);
  });

  test('kaliti BOR qurilma avvalgidek sinxronlanadi', async ({ page }) => {
    await asReturning(page);
    await page.addInitScript(token => {
      localStorage.setItem('oydin-vault-token-v1', token);
    }, TOKEN);
    const seen = captureSync(page);

    await page.goto('/map.html');
    await page.waitForTimeout(1800);

    expect(seen.length, 'kaliti bor qurilma sinxronlanmadi').toBeGreaterThan(0);
  });

  test('kalit oynasida "Yoqish" tugmasi bor va u so‘rov yuboradi', async ({ page }) => {
    await asReturning(page);
    const seen = captureSync(page);

    await page.goto('/map.html');
    await page.waitForTimeout(900);
    await page.locator('.sync-status').click();

    const enable = page.locator('#vaultDialog [data-enable]');
    await expect(enable).toBeVisible();
    expect(seen, 'oyna ochilishining o‘zi so‘rov yubormasligi kerak').toEqual([]);

    await enable.click();
    await page.waitForTimeout(900);
    expect(seen, 'yoqilganda vault yaratilishi kerak').toContain('POST');
  });
});

/**
 * Service worker HAQIQATAN ro'yxatdan o'tadi.
 *
 * REGRESSIYA: `registerServiceWorker()` `load` hodisasiga tinglovchi
 * qo'yardi, lekin o'zi `boot-map.js` dagi `await recoverMissing()` dan
 * KEYIN chaqirilardi. Modul darajasidagi `await` qolgan kodni
 * kechiktiradi — IndexedDB sekin javob bersa, `load` allaqachon o'tib
 * ketgan bo'lardi va tinglovchi hech qachon ishlamasdi.
 *
 * Oqibati: ilova bosh ekranga o'rnatilmaydi, oflayn ishlamaydi va —
 * eng yomoni — eski keshli qurilmada yangi SW faollashmaydi, ya'ni
 * eski nusxa cheksiz qolib ketadi. Bir qurilmada ishlaydi, boshqasida
 * yo'q.
 */
test.describe('Oflayn va o‘rnatish', () => {
  for (const page_ of ['/map.html', '/index.html']) {
    test(`${page_} — service worker ro‘yxatdan o‘tadi`, async ({ page }) => {
      await asReturning(page);
      await page.goto(page_, { waitUntil: 'domcontentloaded' });

      await expect
        .poll(
          () => page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length)),
          { message: 'service worker ro‘yxatdan o‘tmadi', timeout: 10_000 }
        )
        .toBeGreaterThan(0);
    });
  }

  test('kesh versiyasi sahifadagi modullar bilan mos', async ({ page, request }) => {
    await asReturning(page);
    await page.goto('/map.html', { waitUntil: 'domcontentloaded' });

    // `sw.js` oldindan keshlaydigan har bir fayl haqiqatan yetkaziladi.
    const source = await (await request.get('/sw.js')).text();
    const list = [...source.matchAll(/'(\/[^']+)'/g)]
      .map(m => m[1])
      .filter(url => url.startsWith('/assets/') || url.endsWith('.html'));

    for (const url of list) {
      const response = await request.get(url);
      expect(response.status(), `${url} yetkazilmadi`).toBe(200);
    }
  });
});

/**
 * Kalitni boshqarish.
 *
 * REGRESSIYA: kalit bir marta yaratilgach abadiy amal qilardi. Uni
 * ko'rgan har kim serverdagi nusxaga cheksiz kira olardi, "uzish" esa
 * faqat brauzerdagi nusxani o'chirardi.
 */
test.describe('Kalitni boshqarish', () => {
  const TOKEN = 'b'.repeat(64);

  const withToken = page =>
    page.addInitScript(token => {
      localStorage.setItem('oydin-vault-token-v1', token);
    }, TOKEN);

  const openVault = async page => {
    await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await page.locator('.sync-status').click();
    await expect(page.locator('#vaultDialog')).toBeVisible();
  };

  test('kaliti bor bo‘lsa uchta amal ko‘rinadi', async ({ page }) => {
    await asReturning(page);
    await withToken(page);
    await openVault(page);

    await expect(page.locator('#vaultDialog [data-rotate]')).toBeVisible();
    await expect(page.locator('#vaultDialog [data-forget]')).toBeVisible();
    await expect(page.locator('#vaultDialog [data-revoke]')).toBeVisible();
  });

  test('kaliti yo‘q bo‘lsa boshqaruv amallari YO‘Q', async ({ page }) => {
    await asReturning(page);
    await openVault(page);

    await expect(page.locator('#vaultDialog [data-enable]')).toBeVisible();
    await expect(page.locator('#vaultDialog [data-rotate]')).toHaveCount(0);
    await expect(page.locator('#vaultDialog [data-revoke]')).toHaveCount(0);
  });

  test('yangilash IKKI bosqichli — bir bosishda hech narsa bo‘lmaydi', async ({ page }) => {
    await asReturning(page);
    await withToken(page);

    const seen = [];
    page.on('request', request => {
      if (request.url().includes('/api/vault')) seen.push(request.method());
    });

    await openVault(page);
    await page.locator('#vaultDialog [data-rotate]').click();
    await page.waitForTimeout(500);

    // Birinchi bosish faqat so'raydi.
    await expect(page.locator('#vaultDialog [data-rotate]')).toHaveText('Tasdiqlang');
    await expect(page.locator('#vaultMessage')).toContainText('BOSHQA QURILMALAR');
    expect(seen, 'birinchi bosishda so‘rov ketmasligi kerak').toEqual([]);

    // Ikkinchisi bajaradi.
    await page.locator('#vaultDialog [data-rotate]').click();
    await page.waitForTimeout(700);
    expect(seen).toContain('POST');
  });

  test('o‘chirish ham tasdiq so‘raydi va nimani yo‘qotishini aytadi', async ({ page }) => {
    await asReturning(page);
    await withToken(page);
    await openVault(page);

    await page.locator('#vaultDialog [data-revoke]').click();
    await expect(page.locator('#vaultMessage')).toContainText('qaytarib bo‘lmaydi');
    await expect(page.locator('#vaultMessage')).toContainText('qurilmadagi fikrlar qoladi');
  });
});
