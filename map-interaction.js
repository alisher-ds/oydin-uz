/* Oydin Makon — final surface interaction
   Blank-space pan, reliable zoom buttons, two-finger pinch and mobile-safe scroll. */
(() => {
  const canvas = document.querySelector('#canvas');
  const workspace = document.querySelector('#workspace');
  const layer = document.querySelector('#connections');
  const zoomLabel = document.querySelector('#zoom');
  if (!canvas || !workspace || !layer || !zoomLabel) return;

  let scale = 1;
  let panX = 0;
  let panY = 0;
  let pointers = new Map();
  let gesture = null;
  let moved = false;
  let raf = 0;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const isMobile = matchMedia('(pointer: coarse)').matches;

  const readZoom = () => {
    const n = parseFloat(zoomLabel.textContent) || 100;
    scale = clamp(n / 100, .5, 1.75);
  };

  const apply = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
      canvas.style.transformOrigin = '0 0';
      layer.style.transformOrigin = '0 0';
      canvas.style.transform = transform;
      layer.style.transform = transform;
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    });
  };

  const setZoom = (next, focalX = workspace.clientWidth / 2, focalY = workspace.clientHeight / 2) => {
    const old = scale;
    const value = clamp(next, .5, 1.75);
    if (Math.abs(value - old) < .0001) return;
    panX = focalX - (focalX - panX) * (value / old);
    panY = focalY - (focalY - panY) * (value / old);
    scale = value;
    apply();
  };

  const refreshFromApp = () => {
    const n = parseFloat(zoomLabel.textContent) || 100;
    scale = clamp(n / 100, .5, 1.75);
    apply();
  };

  // Keep the existing app buttons, but make their visual transform authoritative.
  document.querySelector('#zoomIn')?.addEventListener('click', () => {
    setTimeout(() => {
      scale = clamp((parseFloat(zoomLabel.textContent) || 100) / 100, .5, 1.75);
      apply();
    }, 0);
  });
  document.querySelector('#zoomOut')?.addEventListener('click', () => {
    setTimeout(() => {
      scale = clamp((parseFloat(zoomLabel.textContent) || 100) / 100, .5, 1.75);
      apply();
    }, 0);
  });

  // Wheel / trackpad zoom. Plain wheel remains normal page/workspace scrolling.
  workspace.addEventListener('wheel', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = workspace.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * .0015);
    setZoom(scale * factor, e.clientX - r.left, e.clientY - r.top);
  }, {passive:false});

  const blankTarget = target => {
    if (!target) return false;
    return !target.closest('.thought-card, button, input, textarea, select, dialog, .workspace-toolbar, .flow-panel, .space-hint');
  };

  const point = e => ({x:e.clientX, y:e.clientY});
  const distance = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
  const midpoint = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

  workspace.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!blankTarget(e.target)) return;
    pointers.set(e.pointerId, point(e));

    if (pointers.size === 2) {
      const [a,b] = [...pointers.values()];
      gesture = {type:'pinch', distance:distance(a,b), scale, midpoint:midpoint(a,b), panX, panY};
      moved = true;
      e.preventDefault();
      return;
    }

    const p = point(e);
    gesture = {type:'pending',start:p,last:p};
    moved = false;
  }, {passive:false});

  workspace.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, point(e));

    if (pointers.size >= 2) {
      const [a,b] = [...pointers.values()];
      if (!gesture || gesture.type !== 'pinch') {
        gesture = {type:'pinch',distance:distance(a,b),scale,midpoint:midpoint(a,b),panX,panY};
      }
      const d = distance(a,b);
      const m = midpoint(a,b);
      const ratio = gesture.distance ? d / gesture.distance : 1;
      const nextScale = clamp(gesture.scale * ratio, .5, 1.75);
      const oldScale = gesture.scale;
      const baseX = gesture.panX;
      const baseY = gesture.panY;
      panX = m.x - (gesture.midpoint.x - baseX) * (nextScale / oldScale);
      panY = m.y - (gesture.midpoint.y - baseY) * (nextScale / oldScale);
      scale = nextScale;
      moved = true;
      e.preventDefault();
      apply();
      return;
    }

    if (!gesture || gesture.type === 'pinch') return;
    const p = point(e);
    const dx = p.x - gesture.start.x;
    const dy = p.y - gesture.start.y;
    if (gesture.type === 'pending' && Math.hypot(dx,dy) > 6) {
      // On phones, vertical movement belongs to the page. Horizontal movement
      // belongs to the Makon surface. This prevents the map from hijacking scroll.
      const vertical = isMobile && Math.abs(dy) > Math.abs(dx) * 1.12;
      if (vertical) {
        gesture.type = 'page-scroll';
        return;
      }
      gesture.type = 'pan';
      moved = true;
    }

    if (gesture.type === 'pan') {
      panX += p.x - gesture.last.x;
      panY += p.y - gesture.last.y;
      gesture.last = p;
      e.preventDefault();
      apply();
    }
  }, {passive:false});

  const end = e => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (gesture?.type === 'pan' && moved) {
        workspace.classList.remove('surface-panning');
      }
      gesture = null;
      moved = false;
      return;
    }
    if (pointers.size === 1 && gesture?.type === 'pinch') {
      const p = [...pointers.values()][0];
      gesture = {type:'pending',start:p,last:p};
    }
  };

  workspace.addEventListener('pointerup', end, {passive:false});
  workspace.addEventListener('pointercancel', end, {passive:false});

  // Desktop visual feedback only; mobile keeps the browser's natural scroll feel.
  workspace.addEventListener('pointermove', () => {
    if (gesture?.type === 'pan') workspace.classList.add('surface-panning');
  }, {passive:true});

  // Start from a known state without destroying the app's saved zoom value.
  readZoom();
  apply();
})();
