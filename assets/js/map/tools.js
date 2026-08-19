/**
 * Makon asboblari: bekor qilish, qidiruv, eksport va import.
 *
 * Eksport ilgari ham bor edi, lekin importsiz — ya'ni zaxira nusxani
 * qaytarib bo'lmasdi. Endi ikkalasi ham bor.
 */

import { $, el, hasOpenDialog, isTypingTarget } from '../core/index.js';
import { activeMap, allMaps, cards, normalizeMap } from './state.js';

const EXPORT_VERSION = 1;

export function createTools({ handlers }) {
  /* -------------------------------- qidiruv -------------------------------- */

  let searchDialog = null;

  function buildSearchDialog() {
    const dialog = el('dialog', { id: 'mapSearchDialog' });
    dialog.innerHTML = `
      <div class="product-dialog">
        <button class="dialog-close" type="button" data-close aria-label="Yopish">×</button>
        <p class="kicker">MAKON ICHIDA</p>
        <h2>Fikrni toping</h2>
        <label class="visually-hidden" for="mapSearchInput">Fikrni qidiring</label>
        <input id="mapSearchInput" type="search" autocomplete="off" placeholder="Fikrni qidiring…">
        <div id="mapSearchResults" role="listbox" aria-label="Qidiruv natijalari"></div>
      </div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    return dialog;
  }

  function openSearch() {
    searchDialog ??= buildSearchDialog();
    const input = searchDialog.querySelector('#mapSearchInput');
    const results = searchDialog.querySelector('#mapSearchResults');

    const run = () => {
      const query = input.value.trim().toLowerCase();
      results.replaceChildren();
      const matches = cards().filter(card => !query || card.text.toLowerCase().includes(query));

      if (!matches.length) {
        results.append(el('p', { class: 'product-empty', text: 'Mos fikr topilmadi.' }));
        return;
      }
      for (const card of matches) {
        const button = el('button', {
          type: 'button',
          class: 'search-result',
          role: 'option',
          text: card.text || '(bo‘sh fikr)'
        });
        button.addEventListener('click', () => {
          searchDialog.close();
          handlers.onReveal?.(card.id);
        });
        results.append(button);
      }
    };

    input.oninput = run;
    if (!searchDialog.open) searchDialog.showModal();
    setTimeout(() => {
      input.focus();
      run();
    }, 30);
  }

  /* --------------------------- eksport va import --------------------------- */

  const safeFileName = name =>
    (name || 'oydin-makon').replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'oydin-makon';

  function download(payload, fileName) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: fileName });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportActive() {
    const map = activeMap();
    if (!map) return;
    download(
      { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), maps: [map] },
      `${safeFileName(map.title)}.json`
    );
  }

  function exportAll() {
    download(
      { version: EXPORT_VERSION, exportedAt: new Date().toISOString(), maps: allMaps() },
      `oydin-barcha-makonlar-${new Date().toISOString().slice(0, 10)}.json`
    );
  }

  /** Fayldan makonlarni o'qiydi. Buzuq fayl holatni buzmaydi. */
  function importFromFile() {
    const input = el('input', { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const raw = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.maps)
            ? parsed.maps
            : [parsed];
        const maps = raw
          .map(item => normalizeMap(item))
          .filter(map => map.cards.length || map.title);
        if (!maps.length) throw new Error('Faylda makon topilmadi.');
        handlers.onImport?.(maps);
      } catch (error) {
        handlers.onImportError?.(error?.message || 'Faylni o‘qib bo‘lmadi.');
      }
    });
    input.click();
  }

  /* ------------------------------ asboblar paneli --------------------------- */

  function mountToolbar() {
    const cluster = $('.workspace-toolbar .tool-cluster');
    if (!cluster || $('#oydinProductTools')) return;

    const wrap = el('div', { id: 'oydinProductTools', class: 'tool-cluster product-tools' });
    const buttons = [
      {
        id: 'historyUndo',
        glyph: '↶',
        label: 'Bekor qilish (Ctrl+Z)',
        action: () => handlers.onUndo?.()
      },
      { id: 'focusSearch', glyph: '⌕', label: 'Makon ichidan qidirish (/)', action: openSearch },
      { id: 'importSpace', glyph: '↑', label: 'Fayldan yuklash', action: importFromFile },
      { id: 'exportSpace', glyph: '↓', label: 'Makonni eksport qilish', action: exportActive }
    ];
    for (const item of buttons) {
      const button = el('button', {
        type: 'button',
        id: item.id,
        title: item.label,
        'aria-label': item.label,
        text: item.glyph
      });
      button.addEventListener('click', item.action);
      wrap.append(button);
    }
    cluster.parentElement?.insertBefore(wrap, cluster.parentElement.firstChild);
  }

  /* ----------------------------- klaviatura -------------------------------- */

  document.addEventListener('keydown', event => {
    // Dialog ochiq bo'lsa qisqartmalar ishlamaydi — ilgari Yordam oynasi
    // ochiq turganda `n` bosilsa ustiga yangi fikr oynasi ochilardi.
    if (isTypingTarget(event.target)) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      // Shift bilan — oldinga. `event.key` katta harf ('Z') bo'lgani
      // uchun `toLowerCase()` ikkalasini ham ushlaydi, farqni aynan
      // `shiftKey` ajratadi.
      if (event.shiftKey) handlers.onRedo?.();
      else handlers.onUndo?.();
      return;
    }
    // Windows'dagi an'anaviy "oldinga" qisqartmasi.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      handlers.onRedo?.();
      return;
    }
    if (hasOpenDialog()) return;
    if (event.key === '/') {
      event.preventDefault();
      openSearch();
    }
  });

  return { mountToolbar, openSearch, exportActive, exportAll, importFromFile };
}
