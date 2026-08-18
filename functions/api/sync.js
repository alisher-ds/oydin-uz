/**
 * Makonlarni qurilmalararo sinxronlash.
 *
 * Tuzatilgan kamchiliklar:
 *  - o'chirish tombstone'lari qo'llab-quvvatlanadi: bir qurilmada o'chirilgan
 *    makon endi boshqasidan qaytib kelmaydi;
 *  - yozuvlar `batch()` orqali bitta murojaatda ketadi (ilgari 50 tagacha
 *    ketma-ket `await` bor edi);
 *  - mijoz bergan `updatedAt` tekshiriladi va server vaqtiga qisqartiriladi;
 *  - vault yaratish alohida, qattiqroq cheklovga ega — ilgari har bir bo'sh
 *    so'rov yangi D1 qatorini yaratardi.
 */

import { checkLimit, clientIp, guard, json } from '../_lib/guard.js';
import {
  hashToken,
  isValidToken,
  normalizeTimestamp,
  now,
  randomToken,
  safeId
} from '../_lib/vault.js';

const MAX_PAYLOAD = 180_000;
const MAX_SPACE_BYTES = 90_000;
const MAX_SPACES = 50;
const MAX_DELETIONS = 200;

/** Yangi vault yaratish: soatiga 5 ta IP uchun. */
const VAULT_CREATE_LIMIT = 5;
const VAULT_CREATE_WINDOW = 3600;

const tokenFrom = request =>
  String(request.headers.get('X-Oydin-Vault') ?? '')
    .trim()
    .toLowerCase();

async function findVault(env, token) {
  if (!env.OYDIN_DB)
    throw Object.assign(new Error('Sync service is not configured.'), { status: 503 });
  if (!isValidToken(token)) throw Object.assign(new Error('Invalid vault token.'), { status: 401 });
  return env.OYDIN_DB.prepare('SELECT id FROM vaults WHERE token_hash = ?')
    .bind(await hashToken(token))
    .first();
}

async function createVault(env, token) {
  const id = safeId('vault');
  const time = now();
  try {
    await env.OYDIN_DB.prepare(
      'INSERT INTO vaults (id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?)'
    )
      .bind(id, await hashToken(token), time, time)
      .run();
  } catch (error) {
    if (
      String(error?.message ?? '')
        .toLowerCase()
        .includes('unique')
    ) {
      const raced = await findVault(env, token);
      if (raced) return raced;
    }
    throw error;
  }
  return { id };
}

const decodeSpaces = rows =>
  (rows.results ?? [])
    .map(row => {
      try {
        return JSON.parse(row.data_json);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

async function readVaultState(env, vaultId) {
  const [spaceRows, deletionRows] = await env.OYDIN_DB.batch([
    env.OYDIN_DB.prepare(
      'SELECT data_json FROM spaces WHERE vault_id = ? ORDER BY updated_at DESC LIMIT ?'
    ).bind(vaultId, MAX_SPACES),
    env.OYDIN_DB.prepare(
      'SELECT space_id, deleted_at FROM space_deletions WHERE vault_id = ? ORDER BY deleted_at DESC LIMIT ?'
    ).bind(vaultId, MAX_DELETIONS)
  ]);

  const deleted = {};
  for (const row of deletionRows.results ?? []) deleted[row.space_id] = row.deleted_at;
  return { spaces: decodeSpaces(spaceRows), deleted };
}

export async function onRequestPost({ request, env }) {
  const checked = await guard(request, env, {
    maxBytes: MAX_PAYLOAD + 12_000,
    scope: 'sync',
    limit: 60,
    windowSeconds: 60
  });
  if (checked.response) return checked.response;

  try {
    const body = await checked.readJson();
    const token = tokenFrom(request);
    const isNewVault = !token;

    let vault;
    let issuedToken = null;

    if (isNewVault) {
      // Vault yaratish — alohida va qattiqroq cheklov ostida.
      const created = await checkLimit(
        env,
        `ip:${clientIp(request)}:vault-create`,
        VAULT_CREATE_LIMIT,
        VAULT_CREATE_WINDOW
      );
      if (!created.ok) {
        return json({ error: 'Too many vaults created. Please try again later.' }, 429, {
          'retry-after': String(created.retryAfter)
        });
      }
      issuedToken = randomToken();
      vault = await createVault(env, issuedToken);
    } else {
      vault = await findVault(env, token);
      if (!vault) return json({ error: 'Vault not found.' }, 401);
    }

    const statements = [];

    /* -------------------------- o'chirishlar (tombstone) ------------------- */

    const deletions = Object.entries(body.deleted ?? {})
      .slice(0, MAX_DELETIONS)
      .map(([id, at]) => [String(id).slice(0, 200), normalizeTimestamp(at)])
      .filter(([id]) => id);

    for (const [spaceId, deletedAt] of deletions) {
      statements.push(
        env.OYDIN_DB.prepare(
          `INSERT INTO space_deletions (vault_id, space_id, deleted_at)
           VALUES (?, ?, ?)
           ON CONFLICT(vault_id, space_id) DO UPDATE SET
             deleted_at = MAX(space_deletions.deleted_at, excluded.deleted_at)`
        ).bind(vault.id, spaceId, deletedAt)
      );
      // O'chirilganidan keyin yangilanmagan makonni haqiqatan o'chiramiz.
      statements.push(
        env.OYDIN_DB.prepare(
          'DELETE FROM spaces WHERE vault_id = ? AND id = ? AND updated_at <= ?'
        ).bind(vault.id, spaceId, deletedAt)
      );
    }

    const deletedIds = new Set(deletions.map(([id]) => id));

    /* ------------------------------ makonlar ------------------------------- */

    const spaces = Array.isArray(body.spaces) ? body.spaces : [];
    if (JSON.stringify(spaces).length > MAX_PAYLOAD) {
      return json({ error: 'Sync payload is too large.' }, 413);
    }

    for (const space of spaces.slice(0, MAX_SPACES)) {
      const id = typeof space?.id === 'string' ? space.id.slice(0, 200) : '';
      if (!id || deletedIds.has(id)) continue;

      const data = JSON.stringify(space);
      if (data.length > MAX_SPACE_BYTES) continue;
      const updatedAt = normalizeTimestamp(space.updatedAt ?? space.updated_at);

      statements.push(
        env.OYDIN_DB.prepare(
          `INSERT INTO spaces (id, vault_id, title, data_json, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(vault_id, id) DO UPDATE SET
             title = excluded.title,
             data_json = excluded.data_json,
             updated_at = excluded.updated_at
           WHERE spaces.updated_at <= excluded.updated_at`
        ).bind(id, vault.id, String(space.title ?? 'Yangi makon').slice(0, 160), data, updatedAt)
      );

      // Qayta paydo bo'lgan makon uchun eski tombstone keraksiz.
      statements.push(
        env.OYDIN_DB.prepare(
          'DELETE FROM space_deletions WHERE vault_id = ? AND space_id = ? AND deleted_at < ?'
        ).bind(vault.id, id, updatedAt)
      );
    }

    const time = now();
    statements.push(
      env.OYDIN_DB.prepare('UPDATE vaults SET updated_at = ? WHERE id = ?').bind(time, vault.id)
    );

    // Bitta murojaat — ilgari 50 tagacha ketma-ket `await` bor edi.
    if (statements.length) await env.OYDIN_DB.batch(statements);

    const state = await readVaultState(env, vault.id);
    return json({
      ...(issuedToken ? { token: issuedToken } : {}),
      spaces: state.spaces,
      deleted: state.deleted,
      syncedAt: time
    });
  } catch (error) {
    console.error('Oydin sync error:', error);
    const status = error?.status ?? 502;
    const exposed = status === 400 || status === 401 || status === 413 || status === 503;
    return json({ error: exposed ? error.message : 'Sync failed.' }, status);
  }
}

export async function onRequestGet({ request, env }) {
  const checked = await guard(request, env, {
    scope: 'sync-read',
    limit: 60,
    windowSeconds: 60,
    methods: ['GET']
  });
  if (checked.response) return checked.response;

  try {
    const vault = await findVault(env, tokenFrom(request));
    if (!vault) return json({ error: 'Vault not found.' }, 404);
    return json(await readVaultState(env, vault.id));
  } catch (error) {
    const status = error?.status ?? 503;
    return json(
      { error: status === 401 || status === 503 ? error.message : 'Sync service unavailable.' },
      status
    );
  }
}
