/**
 * Xizmat holati.
 *
 * Endi cheklovga ega va jadval nomlarini oshkor qilmaydi — ilgari har bir
 * autentifikatsiyasiz so'rov bepul DB so'rovini yuzaga keltirardi.
 */

import { checkLimit, clientIp, json } from '../_lib/guard.js';
import { ensureSchema } from '../_lib/schema.js';

export async function onRequestGet({ request, env }) {
  const limited = await checkLimit(env, `ip:${clientIp(request)}:health`, 60, 60);
  if (!limited.ok) {
    return json({ ok: false, error: 'rate_limited' }, 429, {
      'retry-after': String(limited.retryAfter)
    });
  }

  try {
    if (!env.OYDIN_DB) return json({ ok: false, service: 'd1', error: 'binding_missing' }, 503);

    // Jadvallar yo'q bo'lsa shu yerda yaratiladi.
    await ensureSchema(env);

    const result = await env.OYDIN_DB.prepare('SELECT 1 AS ok').first();
    if (Number(result?.ok) !== 1) throw new Error('D1 health query failed');

    const tables = await env.OYDIN_DB.prepare(
      `SELECT COUNT(*) AS found FROM sqlite_master
       WHERE type = 'table' AND name IN ('vaults', 'spaces', 'space_deletions', 'rate_limits')`
    ).first();

    const ready = Number(tables?.found ?? 0) === 4;
    return json(
      {
        ok: ready,
        service: 'd1',
        schema: ready ? 'ready' : 'incomplete',
        checkedAt: new Date().toISOString()
      },
      ready ? 200 : 503
    );
  } catch (error) {
    console.error('Oydin health error:', error);
    return json({ ok: false, service: 'd1', error: 'unavailable' }, 503);
  }
}
