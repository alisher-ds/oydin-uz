const MODEL = 'gemini-2.5-flash-lite';
const MAX_ANSWERS = 4;
const MAX_TEXT = 700;

const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string', description: 'Bitta qisqa, tabiiy, o‘zbekcha savol. Oxiri ? bilan tugasin.' },
    focus: { type: 'string', enum: ['goal', 'uncertainty', 'constraint', 'motivation', 'options', 'fear', 'next_step', 'context'] },
    rationale: { type: 'string', description: 'Savol nimani aniqlashtirishi haqida juda qisqa ichki izoh.' }
  },
  required: ['question', 'focus', 'rationale'],
  additionalProperties: false
};

const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    signal: { type: 'string' },
    clarity: { type: 'string' },
    nextStep: { type: 'string' },
    openQuestion: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    themes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
    nodes: {
      type: 'array', minItems: 3, maxItems: 8,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          text: { type: 'string' },
          type: { type: 'string', enum: ['signal', 'goal', 'constraint', 'insight', 'decision', 'action', 'question', 'concern'] },
          importance: { type: 'number', minimum: 0, maximum: 1 }
        },
        required: ['id', 'label', 'text', 'type', 'importance'],
        additionalProperties: false
      }
    },
    edges: {
      type: 'array', maxItems: 12,
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          relation: { type: 'string', enum: ['supports', 'causes', 'blocks', 'leads_to', 'clarifies', 'depends_on', 'contrasts'] }
        },
        required: ['from', 'to', 'relation'],
        additionalProperties: false
      }
    }
  },
  required: ['title', 'summary', 'signal', 'clarity', 'nextStep', 'openQuestion', 'confidence', 'themes', 'nodes', 'edges'],
  additionalProperties: false
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function cleanAnswers(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(x => typeof x === 'string').slice(0, MAX_ANSWERS).map(x => x.trim().slice(0, MAX_TEXT)).filter(Boolean);
}

function normalizeQuestion(q) {
  return String(q || '').replace(/^\s*[-•\d.)]+\s*/, '').trim().replace(/[.!]+$/, '') + '?';
}

async function generate(env, prompt, schema, tokens = 500) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.55,
        maxOutputTokens: tokens,
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    })
  });

  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  if (!response.ok) {
    console.error('Gemini HTTP', response.status, raw.slice(0, 1200));
    throw new Error(`Gemini ${response.status}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned empty content');
  try { return JSON.parse(text); } catch (e) { console.error('Gemini JSON parse error', text.slice(0, 1200)); throw e; }
}

export async function onRequestGet({ env }) {
  return json({ ok: true, service: 'oydin-coach', model: MODEL, secretConfigured: Boolean(env.GEMINI_API_KEY) });
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: 'AI secret is not configured.' }, 503);

  try {
    const body = await request.json();
    const answers = cleanAnswers(body.answers);
    const step = Math.min(MAX_ANSWERS, Math.max(1, Number(body.step) || 1));
    const mode = body.mode === 'final' ? 'final' : 'question';

    if (!answers.length) return json({ error: 'At least one answer is required.' }, 400);

    const transcript = answers.map((a, i) => `JAVOB ${i + 1}: ${a}`).join('\n');

    if (mode === 'final') {
      const prompt = `Sen Oydin — insonning fikrlarini tartibga soluvchi, qaror va rejalashtirishga yordam beruvchi AI tizimisan.
Bu suhbatni shunchaki “xulosa” qilma. Foydalanuvchining fikrlaridan MANTIQIY MODEL tuz.

QOIDALAR:
- Faqat foydalanuvchi aytgan narsaga tayangan holda xulosa qil; taxminni fakt sifatida yozma.
- Asosiy signalni, maqsadni, to‘siqni, ichki qarama-qarshilikni va amaliy keyingi qadamni ajrat.
- “Keyingi qadam” juda kichik va bajariladigan bo‘lsin.
- nodes ichidagi matnlar foydalanuvchi uchun foydali bo‘lsin; bir xil fikrni takrorlama.
- edges faqat haqiqiy mantiqiy aloqani ifodalasın.
- Agar ma'lumot yetarli bo‘lmasa, openQuestion orqali aynan nimani aniqlash kerakligini ko‘rsat.
- Psixologik tashxis, terapiya yoki ortiqcha motivatsion gaplar yo‘q.
- O‘zbek tilida yoz.

SUHBAT:
${transcript}`;
      const result = await generate(env, prompt, FINAL_SCHEMA, 700);
      return json({ ...result, model: MODEL, usedAI: true });
    }

    const prompt = `Sen Oydin — foydalanuvchining fikrini bosqichma-bosqich aniqlashtiradigan AI suhbatdoshisan.
Maqsad: shunchaki navbatdagi umumiy savol berish emas, balki hozirgi noaniqlikni kamaytiradigan ENG QIMMATLI keyingi savolni topish.

Suhbat bosqichi: ${step}/4

QOIDALAR:
1. Barcha oldingi javoblarni birga o‘qi.
2. Eng so‘nggi javobdagi yangi signalni hisobga ol.
3. Oldin berilgan savol yoki allaqachon aniq aytilgan narsani takrorlama.
4. Savol foydalanuvchining konkret so‘zlari va vaziyatiga mos bo‘lsin.
5. Savol bitta bo‘lsin, 8–22 so‘z atrofida bo‘lsin.
6. Savol variantlar orasidan tanlashni majburlamasin; kerak bo‘lsa 2–3 misol keltirishi mumkin.
7. Maqsadga qarab navbat bilan context → goal → uncertainty/constraint → next step kabi chuqurlikni oshir, lekin suhbat mazmuniga qarab moslash.
8. “Bu fikr siz uchun nimasi bilan muhim?”, “Qaysi tomoni og‘ir?”, “Nimaga erishmoqchisiz?” kabi umumiy savollarni faqat javobdan kelib chiqib haqiqatan kerak bo‘lsa ishlat.
9. O‘zbek tilida tabiiy, insoniy yoz. Tashxis yoki terapiya tili yo‘q.

${transcript}`;

    const result = await generate(env, prompt, QUESTION_SCHEMA, 180);
    return json({ question: normalizeQuestion(result.question), focus: result.focus, rationale: result.rationale, model: MODEL, usedAI: true });
  } catch (error) {
    console.error('Oydin coach error:', error);
    return json({ error: 'AI request failed.', detail: String(error?.message || error) }, 502);
  }
}
