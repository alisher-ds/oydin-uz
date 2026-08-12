const MODEL = 'gemini-2.5-flash-lite';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function clean(value, max = 700) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function ask(env, prompt, maxOutputTokens) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.65, maxOutputTokens } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { console.error('Gemini error', response.status, JSON.stringify(data).slice(0, 700)); throw new Error(`Gemini ${response.status}`); }
  return clean(data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join(' '));
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: 'AI secret is not configured.' }, 503);
  try {
    const body = await request.json();
    const answers = Array.isArray(body.answers) ? body.answers.filter(x => typeof x === 'string').slice(0, 4).map(x => x.slice(0, 700)) : [];
    const step = Math.min(4, Math.max(1, Number(body.step) || 1));
    const final = body.mode === 'final';
    const context = answers.map((a, i) => `Javob ${i + 1}: ${a}`).join('\n');
    const prompt = final
      ? `Sen Oydin ilovasining yakuniy tahlilchisisan. Quyidagi 4 javobdan foydalanuvchining asosiy signalini va bugun qilsa bo‘ladigan eng kichik amaliy qadamni top. Tashxis, terapiya yoki umumiy motivatsiya bermagin. O‘zbek tilida aynan 3 qatorda yoz:\nSIGNAL: <asosiy mavzu/muammo>\nANIQLIK: <nimani anglash mumkin>\nKEYINGI QADAM: <bitta kichik amaliy qadam>\n\nSuhbat:\n${context}`
      : `Sen Oydin nomli shaxsiy fikrlarni tiniqlashtiruvchi ilovaning suhbatdoshisan. Foydalanuvchi javoblarini tushunib, keyingi BOSHQA savolni ber. Savol qisqa, muloyim, aniq va oldingi javoblarga bevosita mos bo‘lsin. Oldingi javobda aytilmagan muhim jihatni ochishga harakat qil. Umumiy motivatsion gaplar yoki terapiya tili yo‘q. Bu diagnostika emas. Faqat bitta savolni o‘zbek tilida qaytar, oxiri ? bilan tugasin. Markdown yoki izoh yozma. Bosqich: ${step}/4\n${context || 'Hali javob yo‘q.'}`;
    const text = await ask(env, prompt, final ? 180 : 120);
    if (!text) return json({ error: 'Gemini returned no text.' }, 502);
    return json(final ? { insight: text, model: MODEL } : { question: text.replace(/^\s*[-•\d.)]+\s*/, '').trim().replace(/[.!]+$/, '') + '?', model: MODEL });
  } catch (error) {
    console.error('Coach API error:', error);
    return json({ error: 'Gemini request failed.' }, 502);
  }
}
