/* Oydin — final mobile/desktop polish. One gesture layer only. */
(() => {
  const w=document.querySelector('#workspace'), c=document.querySelector('#canvas'), svg=document.querySelector('#connections');
  if(!w||!c||!svg)return;
  const coarse=matchMedia('(pointer:coarse)').matches;
  let pts=new Map(), mode=null, start=null, last=null, pinch=null, panX=0, panY=0, scale=1;
  const zoomEl=document.querySelector('#zoom');
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const getScale=()=>clamp((parseFloat(zoomEl?.textContent)||100)/100,.5,1.75);
  const apply=()=>{const t=`translate3d(${panX}px,${panY}px,0) scale(${scale})`;c.style.transformOrigin='0 0';svg.style.transformOrigin='0 0';c.style.transform=t;svg.style.transform=t;if(zoomEl)zoomEl.textContent=Math.round(scale*100)+'%'};
  const zoomAt=(next,x,y)=>{const old=scale,nextS=clamp(next,.5,1.75);panX=x-(x-panX)*(nextS/old);panY=y-(y-panY)*(nextS/old);scale=nextS;apply()};
  const blank=e=>!e.target.closest('.thought-card,.card-actions,.workspace-toolbar,.flow-panel,.space-hint,button,input,textarea,select,dialog');
  const pos=e=>({x:e.clientX,y:e.clientY});
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const down=e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(!blank(e)&&e.pointerType!=='touch')return;
    if(e.target.closest('.thought-card'))return;
    pts.set(e.pointerId,pos(e));
    if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:dist(a,b),s:scale,m:mid(a,b),px:panX,py:panY};mode='pinch';e.preventDefault();return}
    const p=pos(e);start=p;last=p;mode='pending';
  };
  const move=e=>{
    if(!pts.has(e.pointerId))return;pts.set(e.pointerId,pos(e));
    if(pts.size>=2){const [a,b]=[...pts.values()];if(!pinch)pinch={d:dist(a,b),s:scale,m:mid(a,b),px:panX,py:panY};const d=dist(a,b),m=mid(a,b),s=clamp(pinch.s*(d/(pinch.d||d)),.5,1.75);panX=pinch.px+m.x-pinch.m.x;panY=pinch.py+m.y-pinch.m.y;scale=s;mode='pinch';e.preventDefault();apply();return}
    if(!start||mode==='page')return;const p=pos(e),dx=p.x-start.x,dy=p.y-start.y;
    if(mode==='pending'&&Math.hypot(dx,dy)>7){if(coarse&&Math.abs(dy)>Math.abs(dx)*1.15){mode='page';return}mode='pan'}
    if(mode==='pan'){panX+=p.x-last.x;panY+=p.y-last.y;last=p;e.preventDefault();apply()}
  };
  const up=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(!pts.size){mode=null;start=last=null}};
  w.addEventListener('pointerdown',down,{passive:false});w.addEventListener('pointermove',move,{passive:false});w.addEventListener('pointerup',up,{passive:true});w.addEventListener('pointercancel',up,{passive:true});
  w.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();const r=w.getBoundingClientRect();zoomAt(scale*Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top)}},{passive:false});
  document.querySelector('#zoomIn')?.addEventListener('click',()=>zoomAt(scale+.1,w.clientWidth/2,w.clientHeight/2));
  document.querySelector('#zoomOut')?.addEventListener('click',()=>zoomAt(scale-.1,w.clientWidth/2,w.clientHeight/2));
  document.querySelector('#fitMap')?.addEventListener('click',()=>{panX=0;panY=0;scale=getScale();apply()});
  scale=getScale();apply();
})();
