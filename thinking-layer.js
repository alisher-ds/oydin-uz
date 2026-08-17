/* Oydin Phase 4 — Thinking Layer */
(() => {
  if (!document.querySelector('#canvas')) return;
  const canvas = document.querySelector('#canvas');
  const layer = document.querySelector('#connections');
  const workspace = document.querySelector('#workspace');
  const REL_KEY = 'oydin-connection-relations-v1';
  const relations = (() => { try { return JSON.parse(localStorage.getItem(REL_KEY) || '{}'); } catch { return {}; } })();
  const relationTypes = [['davomi','Davomi'],['sabab','Sabab'],['natija','Natija'],['qarshi','Qarama-qarshi'],['izoh','Izoh']];
  let focused = null;
  let relationPanel = null;
  const save = () => localStorage.setItem(REL_KEY, JSON.stringify(relations));
  const cards = () => [...canvas.querySelectorAll('.thought-card')];
  const idOf = el => String(el?.dataset?.id || '');
  const getStoredConnections = () => {
    try {
      const maps = JSON.parse(localStorage.getItem('oydin-maps') || '{}');
      const id = localStorage.getItem('oydin-active-map');
      return maps[id]?.connections || [];
    } catch { return []; }
  };
  const neighbors = id => {
    const out = new Set([String(id)]);
    getStoredConnections().forEach(e => {
      if (String(e.from) === String(id)) out.add(String(e.to));
      if (String(e.to) === String(id)) out.add(String(e.from));
    });
    return out;
  };
  const clearFocus = () => {
    focused = null;
    workspace.classList.remove('thinking-focus');
    cards().forEach(c => c.classList.remove('is-dimmed','is-focused'));
    document.querySelector('#exitThinkingFocus')?.remove();
  };
  const focusCard = card => {
    if (!card) return;
    focused = idOf(card);
    const allowed = neighbors(focused);
    workspace.classList.add('thinking-focus');
    cards().forEach(c => {
      const on = allowed.has(idOf(c));
      c.classList.toggle('is-focused', idOf(c) === focused);
      c.classList.toggle('is-dimmed', !on);
    });
    let button = document.querySelector('#exitThinkingFocus');
    if (!button) {
      button = document.createElement('button');
      button.id = 'exitThinkingFocus';
      button.type = 'button';
      button.innerHTML = '<span>×</span> Fikr ko‘rishdan chiqish';
      workspace.appendChild(button);
      button.onclick = clearFocus;
    }
  };
  const ensureCardTools = () => cards().forEach(card => {
    if (card.querySelector('.thinking-focus-action')) return;
    const actions = card.querySelector('.card-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'thinking-focus-action';
    button.title = 'Shu fikr atrofini ko‘rish'; button.setAttribute('aria-label', button.title); button.textContent = '◎';
    button.onclick = e => { e.stopPropagation(); focusCard(card); };
    actions.insertBefore(button, actions.firstChild);
  });
  const relationName = id => relations[id]?.label || '';
  const connectionId = group => String(group?.dataset?.connectionId || group?.querySelector('.connection-line')?.dataset?.connectionId || '');
  const paintRelationLabels = () => {
    if (!layer) return;
    layer.querySelectorAll('.thinking-relation-label').forEach(x => x.remove());
    layer.querySelectorAll('.connection-line').forEach(path => {
      const group = path.closest('.connection-group');
      const id = connectionId(group) || String(path.dataset.connectionId || '');
      const label = relationName(id);
      if (!group || !id || !label) return;
      try {
        const len = path.getTotalLength();
        const p = path.getPointAtLength(len / 2);
        const text = document.createElementNS('http://www.w3.org/2000/svg','text');
        text.setAttribute('x', p.x); text.setAttribute('y', p.y - 8); text.setAttribute('text-anchor','middle');
        text.setAttribute('class','thinking-relation-label'); text.textContent = label; text.style.pointerEvents = 'none';
        layer.appendChild(text);
      } catch {}
    });
  };
  const selectedConnectionId = () => {
    const selected = layer?.querySelector('.connection-group.selected');
    if (!selected) return null;
    return connectionId(selected) || null;
  };
  const closePanel = () => { relationPanel?.remove(); relationPanel = null; };
  const openRelationPanel = id => {
    if (!id) return;
    closePanel();
    relationPanel = document.createElement('div');
    relationPanel.id = 'relationPanel';
    relationPanel.innerHTML = `<div class="relation-head"><span>Aloqa turi</span><button type="button" aria-label="Yopish">×</button></div><div class="relation-options">${relationTypes.map(([k,l]) => `<button type="button" data-rel="${k}" class="${relations[id]?.type === k ? 'selected':''}">${l}</button>`).join('')}</div><p>Bu yorliq fikrlar orasidagi munosabatni eslab qoladi.</p>`;
    workspace.appendChild(relationPanel);
    relationPanel.querySelector('.relation-head button').onclick = closePanel;
    relationPanel.querySelectorAll('[data-rel]').forEach(b => b.onclick = () => {
      const type = b.dataset.rel;
      relations[id] = { type, label: relationTypes.find(x => x[0] === type)?.[1] || type };
      save();
      relationPanel.querySelectorAll('[data-rel]').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected'); paintRelationLabels();
    });
  };
  const scan = () => {
    ensureCardTools();
    const selected = selectedConnectionId();
    if (selected) openRelationPanel(selected); else if (!document.querySelector('#relationPanel')) closePanel();
    paintRelationLabels();
    if (focused) {
      const allowed = neighbors(focused);
      cards().forEach(c => { const on = allowed.has(idOf(c)); c.classList.toggle('is-dimmed', !on); c.classList.toggle('is-focused', idOf(c) === focused); });
    }
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePanel(); if (focused) clearFocus(); } });
  document.addEventListener('dblclick', e => { const card = e.target.closest?.('.thought-card'); if (card && !e.target.closest('button')) focusCard(card); });
  const observer = new MutationObserver(() => requestAnimationFrame(scan));
  observer.observe(canvas, { childList: true, subtree: true });
  observer.observe(layer, { childList: true, subtree: true, attributes: true });
  requestAnimationFrame(scan);
})();
