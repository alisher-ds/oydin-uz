import { guard, json } from '../_lib/guard.js';
import { hashToken, now, randomToken, safeId } from '../_lib/vault.js';

const MAX_DATA = 180_000;

function tokenFrom(request, body) {
  return String(request.headers.get('X-Oydin-Vault') || body.token || '').trim();
}

async function findVault(env, token) {
  if (!env.OYDIN_DB) throw Object.assign(new Error('Sync service is not configured.'), { status: 503 });
  if (!/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error('Invalid vault token.'), { status: 401 });
  const tokenHash = await hashToken(token);
  return env.OYDIN_DB.prepare('SELECT id FROM vaults WHERE token_hash = ?').bind(tokenHash).first();
}

async function getOrCreateVault(env, token) {
  const existing = await findVault(env, token);
  if (existing) return existing;

  const id = safeId('vault');
  const time = now();
  try {
    await env.OYDIN_DB.prepare(
      'INSERT INTO vaults (id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(id, await hashToken(token), time, time).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      const raced = await findVault(env, token);
      if (raced) return raced;
    }
    throw error;
  }
  return { id };
}

function decodeRows(rows) {
  return (rows.results || []).map(row => {
    try { return JSON.parse(row.data_json); } catch { return null; }
  }).filter(Boolean);
}

export async function onRequestPost({ request, env }) {
  const checked = await guard(request, env, { maxBytes: MAX_DATA + 12_000 });
  if (checked.response) return checked.response;

  try {
    const body = await checked.readJson();
    let token = tokenFrom(request, body);
    const isNewVault = !token;
    if (!token) token = randomToken();

    const vault = isNewVault
      ? await getOrCreateVault(env, token)
      : await findVault(env, token);

    if (!vault) return json({ error: 'Vault not found.' }, 401);

    const spaces = Array.isArray(body.spaces) ? body.spaces : [];
    if (JSON.stringify(spaces).length > MAX_DATA) return json({ error: 'Sync payload is too large.' }, 413);

    for (const space of spaces.slice(0, 50)) {
      if (!space?.id || typeof space.id !== 'string') continue;
      const data = JSON.stringify(space);
      if (data.length > MAX_DATA / 2) continue;

      await env.OYDIN_DB.prepare(
        `INSERT INTO spaces (id, vault_id, title, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title,
           data_json=excluded.data_json,
           updated_at=excluded.updated_at
         WHERE spaces.vault_id=excluded.vault_id
           AND spaces.updated_at <= excluded.updated_at`
      ).bind(
        space.id,
        vault.id,
        String(space.title || 'Yangi makon').slice(0, 160),
        data,
        String(space.updatedAt || now())
      ).run();
    }

    const time = now();
    await env.OYDIN_DB.prepare('UPDATE vaults SET updated_at = ? WHERE id = ?').bind(time, vault.id).run();
    const rows = await env.OYDIN_DB.prepare(
      'SELECT data_json FROM spaces WHERE vault_id = ? ORDER BY updated_at DESC'
    ).bind(vault.id).all();

    return json({
      ...(isNewVault ? { token } : {}),
      spaces: decodeRows(rows),
      syncedAt: time
    });
  } catch (error) {
    console.error('Oydin sync error:', error);
    return json(
      { error: error?.status === 400 || error?.status === 401 || error?.status === 413 ? error.message : 'Sync failed.' },
      error?.status || 502
    );
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const token = String(request.headers.get('X-Oydin-Vault') || '').trim();
    const vault = await findVault(env, token);
    if (!vault) return json({ error: 'Vault not found.' }, 404);

    const rows = await env.OYDIN_DB.prepare(
      'SELECT data_json FROM spaces WHERE vault_id = ? ORDER BY updated_at DESC'
    ).bind(vault.id).all();

    return json({ spaces: decodeRows(rows) });
  } catch (error) {
    return json({ error: error?.status === 401 ? error.message : 'Sync service unavailable.' }, error?.status || 503);
  }
}
