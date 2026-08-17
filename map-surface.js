/* Oydin — Makon surface interaction.
   Single owner for blank-surface pan/touch gestures.
   Zoom state and zoom buttons belong to app.js; this file never owns a second camera. */
(() => {
  const workspace = document.querySelector('#workspace');
  const canvas = document.querySelector('#canvas');
  const layer = document.querySelector('#connections');
  if (!workspace || !canvas || !layer) return;

  const pointers = new Map();
  let gesture = null;
  let panX = 0;
  let panY = 0;
  let raf = 0;
  let lastTap = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const isMobile = matchMedia('(pointer: coarse)').matches;
  const getZoom = () => clamp((parseFloat(document.querySelector('#zoom')?.textContent) || 100) / 100, .5, 1.75);
  const point = event => ({ x: event.clientX, y: event.clientY });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const blankTarget = target => {
    if (!target) return false;
    return !target.closest('.thought-card, button, input, textarea, select, dialog, .workspace-toolbar, .flow-panel, .space-hint');
  };

  const applyPan = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const zoom = getZoom();
      canvas.style.setProperty('--oydin-pan-x', `${panX}px`);
      canvas.style.setProperty('--oydin-pan-y', `${panY}px`);
      const transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
      canvas.style.transformOrigin = '0 0';
      layer.style.transformOrigin = '0 0';
      canvas.style.transform = transform;
      layer.style.transform = transform;
    });
  };

  const setZoomAt = (nextScale, focalX, focalY) => {
    const oldScale = getZoom();
    const scale = clamp(nextScale, .5, 1.75);
    if (Math.abs(scale - oldScale) < .0001) return;
    panX = focalX - (focalX - panX) * (scale / oldScale);
    panY = focalY - (focalY - panY) * (scale / oldScale);
    canvas.style.setProperty('--oydin-pan-x', `${panX}px`);
    canvas.style.setProperty('--oydin-pan-y', `${panY}px`);
    if (window.OydinMapCamera?.setZoom) window.OydinMapCamera.setZoom(scale);
    else applyPan();
  };

  const startGesture = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!blankTarget(event.target)) return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', startDistance: Math.max(1, distance(a, b)), startMidpoint: midpoint(a, b), startScale: getZoom(), startPanX: panX, startPanY: panY };
      event.preventDefault();
      return;
    }
    const p = point(event);
    gesture = { type: 'pending', start: p, last: p };
  };

  const moveGesture = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      if (!gesture || gesture.type !== 'pinch') {
        gesture = { type: 'pinch', startDistance: Math.max(1, distance(a, b)), startMidpoint: midpoint(a, b), startScale: getZoom(), startPanX: panX, startPanY: panY };
      }
      const currentDistance = Math.max(1, distance(a, b));
      const currentMidpoint = midpoint(a, b);
      const nextScale = clamp(gesture.startScale * currentDistance / gesture.startDistance, .5, 1.75);
      panX = currentMidpoint.x - (gesture.startMidpoint.x - gesture.startPanX) * (nextScale / gesture.startScale);
      panY = currentMidpoint.y - (gesture.startMidpoint.y - gesture.startPanY) * (nextScale / gesture.startScale);
      canvas.style.setProperty('--oydin-pan-x', `${panX}px`);
      canvas.style.setProperty('--oydin-pan-y', `${panY}px`);
      if (window.OydinMapCamera?.setZoom) window.OydinMapCamera.setZoom(nextScale); else applyPan();
      event.preventDefault();
      return;
    }
    if (!gesture || gesture.type === 'pinch') return;
    const p = point(event), dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
    if (gesture.type === 'pending' && Math.hypot(dx, dy) > 6) {
      gesture.type = isMobile && Math.abs(dy) > Math.abs(dx) * 1.12 ? 'page-scroll' : 'pan';
    }
    if (gesture.type === 'pan') {
      panX += p.x - gesture.last.x;
      panY += p.y - gesture.last.y;
      gesture.last = p;
      applyPan();
      event.preventDefault();
    }
  };

  const endGesture = event => {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) { gesture = null; return; }
    if (pointers.size === 1 && gesture?.type === 'pinch') {
      const p = [...pointers.values()][0];
      gesture = { type: 'pending', start: p, last: p };
    }
  };

  workspace.addEventListener('pointerdown', startGesture, { passive: false });
  workspace.addEventListener('pointermove', moveGesture, { passive: false });
  workspace.addEventListener('pointerup', endGesture, { passive: true });
  workspace.addEventListener('pointercancel', endGesture, { passive: true });

  workspace.addEventListener('click', event => {
    const card = event.target.closest('.thought-card');
    if (!card || event.target.closest('button')) return;
    if (matchMedia('(pointer: coarse)').matches) {
      workspace.querySelectorAll('.thought-card.actions-open').forEach(item => { if (item !== card) item.classList.remove('actions-open'); });
      card.classList.toggle('actions-open');
    }
  });

  workspace.addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch' || !blankTarget(event.target)) return;
    const now = Date.now();
    if (now - lastTap < 320) document.querySelector('#emptyAdd')?.click();
    lastTap = now;
  }, { passive: true });

  document.addEventListener('keydown', event => {
    if (event.target.matches('input,textarea,select')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#addFirst')?.click(); }
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); document.querySelector('#addFirst')?.click(); }
    if (event.key === 'Escape') workspace.querySelectorAll('.thought-card.actions-open').forEach(item => item.classList.remove('actions-open'));
  });

  applyPan();
})();
