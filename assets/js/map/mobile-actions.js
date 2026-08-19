/**
 * Telefon uchun ixcham amallar menyusi.
 *
 * Muammo: ish maydonining ustidagi asboblar paneli to'qqizta tugmadan
 * iborat. 390px ekranda u ikki-uch qatorga yoyilib, 184px balandlikni —
 * ya'ni ish maydonining deyarli uchdan birini — egallab olardi va
 * kartalarning amallar panelini qoplab qo'yardi.
 *
 * Yechim: telefonda panelda faqat eng ko'p ishlatiladigan boshqaruvlar
 * (zoom va "Sig'dirish") qoladi, qolganlari bitta "⋯" tugmasi ortidagi
 * pastki varaqqa yig'iladi. Varaqdagi tugmalar mavjud tugmalarni bosadi —
 * mantiq takrorlanmaydi va klaviatura qisqartmalari o'z holicha qoladi.
 */

import { $, $$, el, isCoarsePointer } from '../core/index.js';

const MOBILE_QUERY = '(max-width: 760px)';

/** Varaqqa ko'chiriladigan amallar: mavjud tugma id'si → yorliq. */
const ACTIONS = [
  { id: 'railNotes', glyph: '≡', label: 'Barcha yozuvlar' },
  { id: 'autoLayout', glyph: '⌗', label: 'Avtomatik joylash' },
  { id: 'historyUndo', glyph: '↶', label: 'Bekor qilish' },
  { id: 'focusSearch', glyph: '⌕', label: 'Fikrni qidirish' },
  { id: 'newMap', glyph: '＋', label: 'Yangi makon' },
  { id: 'saveMap', glyph: '✓', label: 'Saqlash' },
  { id: 'importSpace', glyph: '↑', label: 'Fayldan yuklash' },
  { id: 'exportSpace', glyph: '↓', label: 'Eksport qilish' }
];

export function createMobileActions() {
  const media = globalThis.matchMedia?.(MOBILE_QUERY);
  let sheet = null;

  function closeSheet() {
    if (!sheet) return;
    sheet.close();
    sheet.remove();
    sheet = null;
  }

  function openSheet() {
    closeSheet();
    sheet = el('dialog', { class: 'mobile-actions', id: 'mobileActions' });

    const head = el('div', { class: 'mobile-actions-head' });
    const closeButton = el('button', {
      type: 'button',
      class: 'dialog-close',
      'aria-label': 'Yopish',
      text: '×'
    });
    closeButton.addEventListener('click', closeSheet);
    head.append(el('p', { class: 'kicker', text: 'MAKON AMALLARI' }), closeButton);

    const list = el('div', { class: 'mobile-actions-list' });

    // Makon ohangi: yon panelda telefon ekraniga sig'maydi, shuning uchun
    // shu yerda — kattaroq va bosish oson.
    const swatches = $$('.theme-swatches .swatch');
    if (swatches.length) {
      const group = el('div', { class: 'mobile-swatches', role: 'group' });
      group.setAttribute('aria-label', 'Makon ohangi');
      for (const original of swatches) {
        const copy = el('button', {
          type: 'button',
          class: `mobile-swatch${original.classList.contains('active') ? ' active' : ''}`,
          'aria-label': original.getAttribute('aria-label') ?? 'Makon ohangi',
          dataset: { space: original.dataset.space ?? '' }
        });
        copy.addEventListener('click', () => {
          original.click();
          closeSheet();
        });
        group.append(copy);
      }
      list.append(el('p', { class: 'mobile-actions-label', text: 'MAKON OHANGI' }), group);
    }

    for (const action of ACTIONS) {
      const target = $(`#${action.id}`);
      if (!target) continue;

      const button = el('button', { type: 'button', class: 'mobile-action' });
      button.append(
        el('span', { class: 'mobile-action-glyph', 'aria-hidden': 'true', text: action.glyph }),
        el('b', { text: action.label })
      );
      button.addEventListener('click', () => {
        closeSheet();
        // Mavjud tugmani bosamiz — barcha mantiq o'sha yerda qoladi.
        target.click();
      });
      list.append(button);
    }

    // Markaziy navigatsiya telefonda yashirilgan — asboblar paneli baland
    // bo'lib ketmasligi uchun. Shu sababli sahifalar shu yerda turadi,
    // aks holda Makon sahifasidan boshqa joyga o'tib bo'lmasdi.
    // Havolalar DOM'dan o'qiladi: nom yoki manzil o'zgarsa, bu yer ham
    // o'zi yangilanadi.
    const pages = $$('.map-center-nav .topnav-link').filter(
      link => !link.classList.contains('active')
    );
    if (pages.length) {
      const group = el('nav', { class: 'mobile-actions-pages' });
      group.setAttribute('aria-label', 'Sahifalar');
      for (const link of pages) {
        group.append(
          el('a', {
            class: 'mobile-action-page',
            href: link.getAttribute('href'),
            text: link.textContent.trim()
          })
        );
      }
      list.append(el('p', { class: 'mobile-actions-label', text: 'SAHIFALAR' }), group);
    }

    sheet.append(head, list);
    document.body.append(sheet);
    sheet.addEventListener('cancel', event => {
      event.preventDefault();
      closeSheet();
    });
    sheet.showModal();
  }

  function mountTrigger() {
    const toolbar = $('.workspace-toolbar');
    if (!toolbar || $('#mobileActionsOpen')) return;

    const wrap = el('div', { class: 'tool-cluster mobile-actions-trigger' });
    const button = el('button', {
      type: 'button',
      id: 'mobileActionsOpen',
      title: 'Boshqa amallar',
      'aria-label': 'Boshqa amallar',
      text: '⋯'
    });
    button.addEventListener('click', openSheet);
    wrap.append(button);
    toolbar.append(wrap);
  }

  function sync() {
    const mobile = (media?.matches ?? false) || isCoarsePointer();
    document.body.classList.toggle('has-mobile-actions', mobile);
    if (mobile) mountTrigger();
    else closeSheet();
  }

  sync();
  media?.addEventListener?.('change', sync);

  return { openSheet, closeSheet, sync };
}
