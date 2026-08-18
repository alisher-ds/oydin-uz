/**
 * Makon oynalari (dialoglar).
 *
 * Barcha foydalanuvchi matni `textContent` yoki `escapeHtml()` orqali
 * qo'yiladi — HTML in'yeksiyasi uchun yo'l yo'q.
 */

import { $, $$, el, escapeHtml } from '../core/index.js';
import { CARD_TYPES } from './state.js';

/** Dialogni xavfsiz ochadi (allaqachon ochiq bo'lsa qayta ochmaydi). */
function open(dialog) {
  if (dialog && !dialog.open) dialog.showModal();
}

export function createDialogs({ handlers }) {
  const cardDialog = $('#cardDialog');
  const detailDialog = $('#detailDialog');
  const mapsDialog = $('#mapsDialog');
  const notesDialog = $('#notesDialog');
  const helpDialog = $('#helpDialog');

  let editingId = null;
  let parentId = null;
  let detailId = null;
  let selectedType = CARD_TYPES[0];

  /* ------------------------------ fikr oynasi ----------------------------- */

  function paintTypePicker() {
    for (const button of $$('.type', cardDialog)) {
      const active = button.dataset.type === selectedType;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function openCard({ card = null, parent = null } = {}) {
    editingId = card?.id ?? null;
    parentId = parent ?? null;
    selectedType = card?.type ?? CARD_TYPES[0];

    $('#dialogKicker').textContent = card
      ? 'FIKRNI TAHRIRLASH'
      : parent
        ? 'YANGI DAVOM'
        : 'YANGI FIKR';
    $('#dialogTitle').textContent = card
      ? 'Fikrni yangilang'
      : parent
        ? 'Shu fikrdan nimasi davom etadi?'
        : 'Hozir nimani o‘ylayapsiz?';
    $('#thoughtText').value = card?.text ?? '';
    $('#submitCard').innerHTML = card
      ? 'Saqlash <span aria-hidden="true">→</span>'
      : 'Makonga qo‘shish <span aria-hidden="true">→</span>';

    paintTypePicker();
    open(cardDialog);
    setTimeout(() => $('#thoughtText').focus(), 30);
  }

  function closeCard() {
    if (cardDialog.open) cardDialog.close();
    editingId = null;
    parentId = null;
  }

  $('#cardForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const text = $('#thoughtText').value.trim();
    if (!text) return;
    handlers.onSubmitCard?.({ id: editingId, parentId, text, type: selectedType });
    closeCard();
  });
  $('#closeCard')?.addEventListener('click', closeCard);
  for (const button of $$('.type', cardDialog)) {
    button.addEventListener('click', () => {
      selectedType = button.dataset.type;
      paintTypePicker();
    });
  }

  /* ----------------------------- ichki qatlam ----------------------------- */

  function openDetail(card) {
    if (!card) return;
    detailId = card.id;
    $('#detailTitle').textContent = card.text || 'Fikr';
    $('#detailSummary').value = card.detail?.summary ?? '';
    $('#detailDue').value = card.detail?.due ?? '';
    $('#detailStatus').value = card.detail?.status ?? 'Ochiq';
    $('#detailNotes').value = card.detail?.notes ?? '';
    open(detailDialog);
    setTimeout(() => $('#detailSummary').focus(), 30);
  }

  $('#saveDetail')?.addEventListener('click', () => {
    if (!detailId) return;
    handlers.onSaveDetail?.(detailId, {
      summary: $('#detailSummary').value.trim(),
      due: $('#detailDue').value,
      status: $('#detailStatus').value,
      notes: $('#detailNotes').value.trim()
    });
    detailDialog.close();
  });
  $('#closeDetail')?.addEventListener('click', () => detailDialog.close());

  /* ------------------------------- makonlar ------------------------------- */

  function renderMaps(maps, activeId) {
    const list = $('#mapsList');
    if (!list) return;
    list.replaceChildren();

    const sorted = [...maps].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    for (const map of sorted) {
      const row = el('div', { class: 'saved-map' });

      const main = el('button', {
        type: 'button',
        class: 'saved-map-main',
        'aria-current': map.id === activeId ? 'true' : null
      });
      main.append(
        el('b', { text: map.title || 'Yangi makon' }),
        el('small', {
          text: `${map.cards?.length ?? 0} fikr · ${new Date(map.updatedAt || Date.now()).toLocaleDateString('uz-UZ')}`
        })
      );
      main.addEventListener('click', () => {
        handlers.onOpenMap?.(map.id);
        mapsDialog.close();
      });

      const actions = el('div', { class: 'saved-map-actions' });
      const rename = el('button', {
        type: 'button',
        text: 'Nom',
        'aria-label': `“${map.title}” makonining nomini o‘zgartirish`
      });
      rename.addEventListener('click', () => handlers.onRenameMap?.(map.id, map.title));

      const remove = el('button', {
        type: 'button',
        text: 'O‘chirish',
        'aria-label': `“${map.title}” makonini o‘chirish`
      });
      remove.addEventListener('click', () => handlers.onDeleteMap?.(map.id, map.title));

      actions.append(rename, remove);
      row.append(main, actions);
      list.append(row);
    }
  }

  $('#closeMaps')?.addEventListener('click', () => mapsDialog.close());
  $('#createMap')?.addEventListener('click', () => {
    handlers.onCreateMap?.();
    mapsDialog.close();
  });

  /* -------------------------------- yozuvlar ------------------------------ */

  function renderNotes(cards) {
    const list = $('#notesList');
    if (!list) return;
    list.replaceChildren();

    if (!cards.length) {
      list.append(el('p', { class: 'notes-empty', text: 'Hozircha hech qanday fikr yo‘q.' }));
      return;
    }
    for (const card of cards) {
      const row = el('button', { type: 'button', class: 'note-row' });
      row.append(
        el('span', { text: card.type }),
        el('b', { text: card.text }),
        el('small', { text: card.detail?.due || '—' })
      );
      row.addEventListener('click', () => {
        notesDialog.close();
        handlers.onOpenNote?.(card.id);
      });
      list.append(row);
    }
  }

  $('#closeNotes')?.addEventListener('click', () => notesDialog.close());
  $('#closeHelp')?.addEventListener('click', () => helpDialog.close());

  /* -------------------------- tasdiqlash oynasi --------------------------- */

  /**
   * `confirm()` o'rniga o'z oynamiz: brauzer dialoglari mobil qurilmalarda
   * bloklanadi va uslub jihatidan mahsulotdan ajralib turadi.
   * @returns {Promise<boolean>}
   */
  function confirmAction({ title, message, confirmLabel = 'Ha, davom etish', tone = 'default' }) {
    return new Promise(resolve => {
      const dialog = el('dialog', { class: 'confirm-dialog', id: 'confirmDialog' });
      dialog.innerHTML = `
        <div class="confirm-body">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
          <div class="confirm-actions">
            <button type="button" class="soft-button" data-action="cancel">Bekor qilish</button>
            <button type="button" class="primary-button compact ${tone === 'danger' ? 'is-danger' : ''}" data-action="confirm">
              ${escapeHtml(confirmLabel)}
            </button>
          </div>
        </div>`;
      document.body.append(dialog);

      const finish = value => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(false));
      dialog.querySelector('[data-action="confirm"]').addEventListener('click', () => finish(true));
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        finish(false);
      });
      dialog.showModal();
      dialog.querySelector('[data-action="confirm"]').focus();
    });
  }

  /** Matn so'raydigan oyna — `prompt()` o'rnini bosadi. */
  function promptText({ title, label: fieldLabel, value = '', confirmLabel = 'Saqlash' }) {
    return new Promise(resolve => {
      const dialog = el('dialog', { class: 'confirm-dialog', id: 'promptDialog' });
      dialog.innerHTML = `
        <form method="dialog" class="confirm-body">
          <h2>${escapeHtml(title)}</h2>
          <label class="prompt-field">${escapeHtml(fieldLabel)}
            <input type="text" maxlength="160" value="${escapeHtml(value)}" required>
          </label>
          <div class="confirm-actions">
            <button type="button" class="soft-button" data-action="cancel">Bekor qilish</button>
            <button type="submit" class="primary-button compact">${escapeHtml(confirmLabel)}</button>
          </div>
        </form>`;
      document.body.append(dialog);

      const input = dialog.querySelector('input');
      const finish = result => {
        dialog.close();
        dialog.remove();
        resolve(result);
      };
      dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(null));
      dialog.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        finish(input.value.trim() || null);
      });
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        finish(null);
      });
      dialog.showModal();
      input.focus();
      input.select();
    });
  }

  return {
    openCard,
    closeCard,
    openDetail,
    renderMaps,
    renderNotes,
    confirmAction,
    promptText,
    openMaps: () => open(mapsDialog),
    openNotes: () => open(notesDialog),
    openHelp: () => open(helpDialog)
  };
}
