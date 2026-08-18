# Migratsiyalar

> **Eslatma:** jadvallar `functions/_lib/schema.js` tomonidan birinchi API
> soʻrovida avtomatik yaratiladi, shuning uchun deployda qoʻlda migratsiya
> qilish SHART EMAS. Bu papka sxemani ataylab boshqarish uchun.
> Ikkalasining mosligini `tests/unit/schema.test.js` tekshiradi.

Sxemaning yagona haqiqat manbai — shu papka. Ilgari ildizda `schema.sql` ham
bor edi va u allaqachon 0002-migratsiyaning shaklini olib yurardi; bitta
sxema uchun ikkita manba bo'lishi chalkashlik keltirib chiqaradi.

## Ishga tushirish

```bash
# Lokal (mahalliy D1 nusxasi)
npx wrangler d1 migrations apply oydin-db --local

# Production
npx wrangler d1 migrations apply oydin-db --remote
```

## Tarix

| Fayl                                 | Nima qiladi                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `0001_initial.sql`                   | `vaults` va `spaces` jadvallari                                                         |
| `0002_scope_spaces_to_vault.sql`     | `spaces` birlamchi kalitini vaultga bog'laydi (ijarachilararo ma'lumot oqishini yopadi) |
| `0003_deletions_and_rate_limits.sql` | O'chirish tombstone'lari va D1 asosidagi rate limiting                                  |
