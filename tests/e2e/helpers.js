/** E2E testlar uchun umumiy yordamchilar. */

/**
 * Tashqi so'rovlarni bloklaydi.
 *
 * Testlar tarmoqqa bog'liq bo'lmasligi kerak: Google Fonts stylesheet'i
 * `DOMContentLoaded` ni ushlab turadi va tarmoqsiz muhitda har navigatsiyani
 * o'nlab soniyaga cho'zadi.
 */
export async function blockExternalRequests(page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    return isLocal ? route.continue() : route.abort();
  });
}

export const SAMPLE_MAP = {
  m1: {
    id: 'm1',
    title: 'Test makon',
    space: 'paper',
    updatedAt: '2024-01-01T00:00:00.000Z',
    cards: [
      {
        id: 'c1',
        text: 'Birinchi fikr',
        type: 'G‘oya',
        x: 120,
        y: 140,
        detail: { status: 'Ochiq' }
      },
      { id: 'c2', text: 'Ikkinchi fikr', type: 'Reja', x: 560, y: 340, detail: { status: 'Ochiq' } }
    ],
    connections: [{ id: 'e1', from: 'c1', to: 'c2' }]
  }
};

/**
 * Sahifa yuklanishidan OLDIN localStorage ga namuna makon qo'yadi.
 *
 * DIQQAT: `addInitScript` HAR navigatsiyada ishlaydi, shuning uchun u
 * faqat BIR MARTA ekadi. Aks holda `reload()` dan keyin ilova yozgan
 * ma'lumot qayta yozilib ketardi va "saqlanadimi?" testlari yolg'on
 * natija berardi.
 */
export async function seedMap(page, maps = SAMPLE_MAP, activeId = 'm1') {
  await page.addInitScript(
    ([seedMaps, seedActive]) => {
      const MARKER = '__oydin_test_seeded';
      if (localStorage.getItem(MARKER)) return;
      localStorage.setItem('oydin-maps', JSON.stringify(seedMaps));
      localStorage.setItem('oydin-active-map', JSON.stringify(seedActive));
      localStorage.setItem(MARKER, '1');
    },
    [maps, activeId]
  );
}

/** Konsol xatolari va bajarilmagan istisnolarni yig'adi. */
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error.message)));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      errors.push(message.text());
    }
  });
  return errors;
}

/** Aloqa chizig'ining `d` atributidan boshlanish nuqtasini oladi. */
export async function connectionStart(page) {
  return page.evaluate(() => {
    const path = document.querySelector('.connection-line');
    if (!path) return null;
    const numbers = (path.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g);
    return numbers ? { x: Number(numbers[0]), y: Number(numbers[1]) } : null;
  });
}

/** Kartaning makon koordinatalaridagi markazi. */
export async function cardCenter(page, id) {
  return page.evaluate(cardId => {
    const node = document.querySelector(`article[data-card-id="${cardId}"]`);
    if (!node) return null;
    return {
      x: (parseFloat(node.style.left) || 0) + node.offsetWidth / 2,
      y: (parseFloat(node.style.top) || 0) + node.offsetHeight / 2
    };
  }, id);
}

/**
 * Karta amallar panelini ochadi.
 *
 * Sichqonchada panel hover'da chiqadi; sensorli ekranda esa kartani bosish
 * kerak (`actions-open`). Test ikkalasini ham qo'llab-quvvatlashi kerak.
 */
export async function openCardActions(page, cardId) {
  const card = page.locator(`article[data-card-id="${cardId}"]`);
  const isTouch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (isTouch) await card.click({ position: { x: 10, y: 10 } });
  else await card.hover();
  return card;
}

/**
 * Elementni bosadi va uning HAQIQATAN bosiladigan holatda ekanini tekshiradi.
 *
 * Nima uchun kerak: ba'zi CI/sandbox muhitlarida Chromium qurilma
 * emulyatsiyasini (`isMobile` viewport) qo'llay olmaydi — Playwright
 * 412px kengligini kutadi, sahifa esa 509px da render bo'ladi. Natijada
 * actionability tekshiruvi noto'g'ri nuqtani hisoblaydi va bosish
 * "intercepted" deb tushadi, holbuki element ochiq turadi.
 *
 * Shuning uchun avval brauzerning O'ZIDA hit-test qilamiz: element o'z
 * markazida eng ustki element bo'lishi shart. Bu "biror narsa uni
 * qoplayaptimi?" degan savolga aynan javob beradi — ya'ni test kuchsizlanmaydi.
 */
export async function clickHitTested(page, selector) {
  // `elementFromPoint` faqat viewport ichida ishlaydi — avval ko'rinishga keltiramiz.
  await page.evaluate(sel => {
    document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, selector);
  await page.waitForTimeout(120);

  const covered = await page.evaluate(sel => {
    const node = document.querySelector(sel);
    if (!node) return 'element topilmadi';
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return 'element ko‘rinmaydi (0 o‘lcham)';
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (!hit) return 'hit-test natijasi yo‘q';
    if (hit !== node && !node.contains(hit)) {
      return `element qoplangan: ${hit.tagName}.${hit.className}`;
    }
    return null;
  }, selector);

  if (covered) throw new Error(`clickHitTested(${selector}): ${covered}`);
  await page.locator(selector).click({ force: true });
}

/**
 * Makon amalini bajaradi — ekran o'lchamidan qat'i nazar.
 *
 * Telefonda ba'zi tugmalar "⋯" varag'iga ko'chirilgan, shuning uchun test
 * ularni to'g'ridan-to'g'ri bosa olmaydi. Bu yordamchi tugma ko'rinsa uni
 * bosadi, aks holda varaqni ochib, o'sha amalni tanlaydi.
 */
export async function runMapAction(page, buttonId, sheetLabel) {
  const direct = page.locator(`#${buttonId}`);
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return;
  }
  await page.locator('#mobileActionsOpen').click();
  await page.locator('.mobile-action', { hasText: sheetLabel }).click();
}

/** Makon ohangini tanlaydi (telefonda varaq orqali). */
export async function pickSpaceTone(page, space) {
  const swatch = page.locator(`.swatch[data-space="${space}"]`);
  if (await swatch.isVisible().catch(() => false)) {
    await swatch.click();
    return;
  }
  await page.locator('#mobileActionsOpen').click();
  await page.locator(`.mobile-swatch[data-space="${space}"]`).click();
}
