import { guard, json } from '../_lib/guard.js';

const MODEL = 'gemini-2.5-flash-lite';
const schema = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    nodes: { type: 'array', maxItems: 6, items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, text: { type: 'string' }, type: { type: 'string' }, importance: { type: 'number' } }, required: ['id','label','text','type','importance'], additionalProperties: false } },
    edges: { type: 'array', maxItems: 8, items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, relation: { type: 'string' } }, required: ['from','to','relation'], additionalProperties: false } }
  },
  required: ['reply','nodes','edges'],
  additionalProperties: false
};

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: 'AI service is not configured.' }, 503);
  const checked = await guard(request, env, { maxBytes: 28_000 });
  if (checked.response) return checked.response;
  try {
    const body = await checked.readJson();
    const messages = Array.isArray(body.messages)
      ? body.messages.slice(-16).filter(x => x && typeof x.text === 'string').map(x => `${x.role === 'assistant' ? 'OYDIN' : 'FOYDALANUVCHI'}: ${x.text.slice(0, 1800)}`).join('\n')
      : '';
    if (!messages) return json({ error: 'At least one message is required.' }, 400);
    const prompt = `Sen Oydin — inson bilan tabiiy fikrlash suhbati olib boradigan AI hamrohisan. Oydin ChatGPT kloni emas. Avval tingla, keyin fikrni tushun. Har bir xabarga savol berish shart emas. Ba'zida aks ettir, ba'zida fikrni rivojlantir, ba'zida qarama-qarshilikni muloyim ko‘rsat, ba'zida aniq reja ber. Foydalanuvchi nima istayotganini aytmagan bo‘lsa, uni majburlama. Javob tabiiy, qisqa-o‘rta uzunlikda va o‘zbek tilida bo‘lsin. Psixologik tashxis yoki ortiqcha motivatsiya bermagin.

Ichki maqsad: faqat muhim va ishonchli fikrlarni thinking graph sifatida ajrat. Har bir oddiy gapni node qilma. Faqat yangi yoki muhim signal, maqsad, to‘siq, qaror, insight yoki actionni qo‘sh. Edges faqat real mantiqiy aloqani ko‘rsatsin. Oldingi node bilan bir xil narsani qayta yaratma.

SUHBAT:
${messages}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: .7, maxOutputTokens: 650, responseMimeType: 'application/json', responseSchema: schema } })
    });
    const raw = await response.text(); let data = {};
    try { data = JSON.parse(raw); } catch {}
    if (!response.ok) { console.error('Gemini chat:', response.status, raw.slice(0, 800)); return json({ error: 'AI provider request failed.' }, 502); }
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!text) return json({ error: 'AI returned an empty response.' }, 502);
    let result; try { result = JSON.parse(text); } catch { return json({ error: 'AI returned invalid structured data.' }, 502); }
    return json({ ...result, model: MODEL, usedAI: true });
  } catch (error) {
    console.error('Oydin chat error:', error);
    return json({ error: error?.status === 400 ? error.message : 'AI request failed.' }, error?.status || 502);
  }
}
