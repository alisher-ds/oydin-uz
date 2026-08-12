const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const buckets = new Map();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra
    }
  });
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    const url = new URL(request.url);
    return origin === url.origin;
  } catch {
    return false;
  }
}

function fallbackLimit(key) {
  const now = Date.now();
  const previous = buckets.get(key);
  if (!previous || now - previous.started >= WINDOW_MS) {
    buckets.set(key, { started: now, count: 1 });
    if (buckets.size > 2000) {
      for (const [k, v] of buckets) if (now - v.started >= WINDOW_MS) buckets.delete(k);
    }
    return { ok: true, retryAfter: 60 };
  }
  previous.count += 1;
  return { ok: previous.count <= MAX_REQUESTS, retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - previous.started)) / 1000)) };
}

export async function guard(request, env, options = {}) {
  const maxBytes = options.maxBytes ?? 20_000;
  if (request.method !== 'POST') return { response: json({ error: 'Method not allowed.' }, 405, { allow: 'POST' }) };
  if (!sameOrigin(request)) return { response: json({ error: 'Origin not allowed.' }, 403) };
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return { response: json({ error: 'JSON body required.' }, 415) };
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) return { response: json({ error: 'Request is too large.' }, 413) };

  const ip = clientIp(request);
  let limited = null;
  if (env?.OYDIN_RATE_LIMITER?.limit) {
    try { limited = await env.OYDIN_RATE_LIMITER.limit({ key: `oydin:${ip}` }); } catch (e) { console.error('Rate limiter unavailable:', e); }
  }
  const result = limited ? { ok: Boolean(limited.success), retryAfter: 60 } : fallbackLimit(`ip:${ip}`);
  if (!result.ok) return { response: json({ error: 'Too many requests. Please try again shortly.' }, 429, { 'retry-after': String(result.retryAfter) }) };

  return { ip, readJson: async () => {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    try { return JSON.parse(text); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
  } };
}

export { json };
