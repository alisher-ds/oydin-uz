const $=s=>document.querySelector(s);
const canvas=$('#canvas'),dialog=$('#cardDialog'),connectionsLayer=$('#connections');
let type='G‘oya',zoom=100,connectingFrom=null;
const prompts=['Bugun boshingizda eng ko‘p aylanayotgan narsa nima?','Qaysi kichik narsa sizdan energiya olyapti?','Agar bitta narsani aniq qilsangiz, qaysi biri yengillashadi?','Hozir aytmay yurgan savolingiz nima?'];
let cards=load('oydin-cards',[]),connections=load('oydin-connections',[]);
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}}
function safe(t){return t.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function category(t){return ({'G‘oya':'idea','Vazifa':'task','Savol':'question','Xavotir':'worry'})[t]||'idea'}
function save(){try{localStorage.setItem('oydin-cards',JSON.stringify(cards));localStorage.setItem('oydin-connections',JSON.stringify(connections));localStorage.setItem('oydin-title',$('#mapTitle').value);$('#saveStatus').textContent='Saqlangan'}catch{$('#saveStatus').textContent='Saqlash imkonsiz'}}
function insightFallback(){const tasks=cards.filter(c=>c.type==='Vazifa'),ideas=cards.filter(c=>c.type==='G‘oya');if(tasks.length)return `Keyingi tiniq qadam: “${tasks[0].text}”`;if(ideas.length)return `Signal topildi: “${ideas[0].text}” g‘oyasini bitta juda kichik qadamga aylantiring.`;return 'Bitta fikrni Vazifa yoki G‘oya deb belgilang — Oydin yo‘nalish beradi.'}
async function insight(){
  if(!cards.length)return insightFallback();
  try{
    const {getEmbedder,embedTexts,centralityScores}=await import('./embed.js');
    const extractor=await getEmbedder();
    const vectors=await embedTexts(extractor,cards.map(c=>c.text));
    const scores=centralityScores(vectors),order=scores.map((s,i)=>i).sort((a,b)=>scores[b]-scores[a]);
    const bestTask=order.find(i=>cards[i].type==='Vazifa'),bestIdea=order.find(i=>cards[i].type==='G‘oya');
    if(bestTask!==undefined)return `Keyingi tiniq qadam: “${cards[bestTask].text}” — bu fikringiz boshqalar bilan eng ko‘p bog‘langan.`;
    if(bestIdea!==undefined)return `Signal topildi: “${cards[bestIdea].text}” — boshqa fikrlaringiz shu g‘oya atrofida aylanyapti.`;
    return `Eng markaziy fikringiz: “${cards[order[0]].text}”`;
  }catch(err){console.error('Semantik tahlil ishlamadi:',err);return insightFallback()}
}
function cardCenter(card){const el=canvas.querySelector(`[data-id="${card.id}"]`);return el?{x:card.x+el.offsetWidth/2,y:card.y+el.offsetHeight/2}:{x:card.x+102.5,y:card.y+57}}
function drawConnections(){
  if(!connectionsLayer)return;
  connectionsLayer.setAttribute('viewBox',`0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);
  connectionsLayer.innerHTML='';
  connections.forEach(edge=>{
    const a=cards.find(c=>c.id===edge.from),b=cards.find(c=>c.id===edge.to);if(!a||!b)return;
    const p1=cardCenter(a),p2=cardCenter(b),dx=p2.x-p1.x,curve=Math.max(35,Math.abs(dx)*.35);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',`M ${p1.x} ${p1.y} C ${p1.x+curve} ${p1.y}, ${p2.x-curve} ${p2.y}, ${p2.x} ${p2.y}`);
    path.setAttribute('class','connection-line');connectionsLayer.append(path);
  });
}
function connect(from,to){if(from===to||connections.some(e=>(e.from===from&&e.to===to)||(e.from===to&&e.to===from)))return;connections.push({from,to});connectingFrom=null;save();render()}
function render(){
  canvas.querySelectorAll('.thought-card').forEach(x=>x.remove());
  $('#emptyState').style.display=cards.length?'none':'block';$('#count').textContent=`${cards.length} ta fikr`;
  $('#findStep').disabled=!cards.length;$('#flowText').textContent=connectingFrom?'Bog‘lanish uchun boshqa fikrni bosing.':cards.length?`${cards.length} fikr orasidan yo‘nalishni ajrating.`:'Bitta fikr yozing — Oydin siz uchun signalni topadi.';
  cards.forEach(card=>{
    const el=document.createElement('article');el.className=`thought-card ${category(card.type)}${connectingFrom===card.id?' connect-source':''}`;el.style.left=card.x+'px';el.style.top=card.y+'px';el.dataset.id=card.id;
    el.innerHTML=`<button class="delete" title="O‘chirish" type="button" aria-label="Fikrni o‘chirish">×</button><button class="link-card" title="Boshqa fikr bilan bog‘lash" type="button" aria-label="Fikrni bog‘lash">↗</button><span class="card-type">${safe(card.type).toUpperCase()}</span><p>${safe(card.text)}</p>`;
    canvas.append(el);
    el.querySelector('.delete').onclick=e=>{e.stopPropagation();cards=cards.filter(c=>c.id!==card.id);connections=connections.filter(x=>x.from!==card.id&&x.to!==card.id);if(connectingFrom===card.id)connectingFrom=null;save();render()};
    el.querySelector('.link-card').onclick=e=>{e.stopPropagation();connectingFrom=card.id;render()};
    el.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;if(connectingFrom&&connectingFrom!==card.id){e.preventDefault();connect(connectingFrom,card.id);return}drag(el,card,e)},{passive:false});
  });
  drawConnections();
}
function drag(el,card,startEvent){
  let sx=startEvent.clientX,sy=startEvent.clientY,ox=card.x,oy=card.y;el.setPointerCapture(startEvent.pointerId);
  const move=e=>{card.x=Math.max(5,Math.min(canvas.clientWidth-el.offsetWidth-5,ox+e.clientX-sx));card.y=Math.max(55,Math.min(canvas.clientHeight-el.offsetHeight-10,oy+e.clientY-sy));el.style.left=card.x+'px';el.style.top=card.y+'px';drawConnections()};
  const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);save()};el.addEventListener('pointermove',move);el.addEventListener('pointerup',up,{once:true})
}
function open(){dialog.showModal();setTimeout(()=>$('#thoughtText').focus(),80)}
$('#addCard').onclick=open;$('#addFirst').onclick=open;$('#closeCard').onclick=()=>dialog.close();
$('#spark').onclick=()=>{const p=prompts[Math.floor(Math.random()*prompts.length)];$('#promptChip').textContent=p;open()};
$('#findStep').onclick=async()=>{$('#findStep').disabled=true;$('#flowText').textContent='Fikrlar orasidagi bog‘liqlikni tahlil qilyapmiz…';const result=await insight();$('#flowText').textContent=result;$('#flowBar').style.borderColor='#f16e59';$('#findStep').disabled=!cards.length};
$('#themeToggle').onclick=()=>{const night=document.body.classList.toggle('night');localStorage.setItem('oydin-theme',night?'night':'light');$('#themeToggle').setAttribute('aria-label',night?'Kunduzgi rejimni yoqish':'Tungi rejimni yoqish')};if(localStorage.getItem('oydin-theme')==='night')document.body.classList.add('night');
$('#newMap').onclick=()=>{if(confirm('Yangi xarita boshlansinmi? Hozirgi kartalar va bog‘lanishlar o‘chadi.')){cards=[];connections=[];connectingFrom=null;$('#mapTitle').value='Yangi xarita';save();render()}};
document.querySelectorAll('.type').forEach(b=>b.onclick=()=>{document.querySelector('.type.selected')?.classList.remove('selected');b.classList.add('selected');type=b.dataset.type});
$('#cardForm').addEventListener('submit',e=>{e.preventDefault();const text=$('#thoughtText').value.trim();if(!text)return;const n=cards.length;cards.push({id:Date.now(),text,type,x:Math.max(30,(n*73)%Math.max(160,canvas.clientWidth-230)),y:90+(n*81)%Math.max(180,canvas.clientHeight-220)});$('#thoughtText').value='';save();dialog.close();render()});
$('#mapTitle').value=localStorage.getItem('oydin-title')||'Bugungi fikrlar';$('#mapTitle').oninput=()=>{$('#saveStatus').textContent='Saqlanmoqda…';clearTimeout(window.st);window.st=setTimeout(save,350)};
$('#zoomIn').onclick=()=>{zoom=Math.min(150,zoom+10);$('#zoom').textContent=zoom+'%';canvas.style.backgroundSize=(21*zoom/100)+'px '+(21*zoom/100)+'px'};$('#zoomOut').onclick=()=>{zoom=Math.max(70,zoom-10);$('#zoom').textContent=zoom+'%';canvas.style.backgroundSize=(21*zoom/100)+'px '+(21*zoom/100)+'px'};
$('#help').onclick=()=>$('#helpDialog').showModal();$('#closeHelp').onclick=()=>$('#helpDialog').close();const minute=()=>$('#minuteDialog').showModal();$('#openMinute').onclick=minute;$('#openMinuteHero').onclick=minute;$('#closeMinute').onclick=()=>$('#minuteDialog').close();window.addEventListener('resize',drawConnections);render();
