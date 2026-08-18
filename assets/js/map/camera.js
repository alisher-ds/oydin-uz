/**
 * Makon kamerasi — pan va zoom uchun YAGONA egasi.
 *
 * Ilgari `updateZoom()` va `applyPan()` ikkalasi ham `canvas.style.transform`
 * ni boshqarardi va bir-biri bilan CSS o'zgaruvchilari orqali
 * `getComputedStyle` bilan "gaplashardi". Natijada zoom tugmalari ekran
 * markazidan emas, chap yuqori burchakdan kattalashtirardi.
 *
 * Endi holat bitta joyda: `{ panX, panY, zoom }`.
 */

import { EVENTS, isCoarsePointer } from '../core/index.js';
import { ZOOM_MAX, ZOOM_MIN, clamp, clampZoom } from './geometry.js';

const PAN_THRESHOLD = 6;
const DOUBLE_TAP_MS = 320;

/**
 * @param {{workspace: HTMLElement, canvas: HTMLElement, layer: SVGElement}} elements
 */
export function createCamera({ workspace, canvas, layer }) {
  if (!workspace || !canvas || !layer) {
    throw new Error('createCamera: workspace, canvas va layer elementlari majburiy.');
  }

  const view = { panX: 0, panY: 0, zoom: 1 };
  const pointers = new Map();
  let gesture = null;
  let frame = 0;
  let lastTap = 0;
  let onDoubleTap = null;

  canvas.style.transformOrigin = '0 0';
  layer.style.transformOrigin = '0 0';

  const emit = () =>
    globalThis.dispatchEvent(new CustomEvent(EVENTS.cameraChanged, { detail: { ...view } }));

  function apply() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const transform = `translate3d(${view.panX}px, ${view.panY}px, 0) scale(${view.zoom})`;
      canvas.style.transform = transform;
      layer.style.transform = transform;
      emit();
    });
  }

  /** Ekran koordinatasini makon koordinatasiga o'giradi. */
  function screenToCanvas(clientX, clientY) {
    const rect = workspace.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.panX) / view.zoom,
      y: (clientY - rect.top - view.panY) / view.zoom
    };
  }

  /** Berilgan NUQTA atrofida zoom qiladi (nuqta joyida qoladi). */
  function zoomAt(nextZoom, originX, originY) {
    const zoom = clampZoom(nextZoom);
    if (Math.abs(zoom - view.zoom) < 0.0001) return;
    view.panX = originX - (originX - view.panX) * (zoom / view.zoom);
    view.panY = originY - (originY - view.panY) * (zoom / view.zoom);
    view.zoom = zoom;
    apply();
  }

  /** Ekran MARKAZI atrofida zoom qiladi — tugmalar shuni ishlatadi. */
  function zoomBy(delta) {
    const rect = workspace.getBoundingClientRect();
    zoomAt(view.zoom + delta, rect.width / 2, rect.height / 2);
  }

  function setView(next) {
    view.zoom = clampZoom(next.zoom ?? view.zoom);
    view.panX = Number.isFinite(next.panX) ? next.panX : view.panX;
    view.panY = Number.isFinite(next.panY) ? next.panY : view.panY;
    apply();
  }

  const isBlankSurface = target =>
    target instanceof Element &&
    !target.closest(
      '.thought-card, button, input, textarea, select, dialog, .workspace-toolbar, .flow-panel, .space-hint, .relation-panel'
    );

  const pointOf = event => ({ x: event.clientX, y: event.clientY });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function beginPinch() {
    const [a, b] = [...pointers.values()];
    gesture = {
      type: 'pinch',
      startDistance: Math.max(1, distance(a, b)),
      startMid: midpoint(a, b),
      startZoom: view.zoom,
      startPanX: view.panX,
      startPanY: view.panY
    };
  }

  function handleDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!isBlankSurface(event.target)) return;
    pointers.set(event.pointerId, pointOf(event));

    if (pointers.size === 2) {
      beginPinch();
      event.preventDefault();
      return;
    }
    const point = pointOf(event);
    gesture = { type: 'pending', start: point, last: point };
  }

  function handleMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, pointOf(event));

    if (pointers.size >= 2) {
      if (gesture?.type !== 'pinch') beginPinch();
      const [a, b] = [...pointers.values()];
      const spread = Math.max(1, distance(a, b));
      const mid = midpoint(a, b);
      const zoom = clamp((gesture.startZoom * spread) / gesture.startDistance, ZOOM_MIN, ZOOM_MAX);
      view.panX = mid.x - (gesture.startMid.x - gesture.startPanX) * (zoom / gesture.startZoom);
      view.panY = mid.y - (gesture.startMid.y - gesture.startPanY) * (zoom / gesture.startZoom);
      view.zoom = zoom;
      apply();
      event.preventDefault();
      return;
    }

    if (!gesture || gesture.type === 'pinch') return;
    const point = pointOf(event);
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;

    if (gesture.type === 'pending' && Math.hypot(dx, dy) > PAN_THRESHOLD) {
      // Sensorli qurilmada tik harakat sahifani aylantirish uchun qoldiriladi.
      const verticalScroll = isCoarsePointer() && Math.abs(dy) > Math.abs(dx) * 1.12;
      gesture.type = verticalScroll ? 'page-scroll' : 'pan';
    }

    if (gesture.type === 'pan') {
      view.panX += point.x - gesture.last.x;
      view.panY += point.y - gesture.last.y;
      gesture.last = point;
      apply();
      event.preventDefault();
    }
  }

  function handleUp(event) {
    if (
      event.type === 'pointerup' &&
      event.pointerType === 'touch' &&
      gesture?.type === 'pending' &&
      isBlankSurface(event.target)
    ) {
      const now = Date.now();
      if (now - lastTap < DOUBLE_TAP_MS) onDoubleTap?.();
      lastTap = now;
    }

    pointers.delete(event.pointerId);
    if (!pointers.size) {
      gesture = null;
      return;
    }
    if (pointers.size === 1 && gesture?.type === 'pinch') {
      const [point] = [...pointers.values()];
      gesture = { type: 'pending', start: point, last: point };
    }
  }

  function handleWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = workspace.getBoundingClientRect();
    zoomAt(
      view.zoom * Math.exp(-event.deltaY * 0.0015),
      event.clientX - rect.left,
      event.clientY - rect.top
    );
  }

  workspace.addEventListener('pointerdown', handleDown, { passive: false });
  workspace.addEventListener('pointermove', handleMove, { passive: false });
  workspace.addEventListener('pointerup', handleUp, { passive: true });
  // `pointercancel` ni ham eshitamiz — aks holda tizim jesti gesture'ni
  // yarim yo'lda qoldirsa, kamera "yopishib" qoladi.
  workspace.addEventListener('pointercancel', handleUp, { passive: true });
  workspace.addEventListener('lostpointercapture', handleUp, { passive: true });
  workspace.addEventListener('wheel', handleWheel, { passive: false });

  apply();

  return {
    get zoom() {
      return view.zoom;
    },
    get state() {
      return { ...view };
    },
    zoomAt,
    zoomBy,
    setView,
    screenToCanvas,
    setDoubleTapHandler(handler) {
      onDoubleTap = handler;
    },
    destroy() {
      cancelAnimationFrame(frame);
      workspace.removeEventListener('pointerdown', handleDown);
      workspace.removeEventListener('pointermove', handleMove);
      workspace.removeEventListener('pointerup', handleUp);
      workspace.removeEventListener('pointercancel', handleUp);
      workspace.removeEventListener('lostpointercapture', handleUp);
      workspace.removeEventListener('wheel', handleWheel);
    }
  };
}
