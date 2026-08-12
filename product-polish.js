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
    document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();historyBack();}if(e.key==='/'){e.preventDefault();openSearch();}});
    const obs=new MutationObserver(()=>addTools());obs.observe(document.body,{childList:true,subtree:true});addTools();
  }

  if(OQIM){
    const list=document.querySelector('#ideas');
    const addSearch=()=>{
      if(!list||document.querySelector('#oqimSearch'))return;
      const box=document.createElement('div');box.className='oqim-search';box.innerHTML='<span>⌕</span><input id="oqimSearch" placeholder="Oqimdan qidiring…" aria-label="Oqimdan qidiring">';
      list.parentElement?.insertBefore(box,list);
      const search=box.querySelector('input');search.oninput=()=>{const q=search.value.trim().toLowerCase();list.querySelectorAll('.idea-row').forEach(row=>{row.style.display=(!q||(row.querySelector('.idea-text')?.textContent||'').toLowerCase().includes(q))?'grid':'none'});};
      document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,button'))return;if(e.key==='/'){e.preventDefault();search.focus();}});
    };
    const obs=new MutationObserver(addSearch);obs.observe(list,{childList:true,subtree:true});addSearch();
  }
})();
