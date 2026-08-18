# Oydin

**Oydin** — fikrlarni yozish, bogʻlash va koʻrish uchun vizual makon.

Loyiha bitta oddiy gʻoyani sinaydi: fikrlarga moslashuvchan joy berilsa —
ularni yozish, joylashtirish, bogʻlash va vaqt oʻtishi bilan bitta manzara
sifatida koʻrish mumkin boʻladi.

🔗 [oydin.uz](https://oydin.uz) · [GitHub](https://github.com/alisher-ds/oydin-uz)

---

## Uch sahifa

| Sahifa                        | Nima qiladi                                            |
| ----------------------------- | ------------------------------------------------------ |
| **Oydin** (`index.html`)      | Bosh sahifa va AI suhbat oynasi                        |
| **Oqim** (`oqim.html`)        | Fikrni tez yozib qoʻyish; keyin Makonga koʻchiriladi   |
| **Makon** (`map.html`)        | Asosiy ish maydoni: kartalar, aloqalar, fokus rejimi   |
| **Bir daqiqa** (`birdaqiqa/`) | 60 soniyalik erkin yozuv va undagi signalni koʻrsatish |

## Imkoniyatlar

- Fikrlarni yaratish, tahrirlash, koʻchirish va bogʻlash
- Aloqalarga tur berish: davomi · sabab · natija · qarama-qarshi · izoh
- Fokus rejimi — bitta fikr va uning bevosita qoʻshnilarini ajratib koʻrish
- Pan, zoom, pinch-zoom; ekranga sigʻdirish va avtomatik joylashtirish
- Bir nechta makon, qidiruv, bekor qilish (Ctrl+Z), JSON eksport/import
- Yorugʻ va tungi rejim (tizim sozlamasiga ergashadi), 5 ta makon ohangi
- Toʻliq klaviatura boshqaruvi va ekran oʻquvchilari uchun qoʻllab-quvvatlash
- Maʼlumot brauzerda saqlanadi + IndexedDB zaxirasi + ixtiyoriy sinxronizatsiya

## Klaviatura

| Klavish               | Amal                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `N` yoki `Ctrl/Cmd+K` | Yangi fikr                                                                                                  |
| `/`                   | Makon ichidan qidirish                                                                                      |
| `F`                   | Hammasini ekranga sigʻdirish                                                                                |
| `Ctrl/Cmd+Z`          | Bekor qilish                                                                                                |
| `Esc`                 | Rejimdan/fokusdan chiqish                                                                                   |
| Karta tanlanganda     | `E` tahrirlash · `C` bogʻlash · `Space` atrofini koʻrish · `Delete` oʻchirish · strelkalar bilan koʻchirish |

## Texnologiyalar

**Frontend** — build bosqichisiz, brauzerning oʻzi tushunadigan ES modullar:
HTML, CSS (custom properties, `color-mix`), JavaScript, SVG.

**Backend** — Cloudflare Pages Functions:

| Endpoint          | Vazifasi                                                |
| ----------------- | ------------------------------------------------------- |
| `POST /api/sync`  | Makonlarni qurilmalar orasida sinxronlash (D1)          |
| `GET /api/sync`   | Vault holatini oʻqish                                   |
| `POST /api/chat`  | AI suhbat (Google Gemini) — vault tokeni talab qilinadi |
| `GET /api/health` | Xizmat holati                                           |

**Maʼlumot** — Cloudflare D1 (SQLite). Sxema `migrations/` papkasida.

**Brauzerdagi AI** — "Bir daqiqa" sahifasi `@xenova/transformers` orqali
embedding modelini foydalanuvchi qurilmasida ishga tushiradi. Matn qurilmadan
chiqmaydi.

## Lokal ishga tushirish

```bash
git clone https://github.com/alisher-ds/oydin-uz.git
cd oydin-uz
npm install
```

**Faqat frontend** (API endpointlari ishlamaydi):

```bash
npm run serve      # http://localhost:8000
```

**Toʻliq, API bilan** — Cloudflare Wrangler kerak:

```bash
npm run dev        # http://localhost:8788
```

Baza jadvallari **avtomatik yaratiladi** — birinchi API soʻrovida
`functions/_lib/schema.js` kerakli jadvallarni `CREATE TABLE IF NOT EXISTS`
bilan tayyorlaydi. Qoʻlda migratsiya qilish shart emas.

Sxemani ataylab boshqarmoqchi boʻlsangiz, migratsiyalar ham joyida:

```bash
npx wrangler d1 migrations apply oydin-db --local    # yoki --remote
```

AI suhbat uchun maxfiy kalit:

```bash
npx wrangler pages secret put GEMINI_API_KEY
```

## Sifat nazorati

```bash
npm run lint       # ESLint + Stylelint + Prettier
npm test           # unit testlar (node:test)
npm run test:e2e   # brauzer testlari (Playwright)
npm run check      # lint + unit testlar
```

CI har push va pull requestda shularning barchasini ishga tushiradi
(`.github/workflows/ci.yml`).

> **Eslatma:** `eslint.config.js` dagi `no-undef` qoidasi bu loyihada
> ataylab qatʼiy. Aynan shu turdagi xato (blok ichida eʼlon qilingan
> oʻzgaruvchiga boshqa blokdan murojaat) bir vaqtlar uchta funksiyani jimgina
> ishdan chiqargan edi.

## Loyiha tuzilishi

```
assets/
  css/      tokens · base · components · map · oqim · ai · bir-daqiqa
  js/
    core/       dom · storage · events · theme
    map/        state · geometry · camera · cards · connections · dialogs · thinking · tools
    oqim/ ai/ landing/ sync/ bir-daqiqa/
    boot-*.js   har sahifaning kirish nuqtasi
functions/    Cloudflare Pages Functions (API)
  _lib/schema.js  sxema bootstrap — jadvallarni avtomatik yaratadi
migrations/   D1 sxemasi (bootstrap bilan mosligini test tekshiradi)
tests/
  unit/       node:test
  e2e/        Playwright
_headers      CSP va boshqa himoya sarlavhalari
```

## Maʼlumot va maxfiylik

- Barcha fikrlar birinchi navbatda **brauzerda** saqlanadi.
- IndexedDB zaxira nusxasi localStorage tozalanib ketsa maʼlumotni tiklaydi.
- Sinxronizatsiya **ixtiyoriy**. U yoqilganda 64 belgili vault kaliti
  yaratiladi — bu sizning yagona parolingiz. Uni yoʻqotsangiz, serverdagi
  nusxaga kirish imkoni qolmaydi. Kalitni yuqoridagi sinxronizatsiya
  koʻrsatkichini bosib koʻrasiz.
- Server hech qanday shaxsiy maʼlumot (email, ism, parol) soʻramaydi.

## Holat

Oydin — mahsulot dizayni, vizual oʻzaro taʼsir, responsive frontend va real
deployment ustida ishlash uchun yaratilgan eksperimental prototip va shaxsiy
loyiha.

## Litsenziya

[MIT](LICENSE)
