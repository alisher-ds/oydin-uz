/**
 * Anonim statistika.
 *
 * MAQSAD: "nechta odam kirdi va ular nima qildi" degan savolga javob
 * berish — foydalanuvchi haqida hech narsa bilmasdan.
 *
 * NIMA SAQLANADI: faqat `(kun, hodisa, son)`. Ya'ni "2026-08-19 kuni
 * `fikr` hodisasi 14 marta bo'lgan". Boshqa hech narsa.
 *
 * NIMA SAQLANMAYDI va serverga umuman YUBORILMAYDI:
 *  - fikr matni yoki uning bir qismi;
 *  - IP manzil (rate limiting uchun ham faqat kunlik hash ishlatiladi);
 *  - cookie, qurilma identifikatori, brauzer izi;
 *  - sessiya, foydalanuvchi ID, referrer, User-Agent.
 *
 * OQIBATI: ikkita hodisani bitta odamga bog'lash matematik jihatdan
 * mumkin emas — bog'lash uchun kerakli ma'lumot hech qachon mavjud
 * bo'lmagan. "Nechta odam" sanog'i qurilmaning O'ZIDA hisoblanadi:
 * brauzer bugun birinchi marta ochilganini biladi va serverga faqat
 * `tashrif` degan bitta so'zni yuboradi.
 *
 * Hodisa nomlari ataylab YOPIQ ro'yxat: mijoz istagan matnni yubora
 * olmaydi, ya'ni bu endpoint orqali fikr matnini "hodisa nomi" sifatida
 * yashirincha o'tkazib bo'lmaydi.
 */

import { checkLimit, guard, ipBucket, json } from '../_lib/guard.js';
import { ensureSchema } from '../_lib/schema.js';

/**
 * Ruxsat etilgan hodisalar. Bu ro'yxat `assets/js/core/stat.js` dagi
 * `EVENTS` bilan bir xil bo'lishi shart — `tests/unit/stat.test.js`
 * ikkalasini solishtiradi va ajralib ketsa CI qizil bo'ladi.
 */
export const ALLOWED_EVENTS = Object.freeze([
  'tashrif', // qurilma bugun birinchi marta ochdi
  'qaytish', // qurilma ilgari ham kirgan edi (boshqa kuni)
  'sahifa:oydin',
  'sahifa:makon',
  'ornatildi', // bosh ekranga o'rnatildi (PWA)
  'fikr', // makonda yangi karta yaratildi
  'aloqa', // kartalar bog'landi
  'makon', // yangi makon yaratildi
  'tez', // Tez yozish orqali yozib qo'yildi
  'tez:makonga', // yozilgan fikr makonga joylashtirildi
  'recall:korsatildi',
  'recall:qabul',
  'recall:yopildi',
  'ai' // AI suhbatiga savol yuborildi
]);

const ALLOWED = new Set(ALLOWED_EVENTS);

/** Bitta so'rovda nechta hodisa qabul qilinadi. */
const MAX_PER_REQUEST = 20;

const today = () => new Date().toISOString().slice(0, 10);

/** Vaqtga bog'liq bo'lmagan taqqoslash — tokenni belgima-belgi ochib bermaslik uchun. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Kelgan ro'yxatdan faqat tanish hodisalarni ajratadi.
 *
 * Notanish nom XATO emas, shunchaki tashlab yuboriladi: eski mijoz yangi
 * serverga (yoki aksincha) duch kelganda statistika jim ishlashi kerak.
 */
export function normalizeEvents(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  for (const item of input.slice(0, MAX_PER_REQUEST)) {
    if (typeof item === 'string' && ALLOWED.has(item)) seen.add(item);
  }
  return [...seen];
}

export async function onRequestPost({ request, env }) {
  const checked = await guard(request, env, {
    maxBytes: 2_000,
    scope: 'stat',
    limit: 60,
    windowSeconds: 60
  });
  if (checked.response) return checked.response;

  let body;
  try {
    body = await checked.readJson();
  } catch {
    // Statistika hech qachon foydalanuvchiga xato ko'rsatmasligi kerak.
    return new Response(null, { status: 204 });
  }

  const events = normalizeEvents(body?.e);
  if (!events.length) return new Response(null, { status: 204 });

  try {
    if (!env.OYDIN_DB) return new Response(null, { status: 204 });
    await ensureSchema(env);

    const day = today();
    await env.OYDIN_DB.batch(
      events.map(event =>
        env.OYDIN_DB.prepare(
          `INSERT INTO stats (day, event, hits) VALUES (?1, ?2, 1)
           ON CONFLICT(day, event) DO UPDATE SET hits = stats.hits + 1`
        ).bind(day, event)
      )
    );
  } catch (error) {
    console.error('Statistika yozilmadi:', error);
  }

  // Mijozga javob kerak emas — u natijani kutmaydi ham.
  return new Response(null, { status: 204 });
}

/**
 * Statistikani o'qish. Faqat egasi uchun.
 *
 * `STATS_TOKEN` o'rnatilmagan bo'lsa endpoint umuman yo'q (404) — ya'ni
 * tasodifan ochiq qolib ketmaydi:
 *
 *     npx wrangler pages secret put STATS_TOKEN
 *     curl "https://oydin-uz.pages.dev/api/stat?token=..."
 */
export async function onRequestGet({ request, env }) {
  const limited = await checkLimit(env, await ipBucket(request, env, 'stat-read'), 30, 60);
  if (!limited.ok) {
    return json({ error: 'rate_limited' }, 429, { 'retry-after': String(limited.retryAfter) });
  }

  const expected = env?.STATS_TOKEN;
  if (!expected) return json({ error: 'not_found' }, 404);

  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!safeEqual(token, expected)) return json({ error: 'not_found' }, 404);

  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  try {
    if (!env.OYDIN_DB) return json({ error: 'unavailable' }, 503);
    await ensureSchema(env);

    const { results = [] } = await env.OYDIN_DB.prepare(
      'SELECT day, event, hits FROM stats WHERE day >= ? ORDER BY day DESC, event ASC'
    )
      .bind(since)
      .all();

    const byDay = {};
    const total = {};
    for (const row of results) {
      (byDay[row.day] ??= {})[row.event] = Number(row.hits);
      total[row.event] = (total[row.event] ?? 0) + Number(row.hits);
    }

    return json({ since, days, jami: total, kunlar: byDay });
  } catch (error) {
    console.error('Statistika o‘qilmadi:', error);
    return json({ error: 'unavailable' }, 503);
  }
}
