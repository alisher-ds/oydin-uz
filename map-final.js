/* Oydin — interaction polish. Keeps the existing visual system intact. */
(() => {
  const w=document.querySelector('#workspace'), c=document.querySelector('#canvas'), svg=document.querySelector('#connections');
  if(!w||!c||!svg)return;
  let pts=new Map(), mode=null, start=null, last=null, pinch=null, panX=0, panY=0, scale=1;
  const zoomEl=document.querySelector('#zoom');
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const getScale=()=>clamp((parseFloat(zoomEl?.textContent)||100)/100,.5,1.75);
  const apply=()=>{
    const t=`translate3d(${panX}px,${panY}px,0) scale(${scale})`;
    c.style.transformOrigin='0 0';svg.style.transformOrigin='0 0';
    c.style.transform=t;svg.style.transform=t;
    if(zoomEl)zoomEl.textContent=Math.round(scale*100)+'%';
  };
  const zoomAt=(next,x,y)=>{
    const old=scale,nextS=clamp(next,.5,1.75);
    panX=x-(x-panX)*(nextS/old);panY=y-(y-panY)*(nextS/old);scale=nextS;apply();
  };
  const blank=e=>!e.target.closest('.thought-card,.card-actions,.workspace-toolbar,.flow-panel,.space-hint,button,input,textarea,select,dialog');
  const pos=e=>({x:e.clientX,y:e.clientY});
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});

  const down=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(!blank(e))return;
    pts.set(e.pointerId,pos(e));
    if(pts.size===2){
      const [a,b]=[...pts.values()];
      pinch={d:dist(a,b)||1,s:scale,m:mid(a,b),px:panX,py:panY};mode='pinch';e.preventDefault();return;
    }
    const p=pos(e);start=p;last=p;mode='pending';
  };
  const move=e=>{
    if(!pts.has(e.pointerId))return;
    pts.set(e.pointerId,pos(e));
    if(pts.size>=2){
      const [a,b]=[...pts.values()];
      if(!pinch)pinch={d:dist(a,b)||1,s:scale,m:mid(a,b),px:panX,py:panY};
      const d=dist(a,b),m=mid(a,b),s=clamp(pinch.s*(d/(pinch.d||1)),.5,1.75);
      panX=pinch.px+m.x-pinch.m.x;panY=pinch.py+m.y-pinch.m.y;scale=s;mode='pinch';e.preventDefault();apply();return;
    }
    if(!start)return;
    const p=pos(e),dx=p.x-start.x,dy=p.y-start.y;
    if(mode==='pending'&&Math.hypot(dx,dy)>5)mode='pan';
    if(mode==='pan'){panX+=p.x-last.x;panY+=p.y-last.y;last=p;e.preventDefault();apply();}
  };
  const up=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(!pts.size){mode=null;start=last=null;}};

  w.addEventListener('pointerdown',down,{passive:false});
  w.addEventListener('pointermove',move,{passive:false});
  w.addEventListener('pointerup',up,{passive:true});
  w.addEventListener('pointercancel',up,{passive:true});
  w.addEventListener('wheel',e=>{
    if(e.ctrlKey||e.metaKey){e.preventDefault();const r=w.getBoundingClientRect();zoomAt(scale*Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);}
  },{passive:false});

  document.querySelector('#zoomIn')?.addEventListener('click',()=>zoomAt(scale+.1,w.clientWidth/2,w.clientHeight/2));
  document.querySelector('#zoomOut')?.addEventListener('click',()=>zoomAt(scale-.1,w.clientWidth/2,w.clientHeight/2));

  // On touch, a tap reveals the existing card actions instead of keeping them visible.
  w.addEventListener('click',e=>{
    const card=e.target.closest('.thought-card');
    if(!card||e.target.closest('button'))return;
    if(matchMedia('(pointer:coarse)').matches){
      w.querySelectorAll('.thought-card.actions-open').forEach(x=>{if(x!==card)x.classList.remove('actions-open');});
      card.classList.toggle('actions-open');
    }
  });

  // Double-click/tap on empty workspace starts a thought without adding another permanent control.
  let lastTap=0;
  w.addEventListener('pointerup',e=>{
    if(e.pointerType!=='touch'||!blank(e))return;
    const now=Date.now();
    if(now-lastTap<320){document.querySelector('#emptyAdd')?.click();}
    lastTap=now;
  },{passive:true});

  // Keyboard layer: fast capture without changing the visual interface.
  document.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea,select'))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.querySelector('#addFirst')?.click();}
    if(e.key.toLowerCase()==='n'){e.preventDefault();document.querySelector('#addFirst')?.click();}
    if(e.key==='Escape')w.querySelectorAll('.thought-card.actions-open').forEach(x=>x.classList.remove('actions-open'));
  });

  // Real fit-to-view: calculates the visible bounds instead of merely resetting the zoom.
  document.querySelector('#fitMap')?.addEventListener('click',()=>{
    setTimeout(()=>{
      const cards=[...c.querySelectorAll('.thought-card')];
      if(!cards.length){panX=0;panY=0;scale=1;apply();return;}
      const rects=cards.map(el=>({x:parseFloat(el.style.left)||0,y:parseFloat(el.style.top)||0,w:el.offsetWidth||160,h:el.offsetHeight||60}));
      const minX=Math.min(...rects.map(r=>r.x)),minY=Math.min(...rects.map(r=>r.y));
      const maxX=Math.max(...rects.map(r=>r.x+r.w)),maxY=Math.max(...rects.map(r=>r.y+r.h));
      const pad=80,bw=Math.max(1,maxX-minX),bh=Math.max(1,maxY-minY);
      const next=clamp(Math.min((w.clientWidth-pad*2)/bw,(w.clientHeight-pad*2)/bh),.5,1.75);
      scale=next;panX=(w.clientWidth-(maxX+minX)*next)/2;panY=(w.clientHeight-(maxY+minY)*next)/2;apply();
    },20);
  });

  scale=getScale();apply();
})();
