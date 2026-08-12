/* Oydin — keep connection strokes outside the readable part of a thought. */
(() => {
  const svg=document.querySelector('#connections'), canvas=document.querySelector('#canvas');
  if(!svg||!canvas)return;
  const ns='http://www.w3.org/2000/svg';
  const center=el=>({x:parseFloat(el.style.left)||0+el.offsetWidth/2,y:parseFloat(el.style.top)||0+el.offsetHeight/2});
  const anchor=(el,target,gap=8)=>{
    const x=parseFloat(el.style.left)||0,y=parseFloat(el.style.top)||0,w=el.offsetWidth,h=el.offsetHeight;
    const cx=x+w/2,cy=y+h/2,dx=target.x-cx,dy=target.y-cy;
    const sx=Math.abs(dx)/(w/2||1),sy=Math.abs(dy)/(h/2||1),k=1/Math.max(sx,sy,1e-6);
    const px=cx+dx*k,py=cy+dy*k;
    const len=Math.hypot(dx,dy)||1;
    return {x:px+dx/len*gap,y:py+dy/len*gap};
  };
  const redraw=()=>{
    const cards=[...canvas.querySelectorAll('.thought-card')];
    const groups=[...svg.querySelectorAll('.connection-group')];
    if(!cards.length||!groups.length)return;
    const centers=cards.map(el=>({el,x:(parseFloat(el.style.left)||0)+el.offsetWidth/2,y:(parseFloat(el.style.top)||0)+el.offsetHeight/2}));
    groups.forEach(group=>{
      const path=group.querySelector('.connection-line');
      const glow=group.querySelector('.connection-glow');
      if(!path)return;
      const nums=(path.getAttribute('d')||'').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number)||[];
      if(nums.length<8)return;
      const oldA={x:nums[0],y:nums[1]},oldB={x:nums[6],y:nums[7]};
      const a=centers.reduce((best,p)=>!best||Math.hypot(p.x-oldA.x,p.y-oldA.y)<Math.hypot(best.x-oldA.x,best.y-oldA.y)?p:best,null);
      const b=centers.reduce((best,p)=>!best||Math.hypot(p.x-oldB.x,p.y-oldB.y)<Math.hypot(best.x-oldB.x,best.y-oldB.y)?p:best,null);
      if(!a||!b||a===b)return;
      const p1=anchor(a.el,{x:b.x,y:b.y}),p2=anchor(b.el,{x:a.x,y:a.y});
      const dx=p2.x-p1.x,dy=p2.y-p1.y,dist=Math.hypot(dx,dy),bend=Math.max(55,Math.min(180,dist*.32));
      let d;
      if(Math.abs(dx)>Math.abs(dy)) d=`M${p1.x},${p1.y} C${p1.x+Math.sign(dx)*bend},${p1.y-dy*.08} ${p2.x-Math.sign(dx)*bend},${p2.y+dy*.08} ${p2.x},${p2.y}`;
      else d=`M${p1.x},${p1.y} C${p1.x-dx*.08},${p1.y+Math.sign(dy)*bend} ${p2.x+dx*.08},${p2.y-Math.sign(dy)*bend} ${p2.x},${p2.y}`;
      path.setAttribute('d',d); if(glow)glow.setAttribute('d',d);
    });
  };
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;redraw()})};
  new MutationObserver(schedule).observe(svg,{childList:true,subtree:true});
  window.addEventListener('resize',schedule);
  schedule();
})();
