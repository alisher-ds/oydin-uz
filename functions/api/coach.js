const MODEL = 'gemini-2.5-flash-lite';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function cleanQuestion(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/^\s*[-•\d.)]+\s*/, '').trim().slice(0, 300);
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: 'AI secret is not configured.' }, 503);

  try {
    const body = await request.json();
    const answers = Array.isArray(body.answers) ? body.answers.filter(x => typeof x === 'string').slice(0, 3) : [];
    const step = Number(body.step || 1);

    const context = answers.map((a, i) => `Javob ${i + 1}: ${a.slice(0, 700)}`).join('\n');
    const prompt = `Sen Oydin nomli shaxsiy fikrlarni tiniqlashtiruvchi ilovaning suhbatdoshisan.
Vazifa: foydalanuvchining javoblarini tushunib, keyingi BOSHQA savolni ber. Savol muloyim, qisqa, aniq va oldingi javobga bevosita mos bo'lsin. Umumiy motivatsion gaplar, terapiya tili yoki mavzudan chetga chiqish yo'q.
Bu diagnostika emas. Faqat fikrni aniqlashtirishga yordam ber.

Suhbat bosqichi: ${step}/4
${context || 'Hali javob yo‘q.'}

Faqat bitta savolni o'zbek tilida qaytar. Savol oxirida ? bo'lsin. Markdown, izoh yoki qo'shimcha matn yozma.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.65, maxOutputTokens: 120 },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Gemini error:', response.status, detail.slice(0, 500));
      return json({ error: 'Gemini request failed.' }, 502);
    }

    const data = await response.json();
    const text = cleanQuestion(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    if (!text) return json({ error: 'Gemini returned no question.' }, 502);

    return json({ question: text, model: MODEL });
  } catch (error) {
    console.error('Coach API error:', error);
    return json({ error: 'Invalid request.' }, 400);
  }
}
