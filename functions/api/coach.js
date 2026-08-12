import { guard, json } from '../_lib/guard.js';

const MODEL = 'gemini-2.5-flash-lite';
const MAX_ANSWERS = 4;
const MAX_TEXT = 700;
const QUESTION_SCHEMA = { type:'object', properties:{ question:{type:'string'}, focus:{type:'string',enum:['goal','uncertainty','constraint','motivation','options','fear','next_step','context']}, rationale:{type:'string'} }, required:['question','focus','rationale'], additionalProperties:false };
const FINAL_SCHEMA = { type:'object', properties:{ title:{type:'string'}, summary:{type:'string'}, signal:{type:'string'}, clarity:{type:'string'}, nextStep:{type:'string'}, openQuestion:{type:'string'}, confidence:{type:'number',minimum:0,maximum:1}, themes:{type:'array',items:{type:'string'},minItems:1,maxItems:4}, nodes:{type:'array',minItems:3,maxItems:8,items:{type:'object',properties:{id:{type:'string'},label:{type:'string'},text:{type:'string'},type:{type:'string',enum:['signal','goal','constraint','insight','decision','action','question','concern']},importance:{type:'number',minimum:0,maximum:1}},required:['id','label','text','type','importance'],additionalProperties:false}},edges:{type:'array',maxItems:12,items:{type:'object',properties:{from:{type:'string'},to:{type:'string'},relation:{type:'string',enum:['supports','causes','blocks','leads_to','clarifies','depends_on','contrasts']}},required:['from','to','relation'],additionalProperties:false}}},required:['title','summary','signal','clarity','nextStep','openQuestion','confidence','themes','nodes','edges'],additionalProperties:false };

const cleanAnswers = value => Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(0,MAX_ANSWERS).map(x => x.trim().slice(0,MAX_TEXT)).filter(Boolean) : [];
const normalizeQuestion = q => `${String(q||'').replace(/^\s*[-•\d.)]+\s*/,'').trim().replace(/[.!?]+$/,'')}?`;
async function generate(env,prompt,schema,tokens){
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:.55,maxOutputTokens:tokens,responseMimeType:'application/json',responseSchema:schema}})});
  const raw=await r.text(); let d={}; try{d=JSON.parse(raw)}catch{} if(!r.ok){console.error('Gemini coach:',r.status,raw.slice(0,800));throw Object.assign(new Error('AI provider request failed.'),{status:502})} const text=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim(); if(!text)throw Object.assign(new Error('AI returned an empty response.'),{status:502}); try{return JSON.parse(text)}catch{throw Object.assign(new Error('AI returned invalid structured data.'),{status:502})}
}
export async function onRequestGet(){return json({ok:true,service:'oydin-coach',model:MODEL})}
export async function onRequestPost({request,env}){
  if(!env.GEMINI_API_KEY)return json({error:'AI service is not configured.'},503);
  const checked=await guard(request,env,{maxBytes:10_000}); if(checked.response)return checked.response;
  try{
    const body=await checked.readJson(); const answers=cleanAnswers(body.answers); const step=Math.min(MAX_ANSWERS,Math.max(1,Number(body.step)||1)); const mode=body.mode==='final'?'final':'question';
    if(!answers.length)return json({error:'At least one answer is required.'},400);
    const transcript=answers.map((a,i)=>`JAVOB ${i+1}: ${a}`).join('\n');
    if(mode==='final'){
      const prompt=`Sen Oydin — insonning fikrlarini tartibga soluvchi, qaror va rejalashtirishga yordam beruvchi AI tizimisan. Suhbatni shunchaki xulosa qilma: foydalanuvchining aytganlaridan mantiqiy model tuz. Faqat aytilgan narsaga tayangan holda yoz. Asosiy signal, maqsad, to‘siq, ichki qarama-qarshilik va amaliy keyingi qadamni ajrat. Keyingi qadam juda kichik va bajariladigan bo‘lsin. Bir xil fikrni takrorlama. Yetarli ma'lumot bo‘lmasa openQuestion orqali nimani aniqlash kerakligini ko‘rsat. Psixologik tashxis va ortiqcha motivatsiya yo‘q. O‘zbek tilida yoz.

SUHBAT:
${transcript}`;
      return json({...await generate(env,prompt,FINAL_SCHEMA,700),model:MODEL,usedAI:true});
    }
    const prompt=`Sen Oydin — foydalanuvchining fikrini bosqichma-bosqich aniqlashtiradigan AI suhbatdoshisan. Maqsad: navbatdagi umumiy savol emas, hozirgi noaniqlikni eng ko‘p kamaytiradigan savolni topish.
Bosqich: ${step}/4.
QOIDALAR: barcha javoblarni birga o‘qi; eng so‘nggi javobdagi yangi signalni hisobga ol; oldingi savolni takrorlama; savol konkret vaziyatga mos bo‘lsin; bitta savol, 8–22 so‘z; umumiy “nimasi muhim?” kabi savollarni faqat zarur bo‘lsa ishlat; context → goal → uncertainty/constraint → next step yo‘nalishlarini vaziyatga qarab moslashtir; o‘zbekcha tabiiy yoz.

${transcript}`;
    const result=await generate(env,prompt,QUESTION_SCHEMA,180); return json({question:normalizeQuestion(result.question),focus:result.focus,rationale:result.rationale,model:MODEL,usedAI:true});
  }catch(error){console.error('Oydin coach error:',error);return json({error:error?.status===400?error.message:'AI request failed.'},error?.status||502)}
}
