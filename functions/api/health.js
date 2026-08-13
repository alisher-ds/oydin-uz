import { json } from '../_lib/guard.js';

export async function onRequestGet({ env }) {
  try {
    if (!env.OYDIN_DB) return json({ ok: false, service: 'd1', error: 'binding_missing' }, 503);

    const result = await env.OYDIN_DB.prepare('SELECT 1 AS ok').first();
    if (Number(result?.ok) !== 1) throw new Error('D1 health query failed');

    const tables = await env.OYDIN_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('vaults','spaces') ORDER BY name"
    ).all();
    const names = (tables.results || []).map(row => row.name);
    const ready = names.includes('vaults') && names.includes('spaces');

    return json({
      ok: ready,
      service: 'd1',
      schema: ready ? 'ready' : 'incomplete',
      tables: names,
      checkedAt: new Date().toISOString()
    }, ready ? 200 : 503);
  } catch (error) {
    console.error('Oydin health error:', error);
    return json({ ok: false, service: 'd1', error: 'unavailable' }, 503);
  }
}
