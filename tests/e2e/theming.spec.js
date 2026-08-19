/**
 * Mavzu va umumiy komponentlar uchun regressiya testlari.
 *
 * Bularning har biri jonli saytda ko'rilgan aniq nuqsonga bog'langan:
 *  - sinxronizatsiya belgisi va vault oynasi bosh sahifada uslubsiz chiqardi,
 *    chunki ularning CSS'i faqat `map.css` da edi;
 *  - suhbat oynasi tungi rejimda oq bo'lib qolardi (`ai.css` da qattiq
 *    yozilgan yorug' ranglar, `.night` qoidalari yo'q edi);
 *  - vault oynasidagi tugmalar o'ng chetdan qirqilardi (ichki panel o'z
 *    dialogidan keng edi).
 */

import { expect, test } from '@playwright/test';
import { blockExternalRequests } from './helpers.js';

const PAGES = ['/index.html', '/oqim.html', '/map.html'];

const withTheme = async (page, theme) => {
  await page.addInitScript(t => localStorage.setItem('oydin-theme', t), theme);
};

test.beforeEach(async ({ page }) => {
  await blockExternalRequests(page);
});

test.describe('Umumiy komponentlar har bir sahifada uslubga ega', () => {
  for (const path of PAGES) {
    test(`${path} — sinxronizatsiya belgisi uslublangan`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);

      const badge = page.locator('#syncStatus');
      await expect(badge).toHaveCount(1);

      const style = await badge.evaluate(el => {
        const cs = getComputedStyle(el);
        const dot = el.querySelector('.sync-dot');
        return {
          radius: parseFloat(cs.borderRadius),
          paddingTop: parseFloat(cs.paddingTop),
          dotWidth: dot ? parseFloat(getComputedStyle(dot).width) : 0
        };
      });
      // Uslubsiz tugmada radius ~0, ichki nuqta esa 0px bo'lardi.
      expect(style.radius, 'belgi dumaloq emas — CSS yuklanmagan').toBeGreaterThan(20);
      expect(style.paddingTop).toBeGreaterThan(3);
      expect(style.dotWidth, 'holat nuqtasi ko‘rinmayapti').toBeGreaterThan(3);
    });

    test(`${path} — vault oynasi uslublangan va qirqilmaydi`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      await page.locator('#syncStatus').click();

      const dialog = page.locator('#vaultDialog');
      await expect(dialog).toBeVisible();

      const result = await dialog.evaluate(el => {
        const panel = el.querySelector('.vault-dialog');
        const cs = getComputedStyle(panel);
        const box = el.getBoundingClientRect();
        const clipped = [...el.querySelectorAll('button, input')].filter(node => {
          const b = node.getBoundingClientRect();
          return b.right > box.right + 0.5 || b.left < box.left - 0.5;
        }).length;
        return {
          width: Math.round(box.width),
          padding: parseFloat(cs.paddingTop),
          fieldDisplay: getComputedStyle(el.querySelector('.vault-field')).display,
          rowDisplay: getComputedStyle(el.querySelector('.vault-token-row')).display,
          clipped
        };
      });

      expect(result.padding, 'panel uslubsiz — padding yo‘q').toBeGreaterThan(10);
      expect(result.width, 'oyna juda keng — uslub qo‘llanmagan').toBeLessThan(800);
      expect(result.fieldDisplay).toBe('grid');
      expect(result.rowDisplay).toBe('flex');
      expect(result.clipped, 'element dialog chetidan chiqib ketgan').toBe(0);
    });
  }
});

test.describe('Tungi rejim', () => {
  test('suhbat oynasi mavzuga ergashadi', async ({ browser }) => {
    const read = async theme => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await blockExternalRequests(page);
      await withTheme(page, theme);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      await page.locator('#oydinAiOpen').click();
      await page.waitForTimeout(300);
      const colors = await page.locator('.ai-dialog').evaluate(el => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, fg: cs.color };
      });
      await ctx.close();
      return colors;
    };

    const light = await read('light');
    const night = await read('night');

    // Ilgari ikkalasi ham bir xil krem rangda edi.
    expect(night.bg, 'tungi rejimda fon o‘zgarmadi').not.toBe(light.bg);
    expect(night.fg, 'tungi rejimda matn rangi o‘zgarmadi').not.toBe(light.fg);

    const luminance = color => {
      const [r, g, b] = color.match(/\d+/g).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(luminance(night.bg), 'tungi fon yorug‘ qolgan').toBeLessThan(luminance(light.bg));
  });

  test('mavzu almashtirilganda suhbat oynasi ham o‘zgaradi', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);

    await page.locator('#oydinAiOpen').click();
    const before = await page
      .locator('.ai-dialog')
      .evaluate(el => getComputedStyle(el).backgroundColor);
    await page.keyboard.press('Escape');

    await page.locator('#themeToggle').click();
    await page.waitForTimeout(250);
    await page.locator('#oydinAiOpen').click();
    const after = await page
      .locator('.ai-dialog')
      .evaluate(el => getComputedStyle(el).backgroundColor);

    expect(after).not.toBe(before);
  });
});

test.describe('Mobil kenglikda ham qirqilmaydi', () => {
  test.use({ viewport: { width: 380, height: 780 } });

  test('vault oynasi 380px da sig‘adi', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    await page.locator('#syncStatus').click();

    const overflow = await page.locator('#vaultDialog').evaluate(el => {
      const box = el.getBoundingClientRect();
      return {
        widerThanViewport: box.width > window.innerWidth,
        horizontalScroll: el.scrollWidth > el.clientWidth + 1,
        clipped: [...el.querySelectorAll('button, input')].filter(n => {
          const b = n.getBoundingClientRect();
          return b.right > box.right + 0.5;
        }).length
      };
    });
    expect(overflow.widerThanViewport).toBe(false);
    expect(overflow.horizontalScroll).toBe(false);
    expect(overflow.clipped).toBe(0);
  });
});

/**
 * "Bir daqiqa" sahifasi jonli saytda o'qib bo'lmas holatda edi: uning CSS'i
 * to'q binafsha fon e'lon qilardi, lekin `theme.js` `body.style` orqali
 * yorug' fonni majburan o'rnatadi va inline uslub CSS'ni bosib ketadi.
 * Natijada deyarli oq matn och krem fonda qolgandi.
 *
 * Bu test fon bilan matn orasidagi kontrastni o'lchaydi — sahifa qaysi
 * tomonga o'zgarsa ham, o'qib bo'lmas holat qaytib kelmaydi.
 */
test.describe('Bir daqiqa Oydin tizimida', () => {
  /** WCAG nisbiy yorqinligi. */
  const luminance = rgb => {
    const [r, g, b] = rgb.map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const parse = value =>
    value
      .match(/\d+(\.\d+)?/g)
      .slice(0, 3)
      .map(Number);

  for (const theme of ['light', 'night']) {
    test(`${theme} rejimda matn fondan yetarlicha ajraladi`, async ({ page }) => {
      await withTheme(page, theme);
      await page.goto('/birdaqiqa/index.html');
      await page.waitForSelector('h1');

      const { bg, fg } = await page.evaluate(() => ({
        bg: getComputedStyle(document.body).backgroundColor,
        fg: getComputedStyle(document.querySelector('h1')).color
      }));

      const light = Math.max(luminance(parse(bg)), luminance(parse(fg)));
      const dark = Math.min(luminance(parse(bg)), luminance(parse(fg)));
      const ratio = (light + 0.05) / (dark + 0.05);

      expect(ratio, `kontrast juda past: fon ${bg}, matn ${fg}`).toBeGreaterThan(4.5);
    });
  }

  test('logo Oydin belgisini ko‘rsatadi', async ({ page }) => {
    await page.goto('/birdaqiqa/index.html');
    await expect(page.locator('.logo .brand-symbol svg .brand-arc')).toBeVisible();
  });
});
