/**
 * Aloqa chiziqlari qatlami.
 *
 * Tuzatilgan kamchiliklar:
 *  - chiziq endi kartaning MARKAZIDAN emas, CHEGARASIDAN boshlanadi (matn
 *    ustidan kesib o'tmaydi);
 *  - qaysi chiziq qaysi kartaga tegishli ekani `from`/`to` id'lari orqali
 *    ANIQ bilinadi — ilgari `d` atributidan regex bilan raqamlar ajratib
 *    olinib, "eng yaqin markaz" bo'yicha taxmin qilinardi;
 *  - sudrash paytida butun SVG qayta qurilmaydi, faqat `d` atributi yangilanadi;
 *  - chiziqlar klaviatura va ekran o'quvchilari uchun ochiq (ilgari ular
 *    `aria-hidden` konteynerida edi, ya'ni umuman yetib bo'lmasdi).
 */

import { EVENTS } from '../core/index.js';
import { connectionPath } from './geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {{
 *   layer: SVGElement,
 *   getCardRect: (id: string) => {x:number,y:number,width:number,height:number} | null,
 *   getCardText: (id: string) => string,
 *   getRelationLabel: (id: string) => string,
 *   onSelect: (id: string) => void,
 *   onDelete: (id: string) => void
 * }} options
 */
export function createConnectionLayer({
  layer,
  getCardRect,
  getCardText,
  getRelationLabel,
  onSelect,
  onDelete
}) {
  if (!layer) throw new Error('createConnectionLayer: layer elementi majburiy.');

  /** @type {Map<string, {group: SVGGElement, glow: SVGPathElement, line: SVGPathElement, label: SVGTextElement}>} */
  const nodes = new Map();
  let edges = [];
  let selectedId = null;

  const shortText = id => {
    const text = getCardText(id) ?? '';
    return text.length > 40 ? `${text.slice(0, 37)}…` : text || 'nomsiz fikr';
  };

  function describe(edge) {
    const relation = getRelationLabel(edge.id);
    const base = `Aloqa: ${shortText(edge.from)} — ${shortText(edge.to)}`;
    return relation ? `${base}. Turi: ${relation}` : base;
  }

  function createNode(edge) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'connection-group');
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.dataset.connectionId = edge.id;

    const title = document.createElementNS(SVG_NS, 'title');
    group.append(title);

    const glow = document.createElementNS(SVG_NS, 'path');
    glow.setAttribute('class', 'connection-glow');

    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('class', 'connection-line');

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'connection-label');
    label.setAttribute('text-anchor', 'middle');

    group.append(glow, line, label);

    group.addEventListener('click', event => {
      event.stopPropagation();
      onSelect(edge.id);
    });
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(edge.id);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        onDelete(edge.id);
      }
    });

    layer.append(group);
    return { group, glow, line, label, title };
  }

  /** Chiziq geometriyasini yangilaydi. Elementlar qayta yaratilmaydi. */
  function updatePaths() {
    for (const edge of edges) {
      const node = nodes.get(edge.id);
      if (!node) continue;
      const fromRect = getCardRect(edge.from);
      const toRect = getCardRect(edge.to);
      if (!fromRect || !toRect) {
        node.group.style.display = 'none';
        continue;
      }
      node.group.style.display = '';

      const d = connectionPath(fromRect, toRect);
      node.line.setAttribute('d', d);
      node.glow.setAttribute('d', d);

      const relation = getRelationLabel(edge.id);
      if (relation) {
        try {
          const mid = node.line.getPointAtLength(node.line.getTotalLength() / 2);
          node.label.setAttribute('x', String(mid.x));
          node.label.setAttribute('y', String(mid.y - 8));
          node.label.textContent = relation;
        } catch {
          node.label.textContent = '';
        }
      } else {
        node.label.textContent = '';
      }
      node.title.textContent = describe(edge);
      node.group.setAttribute('aria-label', describe(edge));
    }
    globalThis.dispatchEvent(new CustomEvent(EVENTS.connectionsRendered));
  }

  /** Aloqalar to'plamini sinxronlaydi: yangilarini qo'shadi, keraksizini olib tashlaydi. */
  function render(nextEdges) {
    edges = nextEdges.map(edge => ({
      id: String(edge.id),
      from: String(edge.from),
      to: String(edge.to)
    }));
    const seen = new Set(edges.map(edge => edge.id));

    for (const [id, node] of nodes) {
      if (!seen.has(id)) {
        node.group.remove();
        nodes.delete(id);
      }
    }
    for (const edge of edges) {
      if (!nodes.has(edge.id)) nodes.set(edge.id, createNode(edge));
    }
    applySelection();
    updatePaths();
  }

  function applySelection() {
    for (const [id, node] of nodes) {
      const active = id === selectedId;
      node.group.classList.toggle('selected', active);
      node.group.setAttribute('aria-pressed', String(active));
    }
  }

  function setSelected(id) {
    selectedId = id == null ? null : String(id);
    applySelection();
  }

  function focus(id) {
    nodes.get(String(id))?.group.focus?.();
  }

  /** SVG o'lchamini konteyner o'lchamiga moslaydi. */
  function resize(width, height) {
    layer.setAttribute('viewBox', `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`);
  }

  return { render, updatePaths, setSelected, focus, resize, describe };
}
