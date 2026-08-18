/**
 * Fikrlash qatlami: fokus rejimi va aloqa turlari.
 *
 * Bu qatlam ilgari umuman ishga tushmasdi — undan oldingi modul
 * `ReferenceError` bilan yiqilib, modul bajarilishini to'xtatardi. Kod uchun
 * CSS yozilgan edi, lekin hech kim uni ishlatmasdi.
 *
 * Endi u holatni to'g'ridan-to'g'ri `state.js` dan oladi (ilgari har safar
 * localStorage qayta parse qilinardi).
 */

import { $, el } from '../core/index.js';
import { RELATION_TYPES, connections, findCard, relationFor, setRelation } from './state.js';

export function createThinkingLayer({ workspace, handlers }) {
  let focusedId = null;
  let panel = null;

  /** Berilgan karta va u bilan bevosita bog'langanlar. */
  function neighbourhood(id) {
    const allowed = new Set([String(id)]);
    for (const edge of connections()) {
      if (edge.from === String(id)) allowed.add(edge.to);
      if (edge.to === String(id)) allowed.add(edge.from);
    }
    return allowed;
  }

  function exitButton() {
    let button = $('#exitThinkingFocus');
    if (button) return button;
    button = el('button', {
      type: 'button',
      id: 'exitThinkingFocus',
      class: 'exit-focus'
    });
    button.innerHTML = '<span aria-hidden="true">×</span> Fikr ko‘rishdan chiqish';
    button.addEventListener('click', () => clearFocus());
    workspace.append(button);
    return button;
  }

  function focusCard(id) {
    const card = findCard(id);
    if (!card) return;
    focusedId = String(id);
    workspace.classList.add('thinking-focus');
    exitButton();
    handlers.onViewChanged?.();
  }

  function clearFocus() {
    if (!focusedId) return;
    focusedId = null;
    workspace.classList.remove('thinking-focus');
    $('#exitThinkingFocus')?.remove();
    handlers.onViewChanged?.();
  }

  const isFocused = () => focusedId != null;
  const focusView = () =>
    focusedId ? { focusedId, dimmed: neighbourhood(focusedId) } : { focusedId: null, dimmed: null };

  /* --------------------------- aloqa turi paneli --------------------------- */

  function closePanel() {
    panel?.remove();
    panel = null;
  }

  function openRelationPanel(connectionId) {
    closePanel();
    if (!connectionId) return;

    const current = relationFor(connectionId);
    panel = el('div', { class: 'relation-panel', id: 'relationPanel', role: 'group' });
    panel.setAttribute('aria-label', 'Aloqa turi');

    const head = el('div', { class: 'relation-head' });
    const closeButton = el('button', {
      type: 'button',
      'aria-label': 'Aloqa panelini yopish',
      text: '×'
    });
    closeButton.addEventListener('click', () => {
      closePanel();
      handlers.onDeselect?.();
    });
    head.append(el('span', { text: 'Aloqa turi' }), closeButton);

    const options = el('div', { class: 'relation-options' });
    for (const type of RELATION_TYPES) {
      const button = el('button', {
        type: 'button',
        text: type.label,
        class: current?.type === type.id ? 'selected' : '',
        'aria-pressed': String(current?.type === type.id)
      });
      button.addEventListener('click', () => {
        setRelation(connectionId, type.id);
        handlers.onRelationChanged?.(connectionId);
        openRelationPanel(connectionId);
      });
      options.append(button);
    }

    const removeButton = el('button', {
      type: 'button',
      class: 'relation-remove',
      text: 'Aloqani uzish'
    });
    removeButton.addEventListener('click', () => handlers.onDeleteConnection?.(connectionId));

    panel.append(
      head,
      options,
      el('p', { text: 'Bu yorliq fikrlar orasidagi munosabatni eslab qoladi.' }),
      removeButton
    );
    workspace.append(panel);
  }

  return {
    focusCard,
    clearFocus,
    isFocused,
    focusView,
    openRelationPanel,
    closePanel
  };
}
