/* Oydin product layer: progressive enhancement over the existing UI. */
(() => {
  const MAP = !!document.querySelector('#canvas');
  const OQIM = !!document.querySelector('#ideas');
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  if (MAP) {
    const HKEY='oydin-history-v1', MAX=30;
    let restoring=false;
    const originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){
      if(!restoring && k==='oydin-maps'){
        try{const prev=localStorage.getItem(k);if(prev&&prev!==v){const h=JSON.parse(localStorage.getItem(HKEY)||'[]');h.push({maps:prev,active:localStorage.getItem('oydin-active-map')});localStorage.setItem(HKEY,JSON.stringify(h.slice(-MAX)));}}catch{}
      }
      return originalSet.call(this,k,v);
    };
    const historyBack=()=>{try{const h=JSON.parse(localStorage.getItem(HKEY)||'[]');const item=h.pop();if(!item)return;restoring=true;originalSet.call(localStorage,HKEY,JSON.stringify(h));originalSet.call(localStorage,'oydin-maps',item.maps);if(item.active)originalSet.call(localStorage,'oydin-active-map',item.active);location.reload();}catch{}};
    const addTools=()=>{const cluster=document.querySelector('.workspace-toolbar .tool-cluster');if(!cluster||document.querySelector('#oydinProductTools'))return;const wrap=document.createElement('div');wrap.id='oydinProductTools';wrap.className='tool-cluster product-tools';wrap.innerHTML='<button id="historyUndo" title="Bekor qilish · Ctrl/Cmd+Z" aria-label="Bekor qilish">↶</button><button id="focusSearch" title="Makon ichidan qidirish · /" aria-label="Qidirish">⌕</button><button id="exportSpace" title="Makonni eksport qilish" aria-label="Eksport">↓</button>';cluster.parentElement?.insertBefore(wrap,cluster.parentElement.firstChild);wrap.querySelector('#historyUndo').onclick=historyBack;wrap.querySelector('#focusSearch').onclick=()=>openSearch();wrap.querySelector('#exportSpace').onclick=exportMap;};
    const openSearch=()=>{let d=document.querySelector('#mapSearchDialog');if(!d){d=document.createElement('dialog');d.id='mapSearchDialog';d.innerHTML='<div class="product-dialog"><button class="dialog-close" data-close>×</button><p class="kicker">MAKON ICHIDA</p><h2>Fikrni toping</h2><input id="mapSearchInput" autocomplete="off" placeholder="Fikrni qidiring…"><div id="mapSearchResults"></div></div>';document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();}const input=d.querySelector('#mapSearchInput'),results=d.querySelector('#mapSearchResults');const run=()=>{const q=input.value.trim().toLowerCase();const cards=[...document.querySelectorAll('.thought-card')];results.innerHTML='';cards.forEach(c=>{const text=c.querySelector('p')?.textContent||'';if(!q||text.toLowerCase().includes(q)){const b=document.createElement('button');b.className='search-result';b.textContent=text;b.onclick=()=>{d.close();focusCard(c)};results.append(b)}});if(!results.children.length)results.innerHTML='<p class="product-empty">Mos fikr topilmadi.</p>';};input.oninput=run;d.showModal();setTimeout(()=>{input.focus();run()},30);};
    const focusCard=el=>{el.classList.add('search-hit');el.scrollIntoView?.({block:'center',inline:'center',behavior:'smooth'});setTimeout(()=>el.classList.remove('search-hit'),1200);};
    const exportMap=()=>{try{const maps=JSON.parse(localStorage.getItem('oydin-maps')||'{}');const id=localStorage.getItem('oydin-active-map');const data=maps[id];if(!data)return;const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(data.title||'oydin-makon').replace(/[^\p{L}\p{N}\-_ ]/gu,'').trim()+'.json';a.click();URL.revokeObjectURL(a.href)}catch{}};

    // Oqim is a mode of Makon, not a separate page. The existing Oqim page remains
    // available as a standalone route, but this is the natural in-workspace entry.
    const mountOqimMode=()=>{
      const rail=document.querySelector('#railNotes');
      const workspace=document.querySelector('#workspace');
      const canvas=document.querySelector('#canvas');
      if(!rail||!workspace||!canvas||document.querySelector('#oqimMode'))return;
      rail.innerHTML='<span>≋</span><b>Oqim</b><small>fikrni ketma-ket davom ettirish</small>';
      rail.setAttribute('aria-label','Oqim rejimi');
      const mode=document.createElement('section');mode.id='oqimMode';mode.className='oqim-mode';mode.setAttribute('aria-label','Oqim rejimi');
      mode.innerHTML='<div class="oqim-mode-head"><div><p class="kicker">MAKON ICHIDA</p><h2>Oqim</h2><p>Fikrlarni ketma-ket yozing. Keyin xohlasangiz ularni Makonga yoying.</p></div><button id="backToMap" class="soft-button" type="button">Makonni ko‘rish</button></div><div class="oqim-capture"><textarea id="mapFlowInput" maxlength="1000" placeholder="Hozir nimani o‘ylayapsiz? Enter — yangi fikr, Shift+Enter — yangi qator…"></textarea><button id="mapFlowAdd" class="primary-button" type="button">Fikrni ushlash <span>→</span></button></div><div id="mapFlowList" class="map-flow-list"></div>';
      workspace.appendChild(mode);
      const render=()=>{let maps={};try{maps=JSON.parse(localStorage.getItem('oydin-maps')||'{}')}catch{}const id=localStorage.getItem('oydin-active-map');const data=maps[id]||{};const ideas=Array.isArray(data.ideas)?data.ideas:Array.isArray(data.thoughts)?data.thoughts:[];const list=mode.querySelector('#mapFlowList');list.innerHTML=ideas.length?ideas.map((x,i)=>`<article class="map-flow-item"><span>${String(i+1).padStart(2,'0')}</span><p>${esc(x.text||x.content||x.title||'')}</p><button type="button" data-flow-map="${esc(x.id||'')}">Makon →</button></article>`).join(''):'<div class="map-flow-empty"><strong>Oqim hali bo‘sh.</strong><p>Fikrni ushlang. Uni hozircha tartiblash shart emas.</p></div>';list.querySelectorAll('[data-flow-map]').forEach(b=>b.onclick=()=>{showMap();const id=b.dataset.flowMap;const card=canvas.querySelector(`.thought-card[data-id="${CSS.escape(id)}"]`);if(card){card.classList.add('search-hit');card.scrollIntoView({behavior:'smooth',block:'center'});}});};
      const showFlow=()=>{workspace.classList.add('oqim-active');canvas.style.visibility='hidden';workspace.querySelector('#connections').style.visibility='hidden';workspace.querySelector('.workspace-toolbar').style.visibility='hidden';mode.hidden=false;render();rail.classList.add('active');document.querySelector('#railMap')?.classList.remove('active');};
      const showMap=()=>{workspace.classList.remove('oqim-active');canvas.style.visibility='visible';workspace.querySelector('#connections').style.visibility='visible';workspace.querySelector('.workspace-toolbar').style.visibility='visible';mode.hidden=true;rail.classList.remove('active');document.querySelector('#railMap')?.classList.add('active');};
      rail.onclick=showFlow;document.querySelector('#railMap')?.addEventListener('click',showMap);mode.querySelector('#backToMap').onclick=showMap;
      const add=()=>{const input=mode.querySelector('#mapFlowInput');const text=input.value.trim();if(!text)return;const active=localStorage.getItem('oydin-active-map');let maps={};try{maps=JSON.parse(localStorage.getItem('oydin-maps')||'{}')}catch{};const data=maps[active];if(!data)return;data.ideas=data.ideas||[];const item={id:'idea-'+Date.now().toString(36),text,createdAt:new Date().toISOString(),type:'G‘oya'};data.ideas.push(item);maps[active]=data;localStorage.setItem('oydin-maps',JSON.stringify(maps));input.value='';render();};
      mode.querySelector('#mapFlowAdd').onclick=add;mode.querySelector('#mapFlowInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();add();}});mode.hidden=true;
    };
    mountOqimMode();
    document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();historyBack();}if(e.key==='/'){e.preventDefault();openSearch();}});
    const obs=new MutationObserver(()=>addTools());obs.observe(document.body,{childList:true,subtree:true});addTools();
  }

  if(OQIM){const list=document.querySelector('#ideas'),input=document.querySelector('#ideaInput');const addSearch=()=>{if(document.querySelector('#oqimSearch'))return;const box=document.createElement('div');box.className='oqim-search';box.innerHTML='<span>⌕</span><input id="oqimSearch" placeholder="Oqimdan qidiring…" aria-label="Oqimdan qidiring">';list.parentElement?.insertBefore(box,list);const search=box.querySelector('input');search.oninput=()=>{const q=search.value.trim().toLowerCase();list.querySelectorAll('.idea-row').forEach(row=>{row.style.display=(!q||(row.querySelector('.idea-text')?.textContent||'').toLowerCase().includes(q))?'grid':'none'});};document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,button'))return;if(e.key==='/'){e.preventDefault();search.focus();}});};const obs=new MutationObserver(addSearch);obs.observe(list,{childList:true,subtree:true});addSearch();}
})();
