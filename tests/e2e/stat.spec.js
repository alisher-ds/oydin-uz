/**
 * Anonim statistika — HAQIQATAN anonimmi?
 *
 * Bu spec funksiyani emas, VA'DANI tekshiradi. Kod kelajakda o'zgarganda
 * ham quyidagilar buzilmasligi kerak:
 *  - tarmoqqa faqat yopiq ro'yxatdagi hodisa nomlari chiqadi;
 *  - foydalanuvchi yozgan matn HECH QACHON so'rovga tushmaydi;
 *  - o'chirib qo'yilgan bo'lsa birorta ham so'rov ketmaydi.
 *
 * Shuning uchun tekshiruv tarmoq darajasida: sahifa aslida NIMA
 * yuborayotgani o'qiladi, kodning niyati emas.
 */

import { expect, test } from '@playwright/test';
import { blockExternalRequests } from './helpers.js';

/** Ruxsat etilgan hodisalar — `functions/api/stat.js` bilan bir xil. */
const ALLOWED = new Set([
  'tashrif',
  'qaytish',
  'sahifa:oydin',
  'sahifa:makon',
  'ornatildi',
  'fikr',
  'aloqa',
  'makon',
  'tez',
  'tez:makonga',
  'recall:korsatildi',
  'recall:qabul',
  'recall:yopildi',
  'ai'
]);

/** Statistikaga ketgan har bir so'rovning tanasini yig'adi. */
function captureStats(page) {
  const bodies = [];
  page.on('request', request => {
    if (request.url().includes('/api/stat')) bodies.push(request.postData() ?? '');
  });
  return bodies;
}

/** Yig'ilgan tanalardan hodisa nomlarini ajratadi. */
const eventsOf = bodies =>
  bodies.flatMap(body => {
    try {
      return JSON.parse(body).e ?? [];
    } catch {
      return [];
    }
  });

/** Statistika lokal manzilda o'chiq — sinov uchun ataylab yoqamiz. */
const enable = page => page.addInitScript(() => localStorage.setItem('oydin-stat', 'on'));

/** So'nggi hodisalar yuborilishini kutadi (yig'ish oynasi 400 ms). */
const settle = page => page.waitForTimeout(900);

test.beforeEach(async ({ page }) => {
  await blockExternalRequests(page);
});

test.describe('Anonim statistika', () => {
  test('sahifa ochilishi qayd etiladi', async ({ page }) => {
    await enable(page);
    const bodies = captureStats(page);

    await page.goto('/map.html');
    await settle(page);

    const events = eventsOf(bodies);
    expect(events).toContain('sahifa:makon');
    expect(events).toContain('tashrif');
  });

  test('bosh sahifa boshqa nom bilan qayd etiladi', async ({ page }) => {
    await enable(page);
    const bodies = captureStats(page);

    await page.goto('/index.html');
    await settle(page);

    expect(eventsOf(bodies)).toContain('sahifa:oydin');
  });

  test('yozilgan fikr MATNI hech qachon yuborilmaydi', async ({ page }) => {
    await enable(page);
    const bodies = captureStats(page);
    const maxfiy = 'Ertaga shifokorga borishim kerak';

    await page.goto('/map.html');
    await page.locator('#railTez').click();
    await page.locator('#tezInput').fill(maxfiy);
    await page.locator('#tezInput').press('Enter');
    await settle(page);

    // Hodisa yuborilgan…
    expect(eventsOf(bodies)).toContain('tez');

    // …lekin matnning birorta bo'lagi ham emas.
    const hammasi = bodies.join(' ');
    expect(hammasi).not.toContain(maxfiy);
    for (const soz of maxfiy.split(' ')) {
      expect(hammasi.toLowerCase()).not.toContain(soz.toLowerCase());
    }
  });

  test('faqat oldindan ma’lum nomlar chiqadi — boshqa hech narsa', async ({ page }) => {
    await enable(page);
    const bodies = captureStats(page);

    await page.goto('/map.html');
    await page.locator('#railTez').click();
    await page.locator('#tezInput').fill('sinov');
    await page.locator('#tezInput').press('Enter');
    await settle(page);

    const events = eventsOf(bodies);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) expect(ALLOWED.has(event)).toBe(true);

    // So'rov tanasida `e` dan boshqa maydon bo'lmasligi kerak.
    for (const body of bodies) {
      expect(Object.keys(JSON.parse(body))).toEqual(['e']);
    }
  });

  test('o‘chirib qo‘yilsa BIRORTA ham so‘rov ketmaydi', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('oydin-stat', 'off'));
    const bodies = captureStats(page);

    await page.goto('/map.html');
    await page.locator('#railTez').click();
    await page.locator('#tezInput').fill('bu hech qayerga ketmaydi');
    await page.locator('#tezInput').press('Enter');
    await settle(page);

    expect(bodies).toHaveLength(0);
  });

  test('o‘sha kuni ikkinchi marta ochilsa "tashrif" takrorlanmaydi', async ({ page }) => {
    await enable(page);
    const bodies = captureStats(page);

    await page.goto('/map.html');
    await settle(page);
    expect(eventsOf(bodies)).toContain('tashrif');

    bodies.length = 0;
    await page.reload();
    await settle(page);

    const events = eventsOf(bodies);
    expect(events).toContain('sahifa:makon');
    expect(events).not.toContain('tashrif');
  });
});
