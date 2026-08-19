/**
 * Oqim — fikrlarni tez yozib qo'yish sahifasi.
 *
 * Tuzatilgan kamchiliklar:
 *  - saqlash xatosi (kvota) endi ko'rinadi;
 *  - Makonga ko'chirish `state.js` orqali ketadi, ya'ni ma'lumot
 *    normallashtiriladi va zaxira/sinxronizatsiya ishlaydi;
 *  - qidiruv maydoni endi HTMLda, JS bilan qo'shilmaydi.
 */

import { $, el, isTypingTarget, readJson, uid, writeJson } from '../core/index.js';
import { initTheme } from '../core/theme.js';
import { addCard, loadState, persist, switchMap } from '../map/state.js';

const KEY = 'oydin-oqim';
const MAX_LENGTH = 1000;

export function initOqimPage() {
  const input = $('#ideaInput');
  const list = $('#ideas');
  if (!input || !list) return null;

  initTheme();
  loadState();

  let ideas = (readJson(KEY, []) ?? []).filter(item => item && typeof item.text === 'string');
  let editingId = null;
  let query = '';

  function setStatus(text, tone = 'ok') {
    const node = $('#oqimStatus');
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
    if (tone === 'ok') setTimeout(() => (node.textContent = ''), 2000);
  }

  function save() {
    const result = writeJson(KEY, ideas);
    if (!result.ok) {
      setStatus(
        result.reason === 'quota'
          ? 'Saqlanmadi — brauzer xotirasi to‘lgan.'
          : 'Saqlanmadi — brauzer xotirasi ishlamayapti.',
        'error'
      );
    }
    return result.ok;
  }

  function updateCount() {
    const count = $('#ideaCount');
    if (count) count.textContent = `${input.value.length} / ${MAX_LENGTH}`;
  }

  function add() {
    const text = input.value.trim();
    if (!text) return;
    ideas.unshift({
      id: uid(),
      text: text.slice(0, MAX_LENGTH),
      createdAt: new Date().toISOString()
    });
    input.value = '';
    updateCount();
    save();
    render();
    input.focus();
  }

  function remove(id) {
    ideas = ideas.filter(item => item.id !== id);
    save();
    render();
  }

  function saveEdit(id) {
    const editor = $(`[data-editor="${CSS.escape(id)}"]`, list);
    const idea = ideas.find(item => item.id === id);
    if (!editor || !idea) return;
    const text = editor.value.trim();
    if (text) {
      idea.text = text.slice(0, MAX_LENGTH);
      idea.updatedAt = new Date().toISOString();
      save();
    }
    editingId = null;
    render();
  }

  /** Fikrni Makonga ko'chiradi — holat moduli orqali. */
  function moveToMakon(id) {
    const idea = ideas.find(item => item.id === id);
    if (!idea) return;

    const activeId = readJson('oydin-active-map', null);
    if (typeof activeId === 'string') switchMap(activeId);

    addCard({ text: idea.text, type: 'G‘oya', viewportWidth: globalThis.innerWidth || 1200 });
    const result = persist();
    if (!result.ok) {
      setStatus('Makonga ko‘chirilmadi — xotira to‘lgan.', 'error');
      return;
    }
    ideas = ideas.filter(item => item.id !== id);
    save();
    render();
    setStatus('Makonga ko‘chirildi.');
  }

  function ideaRow(idea) {
    if (editingId === idea.id) {
      const row = el('article', { class: 'idea-row is-editing' });
      const body = el('div');
      const editor = el('textarea', {
        class: 'idea-edit',
        maxlength: String(MAX_LENGTH),
        dataset: { editor: idea.id },
        'aria-label': 'Fikrni tahrirlash'
      });
      editor.value = idea.text;
      const saveButton = el('button', {
        type: 'button',
        class: 'primary-button compact idea-save'
      });
      saveButton.innerHTML = 'Saqlash <span aria-hidden="true">→</span>';
      saveButton.addEventListener('click', () => saveEdit(idea.id));
      body.append(editor, saveButton);

      const actions = el('div', { class: 'idea-actions' });
      const cancel = el('button', {
        type: 'button',
        class: 'icon-button',
        'aria-label': 'Tahrirlashni bekor qilish',
        text: '×'
      });
      cancel.addEventListener('click', () => {
        editingId = null;
        render();
      });
      actions.append(cancel);
      row.append(body, actions);
      return row;
    }

    const row = el('article', { class: 'idea-row' });
    const body = el('div');
    body.append(
      el('p', { class: 'idea-text', text: idea.text }),
      el('small', { class: 'idea-date', text: new Date(idea.createdAt).toLocaleString('uz-UZ') })
    );

    const actions = el('div', { class: 'idea-actions' });
    const move = el('button', { type: 'button', class: 'soft-button', text: 'Makon‘ga' });
    move.addEventListener('click', () => moveToMakon(idea.id));

    const edit = el('button', {
      type: 'button',
      class: 'icon-button',
      'aria-label': 'Fikrni tahrirlash',
      text: '✎'
    });
    edit.addEventListener('click', () => {
      editingId = idea.id;
      render();
      // `preventScroll` — aks holda fokus sahifani sakratadi va foydalanuvchi
      // (hamda test) hali joyiga kelmagan tugmani bosishga urinadi.
      $(`[data-editor="${CSS.escape(idea.id)}"]`, list)?.focus({ preventScroll: true });
    });

    const del = el('button', {
      type: 'button',
      class: 'icon-button',
      'aria-label': 'Fikrni o‘chirish',
      text: '×'
    });
    del.addEventListener('click', () => remove(idea.id));

    actions.append(move, edit, del);
    row.append(body, actions);
    return row;
  }

  function render() {
    list.replaceChildren();
    const visible = query ? ideas.filter(idea => idea.text.toLowerCase().includes(query)) : ideas;

    if (!visible.length) {
      list.append(
        el('div', {
          class: 'oqim-empty',
          text: query ? 'Mos fikr topilmadi.' : 'Hozircha bu yer bo‘sh.'
        })
      );
      return;
    }
    for (const idea of visible) list.append(ideaRow(idea));
  }

  $('#saveIdea')?.addEventListener('click', add);
  input.addEventListener('input', updateCount);
  input.addEventListener('keydown', event => {
    const submit =
      (event.key === 'Enter' && !event.shiftKey) ||
      ((event.ctrlKey || event.metaKey) && event.key === 'Enter');
    if (submit) {
      event.preventDefault();
      add();
    }
  });

  const search = $('#oqimSearch');
  search?.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render();
  });

  document.addEventListener('keydown', event => {
    if (isTypingTarget(event.target)) return;
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      input.focus();
    }
    if (event.key === '/') {
      event.preventDefault();
      search?.focus();
    }
  });

  updateCount();
  render();
  return { render };
}
