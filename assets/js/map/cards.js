/**
 * Fikr kartalari qatlami.
 *
 * Tuzatilgan kamchiliklar:
 *  - sudrash endi `pointercancel` va `lostpointercapture` ni ham ishlaydi,
 *    shuning uchun tizim jesti uzib qo'ysa karta kursorga yopishib qolmaydi;
 *  - kartalar klaviatura bilan to'liq boshqariladi (ilgari `tabindex="0"` bor
 *    edi, lekin hech qanday `keydown` ishlovchisi yo'q edi — Tab bilan
 *    kartaga yetib borardingiz va hech narsa qila olmasdingiz);
 *  - `data-card-id` ishlatiladi: ilgari `data-id` ham kartalarda, ham
 *    yozuvlar ro'yxatida bo'lib, selektorlar ikki elementga tushardi.
 */

import { $$, el, isCoarsePointer, prefersReducedMotion } from '../core/index.js';

const NUDGE_STEP = 12;
const NUDGE_STEP_LARGE = 60;

const KIND_CLASS = {
  'G‘oya': 'idea',
  Reja: 'plan',
  Savol: 'question',
  Kontekst: 'context'
};

const ACTIONS = [
  { key: 'add-child', glyph: '＋', label: 'Shu fikrdan yangi fikr chiqarish' },
  { key: 'detail', glyph: '◌', label: 'Fikrning ichki qatlamini ochish' },
  { key: 'edit', glyph: '✎', label: 'Fikrni tahrirlash' },
  { key: 'focus', glyph: '◎', label: 'Shu fikr atrofini ko‘rish' },
  { key: 'link', glyph: '↗', label: 'Boshqa fikr bilan bog‘lash' },
  { key: 'delete', glyph: '×', label: 'Fikrni o‘chirish' }
];

export function createCardLayer({ canvas, camera, handlers }) {
  if (!canvas) throw new Error('createCardLayer: canvas elementi majburiy.');

  /** @type {Map<string, HTMLElement>} */
  const elements = new Map();
  let dragging = null;

  const elementOf = id => elements.get(String(id)) ?? null;

  /** Kartaning makon koordinatalaridagi to'rtburchagi. */
  function rectOf(id, card) {
    const node = elementOf(id);
    if (!node) return null;
    const source = card ?? {
      x: parseFloat(node.style.left) || 0,
      y: parseFloat(node.style.top) || 0
    };
    return {
      x: source.x,
      y: source.y,
      width: node.offsetWidth || 235,
      height: node.offsetHeight || 138
    };
  }

  function endDrag() {
    if (!dragging) return;
    const { node, pointerId, moved, id } = dragging;
    dragging = null;
    try {
      node.releasePointerCapture?.(pointerId);
    } catch {
      /* pointer allaqachon yo'qolgan bo'lishi mumkin */
    }
    node.classList.remove('is-dragging');
    if (moved) handlers.onMoveCommit?.(id);
  }

  function startDrag(event, card, node) {
    if (event.target.closest('button')) return;
    if (handlers.isConnecting?.()) {
      handlers.onConnectTarget?.(card.id);
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    dragging = {
      id: card.id,
      node,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: card.x,
      originY: card.y,
      moved: false
    };
    node.setPointerCapture?.(event.pointerId);
    handlers.onSelectCard?.(card.id);
  }

  function handleMove(event) {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const zoom = camera?.zoom ?? 1;
    const x = dragging.originX + (event.clientX - dragging.startX) / zoom;
    const y = dragging.originY + (event.clientY - dragging.startY) / zoom;
    if (
      !dragging.moved &&
      Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 3
    ) {
      dragging.moved = true;
      dragging.node.classList.add('is-dragging');
    }
    if (!dragging.moved) return;
    dragging.node.style.left = `${x}px`;
    dragging.node.style.top = `${y}px`;
    handlers.onMove?.(dragging.id, x, y);
  }

  // Sudrashni HUJJAT darajasida tugatamiz: pointer karta ustidan chiqib
  // ketsa yoki tizim uni bekor qilsa ham holat toza qoladi.
  document.addEventListener('pointermove', handleMove, { passive: true });
  document.addEventListener('pointerup', endDrag, { passive: true });
  document.addEventListener('pointercancel', endDrag, { passive: true });
  document.addEventListener('lostpointercapture', endDrag, { passive: true });

  function handleKeydown(event, card) {
    const nudge = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    const moves = {
      ArrowUp: [0, -nudge],
      ArrowDown: [0, nudge],
      ArrowLeft: [-nudge, 0],
      ArrowRight: [nudge, 0]
    };

    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      const x = card.x + dx;
      const y = card.y + dy;
      // DOM ni ham darhol yangilaymiz: holatni o'zgartirishning o'zi
      // kartani ekranda surmaydi (`render()` chaqirilmaydi).
      const node = elementOf(card.id);
      if (node) {
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
      }
      handlers.onMove?.(card.id, x, y);
      handlers.onMoveCommit?.(card.id);
      return;
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (handlers.isConnecting?.()) handlers.onConnectTarget?.(card.id);
        else handlers.onDetail?.(card.id);
        break;
      case ' ':
        event.preventDefault();
        handlers.onFocusCard?.(card.id);
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        handlers.onDelete?.(card.id);
        break;
      case 'e':
      case 'E':
        event.preventDefault();
        handlers.onEdit?.(card.id);
        break;
      case 'c':
      case 'C':
        event.preventDefault();
        handlers.onLink?.(card.id);
        break;
      default:
        break;
    }
  }

  function buildCard(card) {
    const article = el('article', {
      class: `thought-card ${KIND_CLASS[card.type] ?? 'idea'}`,
      role: 'group',
      tabindex: '0',
      dataset: { cardId: card.id }
    });

    const actions = el('div', { class: 'card-actions', role: 'toolbar' });
    actions.setAttribute('aria-label', 'Fikr amallari');
    for (const action of ACTIONS) {
      const button = el('button', {
        type: 'button',
        class: action.key,
        title: action.label,
        'aria-label': action.label,
        text: action.glyph
      });
      button.addEventListener('click', event => {
        event.stopPropagation();
        handlers.onAction?.(action.key, card.id);
      });
      actions.append(button);
    }

    const text = el('p', { text: card.text });
    article.append(actions, text);

    article.addEventListener('pointerdown', event => startDrag(event, card, article));
    article.addEventListener('keydown', event => handleKeydown(event, card));
    article.addEventListener('dblclick', event => {
      if (event.target.closest('button')) return;
      handlers.onFocusCard?.(card.id);
    });
    // Sensorli ekranda amallar panelini bosish orqali ochamiz.
    article.addEventListener('click', event => {
      if (event.target.closest('button') || !isCoarsePointer()) return;
      for (const other of $$('.thought-card.actions-open', canvas)) {
        if (other !== article) other.classList.remove('actions-open');
      }
      article.classList.toggle('actions-open');
    });

    return article;
  }

  function label(card) {
    const preview = card.text.length > 60 ? `${card.text.slice(0, 57)}…` : card.text;
    return `${card.type}: ${preview || 'bo‘sh fikr'}`;
  }

  /** Kartalar to'plamini sinxronlaydi — mavjudlari qayta yaratilmaydi. */
  function render(cards, view = {}) {
    const seen = new Set();

    for (const card of cards) {
      const id = String(card.id);
      seen.add(id);
      let node = elements.get(id);
      if (!node) {
        node = buildCard(card);
        elements.set(id, node);
        canvas.append(node);
      }

      node.className = `thought-card ${KIND_CLASS[card.type] ?? 'idea'}`;
      const paragraph = node.querySelector('p');
      if (paragraph.textContent !== card.text) paragraph.textContent = card.text;
      node.setAttribute('aria-label', label(card));
      if (node !== dragging?.node) {
        node.style.left = `${card.x}px`;
        node.style.top = `${card.y}px`;
      }

      /**
       * Amallar paneli standart holatda kartaning USTIDA turadi. Karta ish
       * maydonining yuqori chekkasiga yaqin bo'lsa, panel qirqilib qoladi.
       *
       * Buni RENDER vaqtida hisoblaymiz, `pointerenter` da emas: aks holda
       * panel foydalanuvchi sichqonchani olib borgan paytda joyini
       * o'zgartirib, bosish mo'ljaldan chetga tushardi.
       */
      const zoom = camera?.zoom ?? 1;
      const panY = camera?.state?.panY ?? 0;
      node.classList.toggle('actions-below', panY + card.y * zoom < 52);

      node.classList.toggle('connect-source', String(view.connectingFrom) === id);
      node.classList.toggle('is-focused', String(view.focusedId) === id);
      node.classList.toggle('is-dimmed', Boolean(view.dimmed?.size) && !view.dimmed.has(id));
    }

    for (const [id, node] of elements) {
      if (!seen.has(id)) {
        node.remove();
        elements.delete(id);
      }
    }
  }

  function focus(id) {
    elementOf(id)?.focus();
  }

  function flash(id) {
    const node = elementOf(id);
    if (!node) return;
    node.classList.add('search-hit');
    node.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    });
    setTimeout(() => node.classList.remove('search-hit'), 1200);
  }

  return { render, rectOf, elementOf, focus, flash };
}
