// embed.js — Oydin uchun bepul, backendsiz semantik tahlil yordamchisi.
// Xenova/transformers.js orqali kichik embedding modelini (all-MiniLM-L6-v2)
// to'g'ridan-to'g'ri foydalanuvchi brauzerida ishga tushiradi.
// Hech qanday server, API kalit yoki to'lov kerak emas.
// Birinchi chaqirilganda model (~30MB) yuklanadi va brauzer keshiga saqlanadi;
// keyingi safar bir necha soniyada tayyor bo'ladi.

let embedderPromise = null;

export function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2')
      .then(({ pipeline, env }) => {
        env.allowLocalModels = false; // faqat CDN'dan yuklaymiz, lokal fayl qidirmasin
        return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
      });
  }
  return embedderPromise;
}

// Ikki normallashtirilgan vektor orasidagi cosine similarity = nuqta ko'paytmasi
export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// Matnlar ro'yxatini vektorlarga aylantiradi
export async function embedTexts(extractor, texts) {
  const outputs = await Promise.all(
    texts.map(t => extractor(t, { pooling: 'mean', normalize: true }))
  );
  return outputs.map(o => o.data);
}

// Har bir vektorning "markaziylik" darajasi — boshqalarga o'rtacha qanchalik yaqin.
// Eng yuqori ball — shu mavzu boshqa fikrlar bilan eng ko'p rezonanslashadi degani.
export function centralityScores(vectors) {
  return vectors.map((v, i) =>
    vectors.reduce((sum, v2, j) => (i === j ? sum : sum + dot(v, v2)), 0)
  );
}
