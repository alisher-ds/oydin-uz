(() => {
  const TOKEN_KEY='oydin-vault-token-v1', LAST_KEY='oydin-sync-last-v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem('oydin-maps')||'[]')}catch{return[]}};
  const write=x=>localStorage.setItem('oydin-maps',JSON.stringify(x));
  const merge=(a,b)=>{const m=new Map(a.filter(Boolean).map(x=>[x.id,x]));for(const x of b||[]){if(!x?.id)continue;const y=m.get(x.id);if(!y||String(x.updatedAt||x.updated_at||'')>String(y.updatedAt||''))m.set(x.id,x)}return [...m.values()]};
  let busy=false, queued=false, timer;
  async function sync(){if(busy){queued=true;return}busy=true;try{const token=localStorage.getItem(TOKEN_KEY);const r=await fetch('/api/sync',{method:'POST',headers:{'content-type':'application/json',...(token?{'X-Oydin-Vault':token}:{})},body:JSON.stringify({token:token||undefined,spaces:read()})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Sync failed');if(d.token&&!token)localStorage.setItem(TOKEN_KEY,d.token);if(Array.isArray(d.spaces))write(merge(read(),d.spaces));localStorage.setItem(LAST_KEY,d.syncedAt||new Date().toISOString());window.dispatchEvent(new CustomEvent('oydin:sync',{detail:{ok:true,at:d.syncedAt}}))}catch(e){window.dispatchEvent(new CustomEvent('oydin:sync',{detail:{ok:false,error:e.message}}))}finally{busy=false;if(queued){queued=false;sync()}}}
  const schedule=(ms=1000)=>{clearTimeout(timer);timer=setTimeout(sync,ms)};
  window.OydinSync=Object.freeze({sync,schedule,lastSync:()=>localStorage.getItem(LAST_KEY)});
  addEventListener('online',()=>schedule(100));addEventListener('pagehide',()=>{if(navigator.onLine)sync()});addEventListener('oydin:data-changed',()=>schedule());document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(100)});
  schedule(300);
})();
