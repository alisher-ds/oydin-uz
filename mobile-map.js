/* Oydin — touch-first dragging for Makon.
   Loaded after app.js so it can take over card dragging on touch devices. */
(() => {
  const canvas = document.querySelector('#canvas');
  const workspace = document.querySelector('#workspace');
  if (!canvas || !workspace || !matchMedia('(pointer: coarse)').matches) return;

  let active = null;
  let moved = false;

  document.addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.thought-card');
    if (!card || event.target.closest('button')) return;

    const id = card.dataset.id;
    const cards = (() => {
      try {
        const maps = JSON.parse(localStorage.getItem('oydin-maps') || '{}');
        const mapId = localStorage.getItem('oydin-active-map') || 'map-default';
        return maps[mapId]?.cards || [];
      } catch { return []; }
    })();
    const data = cards.find(item => String(item.id) === String(id));
    if (!data) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    active = {
      id,
      data,
      startX: event.clientX,
      startY: event.clientY,
      originX: Number(data.x) || 0,
      originY: Number(data.y) || 0,
      pointerId: event.pointerId
    };
    moved = false;
    card.classList.add('is-dragging');
    try { card.setPointerCapture(event.pointerId); } catch {}
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const scale = Math.max(.5, (Number(document.querySelector('#zoom')?.textContent?.replace('%','')) || 100) / 100);
    const dx = (event.clientX - active.startX) / scale;
    const dy = (event.clientY - active.startY) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;

    const card = canvas.querySelector(`[data-id="${CSS.escape(String(active.id))}"]`);
    if (!card) return;
    const maxX = Math.max(20, canvas.clientWidth - card.offsetWidth - 20);
    const maxY = Math.max(90, canvas.clientHeight - card.offsetHeight - 70);
    active.data.x = Math.max(20, Math.min(maxX, active.originX + dx));
    active.data.y = Math.max(90, Math.min(maxY, active.originY + dy));
    card.style.left = `${active.data.x}px`;
    card.style.top = `${active.data.y}px`;
  }, {passive:false});

  const finish = (event) => {
    if (!active || event.pointerId !== active.pointerId) return;
    const card = canvas.querySelector(`[data-id="${CSS.escape(String(active.id))}"]`);
    if (card) card.classList.remove('is-dragging');
    if (moved) {
      try {
        const maps = JSON.parse(localStorage.getItem('oydin-maps') || '{}');
        const mapId = localStorage.getItem('oydin-active-map') || 'map-default';
        if (maps[mapId]) {
          const saved = maps[mapId].cards?.find(item => String(item.id) === String(active.id));
          if (saved) {
            saved.x = active.data.x;
            saved.y = active.data.y;
            maps[mapId].updatedAt = new Date().toISOString();
            localStorage.setItem('oydin-maps', JSON.stringify(maps));
          }
        }
      } catch {}
      document.dispatchEvent(new CustomEvent('oydin-card-moved', {detail:{id:active.id}}));
    }
    active = null;
  };

  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);
})();
