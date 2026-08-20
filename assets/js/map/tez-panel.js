/**
 * Tez yozish — Makon ichidagi panel.
 *
 * Ilgari bu alohida sahifa edi ("Oqim"). Amalda esa foydalanuvchi Makonda
 * turib reja tuzadi, va fikr kelganda boshqa sahifaga o'tishi kerak
 * bo'lardi — o'sha o'tish paytida fikr yo'qoladi. Endi u shu yerda:
 * tugma bosiladi, yoziladi, panel yopiladi, reja davom etadi.
 *
 * Oqimning barcha imkoniyatlari saqlangan: qo'shish, qidirish,
 * tahrirlash, o'chirish, Makonga ko'chirish, belgi hisoblagichi va
 * klaviatura qisqartmalari.
 */

import { $, el, isTypingTarget, on } from '../core/index.js';
import { MAX_LENGTH, makeNote, readNotes, writeNotes } from '../core/notes.js';
import { track } from '../core/app.js';

export function createTezPanel({ onPlace }) {
  const trigger = $('#railTez');
  const badge = $('#railTezCount');

  let sheet = null;
  let notes = [];
  let query = '';
  let editingId = null;
  let statusTimer = 0;

  function refreshBadge() {
    const total = readNotes().length;
    if (badge) {
      badge.textContent = String(total);
      badge.hidden = total === 0;
    }
    return total;
  }

  function setStatus(text, tone = 'ok') {
    const node = sheet?.querySelector('#tezStatus');
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
    clearTimeout(statusTimer);
    if (tone === 'ok' && text) statusTimer = setTimeout(() => (node.textContent = ''), 2000);
  }

  function persistNotes() {
    const result = writeNotes(notes);
    if (!result.ok) {
      setStatus(
        result.reason === 'quota'
          ? 'Saqlanmadi — brauzer xotirasi to‘lgan.'
          : 'Saqlanmadi — brauzer xotirasi ishlamayapti.',
        'error'
      );
    }
    refreshBadge();
    return result.ok;
  }

  // ---- amallar ----

  function add(input) {
    const text = input.value.trim();
    if (!text) return;
    notes.unshift(makeNote(text));
    track('tez');
    input.value = '';
    updateCount(input);
    persistNotes();
    renderList();
    input.focus();
  }

  function remove(id) {
    notes = notes.filter(note => note.id !== id);
    persistNotes();
    renderList();
  }

  function saveEdit(id) {
    const editor = sheet?.querySelector(`[data-editor="${CSS.escape(id)}"]`);
    const note = notes.find(item => item.id === id);
    if (!editor || !note) return;
    const text = editor.value.trim();
    if (text) {
      note.text = text.slice(0, MAX_LENGTH);
      note.updatedAt = new Date().toISOString();
      persistNotes();
    }
    editingId = null;
    renderList();
  }

  /** Fikrni Makonga karta qilib qo'yadi va ro'yxatdan olib tashlaydi. */
  function moveToMakon(id) {
    const note = notes.find(item => item.id === id);
    if (!note) return;
    if (onPlace(note.text) === false) {
      setStatus('Makonga ko‘chirilmadi — xotira to‘lgan.', 'error');
      return;
    }
    notes = notes.filter(item => item.id !== id);
    persistNotes();
    renderList();
    setStatus('Makonga ko‘chirildi.');
  }

  function updateCount(input) {
    const count = sheet?.querySelector('#tezCount');
    if (count) count.textContent = `${input.value.length} / ${MAX_LENGTH}`;
  }

  // ---- ro'yxat ----

  function noteRow(note) {
    if (editingId === note.id) {
      const row = el('article', { class: 'idea-row is-editing' });
      const body = el('div');
      const editor = el('textarea', {
        class: 'idea-edit',
        maxlength: String(MAX_LENGTH),
        dataset: { editor: note.id },
        'aria-label': 'Fikrni tahrirlash'
      });
      editor.value = note.text;

      const saveButton = el('button', {
        type: 'button',
        class: 'primary-button compact idea-save',
        text: 'Saqlash'
      });
      saveButton.addEventListener('click', () => saveEdit(note.id));
      body.append(editor, saveButton);

      const cancel = el('button', {
        type: 'button',
        class: 'icon-button',
        'aria-label': 'Tahrirlashni bekor qilish',
        text: '×'
      });
      cancel.addEventListener('click', () => {
        editingId = null;
        renderList();
      });

      row.append(body, el('div', { class: 'idea-actions' }, [cancel]));
      return row;
    }

    const row = el('article', { class: 'idea-row' });
    const body = el('div');
    body.append(
      el('p', { class: 'idea-text', text: note.text }),
      el('small', { class: 'idea-date', text: new Date(note.createdAt).toLocaleString('uz-UZ') })
    );

    const move = el('button', { type: 'button', class: 'soft-button', text: 'Makonga' });
    move.addEventListener('click', () => moveToMakon(note.id));

    const edit = el('button', {
      type: 'button',
      class: 'icon-button',
      'aria-label': 'Fikrni tahrirlash',
      text: '✎'
    });
    edit.addEventListener('click', () => {
      editingId = note.id;
      renderList();
      sheet
        ?.querySelector(`[data-editor="${CSS.escape(note.id)}"]`)
        ?.focus({ preventScroll: true });
    });

    const del = el('button', {
      type: 'button',
      class: 'icon-button',
      'aria-label': 'Fikrni o‘chirish',
      text: '×'
    });
    del.addEventListener('click', () => remove(note.id));

    row.append(body, el('div', { class: 'idea-actions' }, [move, edit, del]));
    return row;
  }

  function renderList() {
    const list = sheet?.querySelector('#tezIdeas');
    if (!list) return;
    list.replaceChildren();

    const visible = query ? notes.filter(note => note.text.toLowerCase().includes(query)) : notes;
    if (!visible.length) {
      list.append(
        el('div', {
          class: 'oqim-empty',
          text: query ? 'Mos fikr topilmadi.' : 'Hozircha bu yer bo‘sh.'
        })
      );
      return;
    }
    for (const note of visible) list.append(noteRow(note));
  }

  // ---- panel ----

  function close() {
    if (!sheet) return;
    sheet.close();
    sheet.remove();
    sheet = null;
    editingId = null;
    query = '';
  }

  function open() {
    if (sheet) return;
    notes = readNotes();

    sheet = el('dialog', { class: 'tez-panel', id: 'tezPanel', 'aria-label': 'Tez yozish' });

    const closeButton = el('button', {
      type: 'button',
      class: 'dialog-close',
      'aria-label': 'Yopish',
      text: '×'
    });
    closeButton.addEventListener('click', close);

    const head = el('div', { class: 'tez-panel-head' }, [
      el('div', {}, [
        el('p', { class: 'kicker', text: 'TEZ YOZISH' }),
        el('p', {
          class: 'tez-panel-hint',
          text: 'Fikr kelganda shu yerga yozing. Keyin xohlaganini Makonga ko‘chirasiz.'
        })
      ]),
      closeButton
    ]);

    // Yozish maydoni
    const input = el('textarea', {
      id: 'tezInput',
      class: 'tez-panel-input',
      rows: '3',
      maxlength: String(MAX_LENGTH),
      placeholder: 'Fikr…',
      'aria-label': 'Yangi fikr'
    });

    const saveButton = el('button', {
      type: 'button',
      class: 'primary-button compact',
      text: 'Saqlash'
    });
    saveButton.addEventListener('click', () => add(input));

    const submitRow = el('div', { class: 'tez-panel-row' }, [
      el('span', { class: 'oqim-count', id: 'tezCount', text: `0 / ${MAX_LENGTH}` }),
      saveButton
    ]);

    input.addEventListener('input', () => updateCount(input));
    input.addEventListener('keydown', event => {
      const submit =
        (event.key === 'Enter' && !event.shiftKey) ||
        ((event.ctrlKey || event.metaKey) && event.key === 'Enter');
      if (submit) {
        event.preventDefault();
        add(input);
      }
    });

    // Qidiruv
    const search = el('input', {
      type: 'search',
      id: 'tezSearch',
      placeholder: 'Fikrlar ichidan qidirish',
      'aria-label': 'Fikrlar ichidan qidirish'
    });
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      renderList();
    });

    const status = el('p', { class: 'tez-panel-status', id: 'tezStatus', role: 'status' });
    status.setAttribute('aria-live', 'polite');

    sheet.append(
      head,
      el('div', { class: 'tez-panel-capture' }, [input, submitRow, status]),
      el('div', { class: 'oqim-search tez-panel-search' }, [search]),
      el('div', { class: 'tez-panel-list', id: 'tezIdeas' })
    );

    document.body.append(sheet);
    sheet.addEventListener('cancel', event => {
      event.preventDefault();
      close();
    });
    sheet.showModal();

    updateCount(input);
    renderList();
    input.focus();
  }

  trigger?.addEventListener('click', open);

  // `t` — panelni ochadi. Matn yozilayotgan bo'lsa yoki boshqa oyna
  // ochiq bo'lsa ishlamaydi: mavjud qisqartmalar bilan bir xil qoida.
  on(document, 'keydown', event => {
    if (event.key !== 't' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target) || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    open();
  });

  refreshBadge();
  return { open, close, refresh: refreshBadge };
}
