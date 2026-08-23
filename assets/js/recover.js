/**
 * Buzuq keshdan o'zini o'zi tiklash.
 *
 * MUAMMO. Oydin'da build bosqichi yo'q, ya'ni fayl nomlari hech qachon
 * o'zgarmaydi (`core/app.js` doim `core/app.js`). Service worker esa
 * ularni keshlaydi. Natijada deploy'dan keyin bitta modul eski keshdan,
 * ikkinchisi tarmoqdan kelib qolishi mumkin — IKKI XIL AVLOD aralashadi:
 *
 *   The requested module '../core/app.js' does not provide an
 *   export named 'setStatsEnabled'
 *
 * Bitta import yiqilsa ES modul zanjiri to'liq to'xtaydi. Sahifa
 * ochiladi, chiroyli ko'rinadi — lekin BIRORTA tugma ishlamaydi.
 *
 * NIMA UCHUN BU FAYL KERAK. `sw.js` tuzatilgandan keyin ham eski
 * service worker yana bir-ikki yuklash davomida nazoratda qoladi.
 * O'lchab ko'rildi: sayt faqat UCHINCHI yuklashda o'ziga keladi.
 * Foydalanuvchidan "uch marta yangilang" deb so'rab bo'lmaydi.
 *
 * Shuning uchun bu kichik qo'riqchi modul EMAS (oddiy skript) va
 * asosiy koddan OLDIN yuklanadi: u o'zi hech qanday importga bog'liq
 * emas, ya'ni modul zanjiri yiqilganda ham tirik qoladi.
 *
 * XAVFSIZLIK. Tiklash sessiyada bir martadan ko'p bajarilmaydi —
 * aks holda xato takrorlanaversa sahifa cheksiz qayta yuklanardi.
 */
(function () {
  'use strict';

  const ONCE_KEY = 'oydin-recovered-v1';

  // Testlar uchun belgi: qo'riqchi haqiqatan yuklandimi.
  globalThis.__oydinRecover = true;

  /** Modul yuklanishi yoki bog'lanishi yiqilganini bildiruvchi xatolar. */
  const BROKEN = /module|dynamically imported|import|MIME type|Unexpected token/i;

  /*
   * Ikkitagacha urinish. Bittasi kam: birinchi tiklash paytida tarmoq
   * uzilib qolsa sahifa buzuq holida qolib ketardi. Uchtasi esa ko'p —
   * xato tarmoqda emas, kodda bo'lsa cheksiz halqa hosil bo'lardi.
   */
  const MAX_TRIES = 2;

  function tries() {
    try {
      return Number(sessionStorage.getItem(ONCE_KEY) || 0);
    } catch {
      // Xotira yopiq bo'lsa qayta-qayta urinmaymiz.
      return MAX_TRIES;
    }
  }

  function remember() {
    try {
      sessionStorage.setItem(ONCE_KEY, String(tries() + 1));
    } catch {
      /* yozib bo'lmasa ham davom etamiz */
    }
  }

  function heal(reason) {
    if (tries() >= MAX_TRIES) return;
    remember();
    console.warn('Oydin: eski kesh aniqlandi, tozalab qayta yuklanmoqda —', reason);

    const jobs = [];
    if (globalThis.caches && caches.keys) {
      jobs.push(
        caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return caches.delete(key);
            })
          );
        })
      );
    }
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then(function (list) {
          return Promise.all(
            list.map(function (registration) {
              return registration.unregister();
            })
          );
        })
      );
    }

    Promise.all(jobs)
      .catch(function () {
        /* tozalab bo'lmasa ham qayta yuklab ko'ramiz */
      })
      .then(function () {
        location.reload();
      });
  }

  addEventListener(
    'error',
    function (event) {
      const target = event.target;

      /*
       * DIQQAT: bu shart ATAYLAB qattiq.
       *
       * Ilgari xabari BO'SH bo'lgan har qanday xato tiklashni ishga
       * tushirardi — resurs yuklanmagani ham. Ya'ni bloklangan shrift
       * yoki yetib kelmagan rasm butun sahifani qayta yuklab yuborardi.
       * Buni test ushladi: "sog'lom sahifada HECH NARSA qilmaydi".
       *
       * Endi faqat ikkita holat tiklanadi: skript FAYLI yuklanmagan,
       * yoki xato xabari modul muammosini ANIQ ko'rsatib turgan.
       */
      if (target && target.tagName === 'SCRIPT') {
        heal('skript yuklanmadi: ' + (target.src || 'nomsiz'));
        return;
      }
      // Rasm, uslub va boshqa resurslar — tegmaymiz.
      if (target && target !== globalThis && target.nodeType) return;

      const message = String((event && event.message) || '');
      if (message && BROKEN.test(message)) heal(message);
    },
    true
  );

  // Modulni yuklab bo'lmaganda ba'zi brauzerlar faqat shu hodisani beradi.
  addEventListener('unhandledrejection', function (event) {
    const message = String((event && event.reason && event.reason.message) || '');
    if (BROKEN.test(message)) heal(message);
  });
})();
