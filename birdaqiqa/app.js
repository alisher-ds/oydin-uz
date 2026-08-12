const $=s=>document.querySelector(s),sample=`Portfolio qilishim kerak, lekin nimadan boshlashni bilmayman. Universitetga hujjat topshirish yaqin. Vaqt yetmayotgandek. GitHub’ni ham o‘rganishim kerak. ertaga dars bor edi, vazifasini qilishim kerak. yangi yoqtirgan podacstim chiqibdi, uni koraman`;
let left=60,clock,started=false;
function show(id){document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));$(id).classList.add('active')}
function start(){show('#write');$('#dump').value='';$('#count').textContent=0;left=60;$('#timer').textContent='01:00';started=true;$('#dump').focus();clock=setInterval(()=>{left--;$('#timer').textContent=`00:${String(left).padStart(2,'0')}`;if(left<=0)reveal()},1000)}
function words(t){return t.trim().split(/\s+/).filter(Boolean).length}$('#begin').onclick=start;$('#dump').oninput=e=>$('#count').textContent=words(e.target.value);$('#finish').onclick=reveal;
async function reveal(){
  if(!started)return;started=false;clearInterval(clock);
  const text=$('#dump').value.trim()||sample;
  const lines=text.split(/[.!?]+/).map(x=>x.trim()).filter(Boolean).slice(0,6);
  show('#reveal');
  const box=$('#constellation');
  box.innerHTML='<p class="loading">Fikrlar orasidagi bog‘liqlikni topyapmiz…</p>';
  const positions=[[10,25],[36,4],[70,23],[13,68],[49,61],[77,70]];
  let centralIndex=Math.min(4,lines.length-1),relatedCount=0,usedFallback=false;
  try{
    const {getEmbedder,embedTexts,dot}=await import('../embed.js');
    const extractor=await getEmbedder();
    const vectors=await embedTexts(extractor,lines);
    const scores=vectors.map((v,i)=>vectors.reduce((s,v2,j)=>i===j?s:s+dot(v,v2),0));
    centralIndex=scores.indexOf(Math.max(...scores));
    relatedCount=vectors.filter((v,i)=>i!==centralIndex&&dot(v,vectors[centralIndex])>0.45).length;
  }catch(err){
    console.error('Semantik tahlil ishlamadi, oddiy usulga o‘tildi:',err);
    usedFallback=true;
  }
  box.innerHTML='';
  lines.forEach((line,i)=>{let n=document.createElement('div');n.className='node '+(i===centralIndex?'major':'');n.style.left=positions[i][0]+'%';n.style.top=positions[i][1]+'%';n.style.animationDelay=(i*.12)+'s';n.textContent=line;box.append(n)});
  const central=lines[centralIndex]||lines[0]||'';
  $('#signalTitle').textContent=central.length>70?central.slice(0,67)+'…':central;
  $('#signalBody').textContent=usedFallback
    ?'Sizda katta rejalardan ko‘ra yaqin muddatli ochiq ishlar ko‘proq shovqin beryapti. Faqat boshlashning o‘zi bosimni pasaytiradi.'
    :relatedCount>0
      ?`${relatedCount} ta boshqa fikringiz ham shu mavzu atrofida aylanyapti — demak bu hozir boshingizda eng ko‘p joy egallagan narsa.`
      :'Bu fikr boshqalardan ajralib turibdi — ehtimol shuni birinchi bo‘lib hal qilish yengillik beradi.';
  show('#reveal');
}
$('#again').onclick=start;
