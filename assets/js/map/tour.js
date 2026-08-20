/**
 * Birinchi kirganda ko'rsatiladigan qisqa qo'llanma.
 *
 * MUAMMO: yangi odam Makonga kirganda bo'sh maydonni ko'radi va
 * "nima qilishim kerak?" deb qotadi. Bu texnik emas, psixologik to'siq —
 * bo'sh sahifa hech narsa taklif qilmaydi.
 *
 * QARORLAR:
 *
 *  1. Faqat BIRINCHI marta. Belgisi qurilmada saqlanadi
 *     (`oydin-tour-v1`). Ikkinchi marta o'z-o'zidan chiqmaydi —
 *     takroriy qo'llanma yordam emas, xalaqit.
 *  2. Istagan payt to'xtatish mumkin: `Esc`, "O'tkazib yuborish", yoki
 *     qorong'i fonni bosish. Chiqib bo'lmaydigan qo'llanma — tuzoq.
 *  3. Qadamlar HAQIQIY elementlarni yoritadi. Element ekranda bo'lmasa
 *     (telefonda ba'zi tugmalar varaqqa yig'ilgan) — qadam yoritmasdan,
 *     markazda ko'rsatiladi. Ya'ni qo'llanma hech qachon bo'sh joyga
 *     ishora qilmaydi.
 *  4. Yoritish `box-shadow` bilan: bitta element, atrofida ulkan soya.
 *     Ilgari 4 ta div bilan "ramka" yasash ko'proq kod va piksel
 *     xatolarini keltirardi.
 *
 * DIQQAT: o'lchamlar JS orqali (`node.style.width = …`) beriladi. CSP
 * `style-src 'self'` faqat `<style>` blokini va HTML dagi `style="…"`
 * atributini bloklaydi — CSSOM orqali yozish cheklanmaydi. Kartalar ham
 * shu yo'l bilan joylashadi.
 */

import { $, el, on, readJson, writeJson } from '../core/index.js';
import { track } from '../core/app.js';

export const TOUR_KEY = 'oydin-tour-v1';

/** Yoritilgan element atrofidagi bo'sh joy. */
const PADDING = 8;

/**
 * Qadamlar — matn HAQIQIY imkoniyatlarga mos.
 * `target` topilmasa qadam markazda ko'rsatiladi.
 */
export const STEPS = Object.freeze([
  {
    target: null,
    kicker: 'BOSHLAYMIZ',
    title: 'Bu — sizning makoningiz',
    body: 'Yarim daqiqada asosiy to‘rtta amalni ko‘rsataman. Istagan payt to‘xtatishingiz mumkin.'
  },
  {
    target: '#addFirst',
    kicker: '01 / FIKRNI USHLASH',
    title: 'Fikrni yozib qo‘ying',
    body: 'Shu tugma yangi fikr oynasini ochadi. Fikr yozilishi bilan makonda karta bo‘lib paydo bo‘ladi.',
    hint: 'Klaviaturada: N'
  },
  {
    target: null,
    illustration: true,
    kicker: '02 / BOG‘LASH',
    title: 'Fikrlarni bir-biriga ulang',
    body: 'Karta ustiga borsangiz uning amallari chiqadi. ↗ ni tanlang, so‘ng ikkinchi kartani bosing. Aloqani bosib turini belgilaysiz: davomi · sabab · natija · qarama-qarshi · izoh.',
    hint: 'Karta tanlanganda: C'
  },
  {
    target: '#railTez',
    kicker: '03 / TEZ YOZISH',
    title: 'Fikr kelganda joylashtirib o‘tirmang',
    body: 'Shoshilinch fikrni shu yerga tashlab qo‘yasiz, keyin xohlaganini makonga ko‘chirasiz. Makondan chiqish shart emas.',
    hint: 'Klaviaturada: T'
  },
  {
    target: '#saveStatus',
    kicker: '04 / MA’LUMOT',
    title: 'Hech narsa yo‘qolmaydi',
    body: 'Har o‘zgarish darhol shu qurilmada saqlanadi va bu ko‘rsatkich buni tasdiqlab turadi. Internetsiz ham ishlaydi.',
    hint: 'Xato qilsangiz: Ctrl+Z'
  }
]);

/** Qo'llanma shu qurilmada ilgari ko'rsatilganmi. */
export const wasSeen = () => Boolean(readJson(TOUR_KEY, null)?.done);

/** Ko'rsatilgani qayd etiladi — ikkinchi marta o'zi chiqmasin. */
export const markSeen = () =>
  writeJson(TOUR_KEY, { done: true, at: new Date().toISOString() }, { silent: true });

/** Ikkita bog'langan karta — 02-qadam uchun kichik chizma. */
function illustration() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 260 96');
  svg.setAttribute('class', 'tour-figure');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <path d="M74 44 C110 44 122 60 176 60" class="tour-edge" />
    <rect x="10" y="24" width="64" height="34" rx="8" class="tour-node" />
    <rect x="176" y="42" width="74" height="34" rx="8" class="tour-node" />
    <circle cx="125" cy="52" r="9" class="tour-dot" />
    <text x="125" y="56" text-anchor="middle" class="tour-glyph">↗</text>`;
  return svg;
}

export function createTour() {
  let overlay = null;
  let index = 0;
  let cleanup = [];

  function close(reason) {
    for (const off of cleanup) off();
    cleanup = [];
    overlay?.remove();
    overlay = null;
    markSeen();
    track(reason === 'done' ? 'qollanma:tugadi' : 'qollanma:otkazildi');
  }

  /** Yoritilgan sohani elementga moslaydi. */
  function place() {
    if (!overlay) return;
    const step = STEPS[index];
    const spot = overlay.querySelector('.tour-spot');
    const card = overlay.querySelector('.tour-card');
    const node = step.target ? $(step.target) : null;
    const rect = node?.getBoundingClientRect();

    // Ko'rinmaydigan element yoritilmaydi: telefonda ba'zi tugmalar
    // "⋯" varag'iga yig'ilgan bo'lishi mumkin.
    if (!rect || !rect.width || !rect.height) {
      spot.dataset.on = 'false';
      // O'lchamlarni TOZALASH shart: ular JS orqali berilgan, ya'ni
      // uslub jadvalidagi `inset: 0` dan kuchliroq. Tozalanmasa, oldingi
      // qadamning to'rtburchagi qolib, ekranning bir qismi qoraymay
      // qolardi.
      spot.style.left = '';
      spot.style.top = '';
      spot.style.width = '';
      spot.style.height = '';
      card.dataset.place = 'center';
      return;
    }

    spot.dataset.on = 'true';
    spot.style.left = `${rect.left - PADDING}px`;
    spot.style.top = `${rect.top - PADDING}px`;
    spot.style.width = `${rect.width + PADDING * 2}px`;
    spot.style.height = `${rect.height + PADDING * 2}px`;

    // Karta yoritilgan joyning teskari tomonida turadi.
    card.dataset.place = rect.top > globalThis.innerHeight / 2 ? 'top' : 'bottom';
  }

  function render() {
    const step = STEPS[index];
    const card = overlay.querySelector('.tour-card');
    const last = index === STEPS.length - 1;

    card.replaceChildren(
      el('p', { class: 'tour-kicker', text: step.kicker }),
      el('h2', { text: step.title }),
      ...(step.illustration ? [illustration()] : []),
      el('p', { class: 'tour-body', text: step.body }),
      ...(step.hint ? [el('p', { class: 'tour-hint', text: step.hint })] : []),
      el('div', { class: 'tour-foot' }, [
        el(
          'div',
          { class: 'tour-dots', 'aria-hidden': 'true' },
          STEPS.map((_, position) => el('i', { dataset: { active: String(position === index) } }))
        ),
        el('div', { class: 'tour-buttons' }, [
          el('button', {
            type: 'button',
            class: 'tour-skip',
            text: last ? 'Yopish' : 'O‘tkazib yuborish',
            onclick: () => close(last ? 'done' : 'skip')
          }),
          el('button', {
            type: 'button',
            class: 'primary-button compact',
            text: last ? 'Boshladik' : 'Keyingi',
            onclick: () => {
              if (last) {
                close('done');
                return;
              }
              index += 1;
              render();
            }
          })
        ])
      ])
    );

    card.setAttribute('aria-label', `${step.title}. ${index + 1} / ${STEPS.length}`);
    place();
    card.querySelector('.primary-button')?.focus();
  }

  /** Qo'llanmani ochadi. */
  function start() {
    if (overlay) return;
    index = 0;

    overlay = el('div', {
      class: 'tour',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Oydin qo‘llanmasi'
    });
    overlay.append(
      el('div', { class: 'tour-spot', dataset: { on: 'false' } }),
      el('div', { class: 'tour-card' })
    );
    document.body.append(overlay);

    cleanup = [
      on(overlay, 'click', event => {
        if (event.target === overlay) close('skip');
      }),
      on(document, 'keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close('skip');
        }
      }),
      on(globalThis, 'resize', place),
      on(globalThis, 'scroll', place, true)
    ];

    track('qollanma:boshlandi');
    render();
  }

  /**
   * Birinchi tashrif bo'lsa qo'llanmani o'zi ochadi.
   *
   * `hasExistingWork` — makonda allaqachon fikr bo'lsa, bu odam yangi
   * emas: belgisi yo'qolgan bo'lishi mumkin (brauzer tozalangan, boshqa
   * qurilmadan sinxronlangan). Unga "birinchi fikringizni yozing" deyish
   * noto'g'ri, shuning uchun qo'llanma o'zi ochilmaydi — Yordam oynasidagi
   * tugma esa baribir ishlaydi.
   */
  function startIfFirstVisit({ hasExistingWork = false } = {}) {
    if (wasSeen() || hasExistingWork) {
      markSeen();
      return false;
    }
    start();
    return true;
  }

  return { start, startIfFirstVisit };
}
