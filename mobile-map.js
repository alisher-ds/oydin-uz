/* Oydin Makon — touch-first mobile interaction */
(() => {
  const canvas = document.querySelector('#canvas');
  const workspace = document.querySelector('#workspace');
  if (!canvas || !workspace || !matchMedia('(pointer: coarse)').matches) return;

  let active = null;
  let moved = false;
  let suppressClickUntil = 0;

  const getData = id => {
    try {
      const maps = JSON.parse(localStorage.getItem('oydin-maps') || '{}');
      const mapId = localStorage.getItem('oydin-active-map') || 'map-default';
      return maps[mapId]?.cards?.find(item => String(item.id) === String(id)) || null;
    } catch { return null; }
  };

  const getScale = () => Math.max(.5, (Number(document.querySelector('#zoom')?.textContent?.replace('%','')) || 100) / 100);

  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    const card = event.target.closest?.('.thought-card');
    if (!card || event.target.closest?.('button')) return;

    const data = getData(card.dataset.id);
    if (!data) return;

    /* Capture at document level so the gesture cannot be lost when the card
       moves away from the original finger position. */
    event.preventDefault();
    event.stopImmediatePropagation();
    active = {id:card.dataset.id,card,data,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,pointerId:event.pointerId};
    moved = false;
    card.classList.add('is-dragging');
    try { card.setPointerCapture(event.pointerId); } catch {}
  }, true);

  document.addEventListener('pointermove', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();

    const scale = getScale();
    const dx = (event.clientX - active.lastX) / scale;
    const dy = (event.clientY - active.lastY) / scale;
    if (Math.hypot(event.clientX-active.startX,event.clientY-active.startY) > 5) moved = true;

    active.data.x = (Number(active.data.x)||0) + dx;
    active.data.y = (Number(active.data.y)||0) + dy;

    /* Do not hard-stop the card at the workspace edge. Give it breathing room
       so the finger can keep moving naturally instead of hitting a wall. */
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cw = active.card.offsetWidth || 194;
    const ch = active.card.offsetHeight || 116;
    const minX = -Math.min(180, w*.18);
    const maxX = w-cw+Math.min(180,w*.18);
    const minY = -Math.min(120,h*.15);
    const maxY = h-ch+Math.min(120,h*.15);
    active.data.x = Math.max(minX,Math.min(maxX,active.data.x));
    active.data.y = Math.max(minY,Math.min(maxY,active.data.y));

    active.card.style.left = `${active.data.x}px`;
    active.card.style.top = `${active.data.y}px`;
    active.lastX = event.clientX;
    active.lastY = event.clientY;

    document.dispatchEvent(new CustomEvent('oydin-card-moved',{detail:{id:active.id}}));
  }, {capture:true,passive:false});

  const finish = event => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    active.card.classList.remove('is-dragging');
    if (moved) {
      suppressClickUntil = performance.now()+300;
      try {
        const maps = JSON.parse(localStorage.getItem('oydin-maps') || '{}');
        const mapId = localStorage.getItem('oydin-active-map') || 'map-default';
        const map = maps[mapId];
        const saved = map?.cards?.find(item => String(item.id) === String(active.id));
        if (saved) { saved.x=active.data.x; saved.y=active.data.y; map.updatedAt=new Date().toISOString(); localStorage.setItem('oydin-maps',JSON.stringify(maps)); }
      } catch {}
    }
    active=null;
  };

  document.addEventListener('pointerup',finish,{capture:true,passive:false});
  document.addEventListener('pointercancel',finish,{capture:true,passive:false});
  document.addEventListener('click',event=>{
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  },true);
})();
