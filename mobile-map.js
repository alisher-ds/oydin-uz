/* Oydin Makon — mobile viewport gestures */
(() => {
  const canvas=document.querySelector('#canvas'),workspace=document.querySelector('#workspace');
  if(!canvas||!workspace||!matchMedia('(pointer: coarse)').matches)return;
  const pointers=new Map();
  let pan={x:0,y:0},pinch=null,suppressClickUntil=0;
  const zoom=()=>Math.max(.5,(Number(document.querySelector('#zoom')?.textContent?.replace('%',''))||100)/100);
  const transform=()=>{const s=zoom();canvas.style.transform=`translate3d(${pan.x}px,${pan.y}px,0) scale(${s})`;const l=document.querySelector('#connections');if(l)l.style.transform=`translate3d(${pan.x}px,${pan.y}px,0) scale(${s})`};
  const dist=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
  const mid=(a,b)=>({x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2});
  workspace.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'||!e.isPrimary||e.target.closest('.card-actions'))return;
    pointers.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY});
    if(e.target.closest('.thought-card'))return;
    e.preventDefault();
    try{workspace.setPointerCapture(e.pointerId)}catch{}
    if(pointers.size===2){const p=[...pointers.values()];pinch={d:dist(p[0],p[1]),s:zoom(),p:{...pan},m:mid(p[0],p[1])}}
    else workspace.__panStart={x:e.clientX-pan.x,y:e.clientY-pan.y};
  },{passive:false});
  workspace.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY});
    if(e.target.closest('.thought-card'))return;
    e.preventDefault();
    if(pointers.size>=2){
      const p=[...pointers.values()].slice(0,2);if(!pinch)pinch={d:dist(p[0],p[1]),s:zoom(),p:{...pan},m:mid(p[0],p[1])};
      const next=Math.max(.5,Math.min(1.75,pinch.s*dist(p[0],p[1])/(pinch.d||1))),m=mid(p[0],p[1]);
      pan.x=pinch.p.x+m.x-pinch.m.x;pan.y=pinch.p.y+m.y-pinch.m.y;
      const z=document.querySelector('#zoom');if(z)z.textContent=Math.round(next*100)+'%';
      canvas.style.transform=`translate3d(${pan.x}px,${pan.y}px,0) scale(${next})`;const l=document.querySelector('#connections');if(l)l.style.transform=`translate3d(${pan.x}px,${pan.y}px,0) scale(${next})`;return;
    }
    if(workspace.__panStart){pan.x=e.clientX-workspace.__panStart.x;pan.y=e.clientY-workspace.__panStart.y;transform()}
  },{passive:false});
  const finish=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(!pointers.size){workspace.__panStart=null;suppressClickUntil=performance.now()+180}};
  workspace.addEventListener('pointerup',finish,{passive:false});workspace.addEventListener('pointercancel',finish,{passive:false});
  document.addEventListener('click',e=>{if(performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation()}},true);
  ['zoomIn','zoomOut','fitMap'].forEach(id=>document.querySelector('#'+id)?.addEventListener('click',()=>requestAnimationFrame(transform)));
  transform();
})();
