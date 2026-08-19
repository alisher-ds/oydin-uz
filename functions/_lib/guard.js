/**
 * Barcha API endpointlari uchun umumiy himoya qatlami.
 *
 * Tuzatilgan kamchiliklar:
 *  - rate limiting endi D1 da, ya'ni HAQIQATAN global. Ilgari u Worker
 *    izolyatining xotirasidagi `Map` edi: Cloudflare'da har bir izolyat va
 *    har bir colo o'z nusxasiga ega bo'lgani uchun cheklov amalda ishlamasdi.
 *    `wrangler.toml` da esa `OYDIN_RATE_LIMITER` binding'i umuman yo'q edi,
 *    ya'ni har doim shu ishlamaydigan zaxira yo'l ishlatilardi;
 *  - har endpoint o'z limitiga ega — sinxronizatsiya AI so'rovlarini yeb
 *    qo'ymaydi;
 *  - `Origin` sarlavhasi yo'q bo'lsa, faqat brauzerdan kelmagan so'rovlarga
 *    ruxsat beriladi (`Sec-Fetch-Site` tekshiriladi).
 */

/** Xotiradagi zaxira — D1 mavjud bo'lmaganda oxirgi chora. */
const memoryBuckets = new Map();
const MEMORY_LIMIT = 2000;

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...extra
    }
  });
}

export function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * Rate limiting uchun IP'ning qaytarib bo'lmaydigan izi.
 *
 * Ilgari `rate_limits.bucket` ustunida OCHIQ IP manzil turardi
 * (`ip:1.2.3.4:chat`). Bu Oydin'ning asosiy va'dasiga — server hech
 * qanday shaxsiy ma'lumot saqlamasligiga — zid edi.
 *
 * Endi u yerda SHA-256 izining bir qismi turadi. Iz kunlik tuz bilan
 * hisoblanadi, ya'ni bugungi va kechagi izni bir-biriga bog'lab
 * bo'lmaydi. IPv4 fazosi kichik (2^32) bo'lgani uchun tuzsiz hash
 * qaytariladigan bo'lardi — shuning uchun `IP_SALT` maxfiysini
 * o'rnatish tavsiya etiladi:
 *
 *     npx wrangler pages secret put IP_SALT
 *
 * U o'rnatilmasa ham kunlik aylanish va `rate_limits` ning tez
 * tozalanishi (4 oyna) ta'sirni juda kichik qoldiradi.
 */
export async function ipBucket(request, env, scope) {
  const ip = clientIp(request);
  const day = new Date().toISOString().slice(0, 10);
  const material = `${env?.IP_SALT ?? 'oydin'}|${day}|${ip}`;

  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
    const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
    return `ip:${hex}:${scope}`;
  } catch {
    // WebCrypto yo'q bo'lsa cheklov baribir ishlashi kerak.
    return `ip:${ip}:${scope}`;
  }
}

/**
 * Cross-site so'rovlarni rad etadi.
 *
 * `Origin` yo'q bo'lishi ikki xil holatni anglatishi mumkin: (a) brauzerdan
 * kelmagan so'rov (curl, mobil ilova) — bu normal, chunki kredensial
 * cookie emas, balki vault tokeni; (b) eski brauzerdan kelgan same-origin
 * so'rov. `Sec-Fetch-Site` ikkalasini ajratib beradi.
 */
function isAllowedOrigin(request) {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return false;

  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function memoryLimit(bucket, limit, windowSeconds, count = true) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const previous = memoryBuckets.get(bucket);

  if (!count) {
    const active = previous && now - previous.started < windowMs;
    return {
      ok: !active || previous.count < limit,
      retryAfter: active
        ? Math.max(1, Math.ceil((windowMs - (now - previous.started)) / 1000))
        : windowSeconds
    };
  }

  if (!previous || now - previous.started >= windowMs) {
    memoryBuckets.set(bucket, { started: now, count: 1 });
    if (memoryBuckets.size > MEMORY_LIMIT) {
      for (const [key, value] of memoryBuckets) {
        if (now - value.started >= windowMs) memoryBuckets.delete(key);
      }
    }
    return { ok: true, retryAfter: windowSeconds };
  }
  previous.count += 1;
  return {
    ok: previous.count <= limit,
    retryAfter: Math.max(1, Math.ceil((windowMs - (now - previous.started)) / 1000))
  };
}

/**
 * D1 ga tayangan atomik hisoblagich.
 * Bitta `INSERT ... ON CONFLICT ... RETURNING` — bitta murojaat.
 */
async function databaseLimit(db, bucket, limit, windowSeconds, count) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - (nowSeconds % windowSeconds);

  if (!count) {
    // "Peek": hisoblagichni oshirmasdan o'qiymiz.
    const current = await db
      .prepare('SELECT hits, window_start FROM rate_limits WHERE bucket = ?')
      .bind(bucket)
      .first();
    const hits = Number(current?.window_start) === windowStart ? Number(current.hits) : 0;
    return { ok: hits < limit, retryAfter: Math.max(1, windowStart + windowSeconds - nowSeconds) };
  }

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, window_start, hits)
       VALUES (?1, ?2, 1)
       ON CONFLICT(bucket) DO UPDATE SET
         hits = CASE WHEN rate_limits.window_start = ?2 THEN rate_limits.hits + 1 ELSE 1 END,
         window_start = ?2
       RETURNING hits`
    )
    .bind(bucket, windowStart)
    .first();

  const hits = Number(row?.hits ?? 1);
  return {
    ok: hits <= limit,
    retryAfter: Math.max(1, windowStart + windowSeconds - nowSeconds)
  };
}

/** Eski qatorlarni vaqti-vaqti bilan tozalaydi (har ~1% so'rovda). */
async function sweep(db, windowSeconds) {
  if (Math.random() > 0.01) return;
  const cutoff = Math.floor(Date.now() / 1000) - windowSeconds * 4;
  try {
    await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(cutoff).run();
  } catch (error) {
    console.warn('rate_limits tozalanmadi:', error);
  }
}

/**
 * Bitta bucket bo'yicha cheklovni tekshiradi.
 *
 * @param {{count?: boolean}} options `count: false` — hisoblagichni
 *   OSHIRMASDAN tekshiradi. Bu muvaffaqiyatsiz urinishlar kvotani yeb
 *   qo'yishining oldini oladi: ilgari server xatosi tufayli tushgan besh
 *   urinish foydalanuvchini bir soatga bloklab qo'yardi.
 * @returns {Promise<{ok: boolean, retryAfter: number}>}
 */
export async function checkLimit(env, bucket, limit, windowSeconds, options = {}) {
  const count = options.count !== false;
  // Cloudflare'ning tabiiy rate limiter binding'i mavjud bo'lsa — u afzal.
  if (count && env?.OYDIN_RATE_LIMITER?.limit) {
    try {
      const result = await env.OYDIN_RATE_LIMITER.limit({ key: bucket });
      return { ok: Boolean(result.success), retryAfter: windowSeconds };
    } catch (error) {
      console.warn('Native rate limiter ishlamadi, D1 ga o‘tamiz:', error);
    }
  }
  if (env?.OYDIN_DB) {
    try {
      const result = await databaseLimit(env.OYDIN_DB, bucket, limit, windowSeconds, count);
      if (count) await sweep(env.OYDIN_DB, windowSeconds);
      return result;
    } catch (error) {
      console.error('D1 rate limiter ishlamadi:', error);
    }
  }
  return memoryLimit(bucket, limit, windowSeconds, count);
}

/**
 * Umumiy so'rov tekshiruvi.
 *
 * @param {Request} request
 * @param {object} env
 * @param {{
 *   maxBytes?: number,
 *   scope?: string,
 *   limit?: number,
 *   windowSeconds?: number,
 *   methods?: string[]
 * }} options
 */
export async function guard(request, env, options = {}) {
  const {
    maxBytes = 20_000,
    scope = 'api',
    limit = 30,
    windowSeconds = 60,
    methods = ['POST']
  } = options;

  if (!methods.includes(request.method)) {
    return { response: json({ error: 'Method not allowed.' }, 405, { allow: methods.join(', ') }) };
  }
  if (!isAllowedOrigin(request)) {
    return { response: json({ error: 'Origin not allowed.' }, 403) };
  }

  if (request.method !== 'GET') {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return { response: json({ error: 'JSON body required.' }, 415) };
    }
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > maxBytes) {
      return { response: json({ error: 'Request is too large.' }, 413) };
    }
  }

  const result = await checkLimit(env, await ipBucket(request, env, scope), limit, windowSeconds);
  if (!result.ok) {
    return {
      response: json({ error: 'Too many requests. Please try again shortly.' }, 429, {
        'retry-after': String(result.retryAfter)
      })
    };
  }

  // DIQQAT: bu yerdan `ip` ATAYLAB qaytarilmaydi. Ilgari qaytarilardi va
  // hech kim ishlatmasdi — lekin mavjud bo'lgani uchun uni tasodifan
  // log'ga yoki bazaga yozib qo'yish oson edi.
  return {
    readJson: async () => {
      const text = await request.text();
      // Content-Length yo'q bo'lishi mumkin (chunked) — haqiqiy hajmni ham tekshiramiz.
      if (new TextEncoder().encode(text).byteLength > maxBytes) {
        throw Object.assign(new Error('Request is too large.'), { status: 413 });
      }
      try {
        return JSON.parse(text);
      } catch {
        throw Object.assign(new Error('Invalid JSON.'), { status: 400 });
      }
    }
  };
}
