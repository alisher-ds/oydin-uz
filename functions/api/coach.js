const MODEL = 'gemini-2.5-flash-lite';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function clean(value, max = 700) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: 'AI secret is not configured.' }, 503);
  try {
    const body = await request.json();
    const answers = Array.isArray(body.answers) ? body.answers.filter(x => typeof x === 'string').slice(0, 4).map(x => x.slice(0, 700)) : [];
    const step = Number(body.step || 1);
    const final = body.mode === 'final';
    const context = answers.map((a, i) => `Javob ${i + 1}: ${a}`).join('\n');
    const prompt = final
      ? `Sen Oydin ilovasining yakuniy tahlilchisisan. Suhbatdan asosiy signal va eng kichik amaliy keyingi qadamni aniqlagin. Tashxis yoki umumiy motivatsiya bermagin. O'zbek tilida aynan shu formatda yoz:\nSIGNAL: ...\nKEYINGI QADAM: ...\n\nSuhbat:\n${context}`
      : `Sen Oydin nomli shaxsiy fikrlarni tiniqlashtiruvchi ilovaning suhbatdoshisan. Foydalanuvchi javoblarini tushunib, keyingi BOSHQA savolni ber. Savol qisqa, muloyim, aniq va oldingi javoblarga bevosita mos bo'lsin. Umumiy motivatsion gaplar yoki terapiya tili yo'q. Bu diagnostika emas. Faqat bitta savolni o'zbek tilida qaytar, oxiri ? bilan tugasin. Markdown yoki izoh yozma. Bosqich: ${step}/4\n${context || 'Hali javob yo‘q.'}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: final ? 0.35 : 0.65, maxOutputTokens: final ? 180 : 120 } })
    });
    if (!response.ok) { console.error('Gemini error', response.status, (await response.text()).slice(0, 500)); return json({ error: 'Gemini request failed.' }, 502); }
    const data = await response.json();
    const text = clean(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!text) return json({ error: 'Gemini returned no text.' }, 502);
    return json(final ? { insight: text, model: MODEL } : { question: text.replace(/^\s*[-•\d.)]+\s*/, '').trim(), model: MODEL });
  } catch (error) {
    console.error('Coach API error:', error);
    return json({ error: 'Invalid request.' }, 400);
  }
}
