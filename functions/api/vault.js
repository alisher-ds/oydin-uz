/**
 * Kalitni boshqarish: yangilash (rotatsiya) va butunlay bekor qilish.
 *
 * MUAMMO: kalit bir marta yaratilgach abadiy amal qilardi. Uni ko'rgan
 * har kim — yelkangiz orqasidan qaragan odam, eski telefon, ekranda
 * qolib ketgan skrinshot — serverdagi nusxaga cheksiz kirish huquqiga
 * ega bo'lardi. "Bu qurilmani uzish" esa faqat brauzerdagi nusxani
 * o'chirardi, serverdagi kalit joyida qolaverardi.
 *
 * Ikkita amal buni yopadi:
 *
 *  1. YANGILASH — o'sha vaultga yangi kalit beriladi, eskisi shu
 *     zahoti ishlamay qoladi. Ma'lumot joyida qoladi. Kalit boshqaga
 *     ko'rinib qolgan bo'lsa shu kerak.
 *
 *  2. BEKOR QILISH — vault va uning serverdagi BARCHA ma'lumoti
 *     o'chiriladi. Qurilmadagi fikrlar tegilmaydi. "Serverda hech
 *     narsam qolmasin" degan holat uchun.
 *
 * Ikkalasi ham joriy kalitni talab qiladi: egalikni isbotlamasdan
 * boshqaning vaultini yangilab yoki o'chirib bo'lmaydi.
 */

import { checkLimit, guard, ipBucket, json } from '../_lib/guard.js';
import { ensureSchema } from '../_lib/schema.js';
import { hashToken, isValidToken, now, randomToken } from '../_lib/vault.js';

/** Bitta IP soatiga shuncha marta kalit yangilay/o'chira oladi. */
const PER_HOUR = 10;

const ACTIONS = new Set(['rotate', 'revoke']);

const tokenFrom = request =>
  String(request.headers.get('X-Oydin-Vault') ?? '')
    .trim()
    .toLowerCase();

export async function onRequestPost({ request, env }) {
  const checked = await guard(request, env, {
    maxBytes: 1_000,
    scope: 'vault',
    limit: 20,
    windowSeconds: 60
  });
  if (checked.response) return checked.response;

  if (!env.OYDIN_DB) return json({ error: 'Baza tayyor emas.' }, 503);

  const token = tokenFrom(request);
  if (!isValidToken(token)) return json({ error: 'Kalit noto‘g‘ri.' }, 401);

  let body;
  try {
    body = await checked.readJson();
  } catch (error) {
    return json({ error: error.message }, error.status ?? 400);
  }

  const action = String(body?.action ?? '');
  if (!ACTIONS.has(action)) return json({ error: 'Noma’lum amal.' }, 400);

  const allowed = await checkLimit(
    env,
    await ipBucket(request, env, 'vault-manage'),
    PER_HOUR,
    3600
  );
  if (!allowed.ok) {
    return json({ error: 'Juda ko‘p urinish. Bir ozdan keyin qayta urinib ko‘ring.' }, 429, {
      'retry-after': String(allowed.retryAfter)
    });
  }

  try {
    await ensureSchema(env);

    const vault = await env.OYDIN_DB.prepare('SELECT id FROM vaults WHERE token_hash = ?')
      .bind(await hashToken(token))
      .first();
    // Mavjud bo'lmagan kalit ham 401: vault bor-yo'qligi oshkor bo'lmasin.
    if (!vault) return json({ error: 'Kalit topilmadi.' }, 401);

    if (action === 'rotate') {
      const next = randomToken();
      await env.OYDIN_DB.prepare('UPDATE vaults SET token_hash = ?, updated_at = ? WHERE id = ?')
        .bind(await hashToken(next), now(), vault.id)
        .run();
      // Eski kalit shu zahoti ishlamay qoladi: hash boshqa.
      return json({ token: next });
    }

    /*
     * O'chirish ATAYLAB aniq: sxemada `ON DELETE CASCADE` bor, lekin
     * SQLite'da tashqi kalitlar `PRAGMA foreign_keys = ON` siz jim
     * turadi. Yetim qatorlar qolib ketmasin.
     */
    await env.OYDIN_DB.batch([
      env.OYDIN_DB.prepare('DELETE FROM spaces WHERE vault_id = ?').bind(vault.id),
      env.OYDIN_DB.prepare('DELETE FROM space_deletions WHERE vault_id = ?').bind(vault.id),
      env.OYDIN_DB.prepare('DELETE FROM vaults WHERE id = ?').bind(vault.id)
    ]);
    return json({ ok: true });
  } catch (error) {
    console.error('Vault amali bajarilmadi:', error);
    return json({ error: 'Amal bajarilmadi.' }, 503);
  }
}
