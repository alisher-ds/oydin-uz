/**
 * Brauzerda ishlaydigan semantik tahlil — server, API kaliti yoki to'lovsiz.
 *
 * Model (~30 MB) birinchi chaqiruvda CDN'dan yuklanadi va brauzer keshida
 * qoladi. Matn qurilmadan chiqmaydi — faqat model qurilmaga keladi.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
const MODEL = 'Xenova/all-MiniLM-L6-v2';

let embedderPromise = null;

export function getEmbedder() {
  embedderPromise ??= import(/* @vite-ignore */ CDN).then(({ pipeline, env }) => {
    env.allowLocalModels = false;
    return pipeline('feature-extraction', MODEL, { quantized: true });
  });
  return embedderPromise;
}

/** Normallashtirilgan vektorlar uchun kosinus o'xshashligi = skalyar ko'paytma. */
export function dot(a, b) {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) sum += a[i] * b[i];
  return sum;
}

/** Matnlarni vektorlarga aylantiradi. */
export async function embedTexts(extractor, texts) {
  const outputs = await Promise.all(
    texts.map(text => extractor(text, { pooling: 'mean', normalize: true }))
  );
  return outputs.map(output => output.data);
}

/**
 * Har bir vektorning "markaziylik" darajasi — boshqalarga o'rtacha yaqinligi.
 * Eng yuqori ball: shu mavzu qolganlari bilan eng ko'p rezonanslashadi.
 */
export function centralityScores(vectors) {
  return vectors.map((vector, i) =>
    vectors.reduce((sum, other, j) => (i === j ? sum : sum + dot(vector, other)), 0)
  );
}

/** Eng markaziy element indeksi. */
export function mostCentralIndex(vectors) {
  if (!vectors.length) return 0;
  const scores = centralityScores(vectors);
  return scores.indexOf(Math.max(...scores));
}
