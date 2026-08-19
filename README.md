# Oydin

**Oydin** — fikrlarni yozish, bogʻlash va koʻrish uchun vizual makon.

Loyiha bitta oddiy gʻoyani sinaydi: fikrlarga moslashuvchan joy berilsa —
ularni yozish, joylashtirish, bogʻlash va vaqt oʻtishi bilan bitta manzara
sifatida koʻrish mumkin boʻladi.

🔗 [oydin-uz.pages.dev](https://oydin-uz.pages.dev) · [GitHub](https://github.com/alisher-ds/oydin-uz)

---

## Ikki sahifa

| Sahifa                   | Nima qiladi                                          |
| ------------------------ | ---------------------------------------------------- |
| **Oydin** (`index.html`) | Bosh sahifa va AI suhbat oynasi                      |
| **Makon** (`map.html`)   | Asosiy ish maydoni: kartalar, aloqalar, fokus rejimi |

Ilgari beshta alohida sahifa bor edi (Oqim, Bir daqiqa, Tez yozish) va
uchtasi bir xil ishni — fikrni yozib qoʻyishni — qilardi. Ular bitta
**Tez yozish** panelida birlashtirildi: u Makon ichida, oʻng paneldagi
tugma yoki `T` klavishi bilan ochiladi. Fikrni yozish uchun endi sahifadan
chiqish shart emas.

## Imkoniyatlar

- Fikrlarni yaratish, tahrirlash, koʻchirish va bogʻlash
- Aloqalarga tur berish: davomi · sabab · natija · qarama-qarshi · izoh
- **Tez yozish** — Makondan chiqmasdan fikr yozib qoʻyish, qidirish,
  tahrirlash va istagan payt makonga joylashtirish
- **Eski fikrni qaytarish** — unutilgan yozuv vaqti-vaqti bilan oʻzi
  yuzaga chiqadi (kuniga bir marta, faqat ancha eskilari)
- **Birinchi kirganlar uchun qisqa qoʻllanma** — beshta qadam, istagan
  payt toʻxtatiladi. Faqat birinchi tashrifda oʻzi ochiladi; keyin
  Yordam oynasidagi tugma orqali
- **Saqlash koʻrsatkichi** — pastki oʻng burchakda: saqlandi ·
  sinxronlanmoqda · oflayn
- Fokus rejimi — bitta fikr va uning bevosita qoʻshnilarini ajratib koʻrish
- Pan, zoom, pinch-zoom; ekranga sigʻdirish va avtomatik joylashtirish
- Bir nechta makon, qidiruv, bekor qilish (Ctrl+Z), JSON eksport/import
- Yorugʻ va tungi rejim (tizim sozlamasiga ergashadi), 5 ta makon ohangi
- Telefon uchun moslashtirilgan: barcha amallar "⋯" varagʻida, 44px tugmalar
- Bosh ekranga oʻrnatiladi (PWA) va internetsiz ochiladi
- Toʻliq klaviatura boshqaruvi va ekran oʻquvchilari uchun qoʻllab-quvvatlash
- Maʼlumot brauzerda saqlanadi + IndexedDB zaxirasi + ixtiyoriy sinxronizatsiya

## Klaviatura

| Klavish               | Amal                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `N` yoki `Ctrl/Cmd+K` | Yangi fikr                                                                                                  |
| `T`                   | Tez yozish panelini ochish                                                                                  |
| `/`                   | Makon ichidan qidirish                                                                                      |
| `F`                   | Hammasini ekranga sigʻdirish                                                                                |
| `Ctrl/Cmd+Z`          | Bekor qilish                                                                                                |
| `Ctrl/Cmd+Shift+Z`    | Qaytarish (`Ctrl+Y` ham)                                                                                    |
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
| `POST /api/stat`  | Anonim statistika — faqat hodisa nomi                   |

**Maʼlumot** — Cloudflare D1 (SQLite). Sxema `migrations/` papkasida.

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
index.html    Oydin — bosh sahifa va AI suhbat
map.html      Makon — asosiy ish maydoni
assets/
  css/      tokens · base · components · map · ai
  js/
    core/       dom · storage · events · theme · pwa · notes · recall
                stat · backup-notice
    map/        state · geometry · camera · cards · connections · dialogs
                thinking · tools · mobile-actions · tez-panel · recall-bar
                tour · toast · save-badge
    ai/ landing/ sync/
    boot-landing.js · boot-map.js   har sahifaning kirish nuqtasi
functions/    Cloudflare Pages Functions (API)
  _lib/schema.js  sxema bootstrap — jadvallarni avtomatik yaratadi
migrations/   D1 sxemasi (bootstrap bilan mosligini test tekshiradi)
sw.js         service worker — internetsiz ishlash uchun
tests/
  unit/       node:test
  e2e/        Playwright
_headers      CSP va boshqa himoya sarlavhalari
```

## Maʼlumot va maxfiylik

- Barcha fikrlar birinchi navbatda **brauzerda** saqlanadi. Buni pastki
  oʻng burchakdagi koʻrsatkich tasdiqlab turadi.
- Maʼlumot bir haftadan beri qurilmadan chiqmagan boʻlsa, **bir marta**
  zaxira olish taklif qilinadi. Yopilgach boshqa qaytmaydi.
- IndexedDB zaxira nusxasi localStorage tozalanib ketsa maʼlumotni tiklaydi.
- Sinxronizatsiya **ixtiyoriy**. U yoqilganda 64 belgili vault kaliti
  yaratiladi — bu sizning yagona parolingiz. Uni yoʻqotsangiz, serverdagi
  nusxaga kirish imkoni qolmaydi. Kalitni yuqoridagi sinxronizatsiya
  koʻrsatkichini bosib koʻrasiz.
- Server hech qanday shaxsiy maʼlumot (email, ism, parol) soʻramaydi.
- Saytda **tashqi** kuzatuv (Google Analytics, reklama, cookie) yoʻq.
- Rate limiting IP manzilni **ochiq saqlamaydi** — bazada faqat kunlik
  tuz bilan hisoblangan SHA-256 izi turadi.

### Anonim statistika

Oydin qancha odam kirgani va nima qilganini biladi, lekin **kim** qilganini
bilmaydi. Bu ataylab shunday qurilgan.

Serverdagi `stats` jadvalida faqat uchta ustun bor: `(kun, hodisa, son)`.
Masalan `2026-08-19 | fikr | 14`. Foydalanuvchi yozuvi umuman yoʻq.

Serverga **yuborilmaydigan** narsalar: fikr matni, cookie, qurilma
identifikatori, sessiya, referrer, IP. Yuboriladigan yagona narsa —
oldindan belgilangan roʻyxatdagi hodisa nomi (`tashrif`, `fikr`, `tez`, …).
Roʻyxatdan tashqaridagi nom server tomonidan rad etiladi, ya'ni matnni
"hodisa nomi" sifatida yashirincha oʻtkazib boʻlmaydi.

"Nechta odam" sanogʻi **qurilmaning oʻzida** hisoblanadi: brauzer bugun
birinchi marta ochilganini biladi va serverga bitta `tashrif` soʻzini
yuboradi. Shuning uchun server unique visitor'ni aniqlash uchun kerak
boʻladigan hech narsaga muhtoj emas.

Bularning hammasi `tests/e2e/stat.spec.js` da tarmoq darajasida
tekshiriladi — kod emas, sahifa **aslida nima yuborayotgani** oʻqiladi.

**Oʻchirish:**

```js
localStorage.setItem('oydin-stat', 'off'); // butunlay toʻxtaydi
```

Brauzerning "Do Not Track" sozlamasi ham hurmat qilinadi. Lokal
ishlab chiqishda statistika oʻzi oʻchiq (`localhost`).

**Oʻqish** — `STATS_TOKEN` maxfiysi oʻrnatilgan boʻlishi kerak, aks holda
endpoint umuman javob bermaydi (404). Notoʻgʻri token ham 404 qaytaradi,
ya'ni endpoint borligi oshkor boʻlmaydi:

```bash
npx wrangler pages secret put STATS_TOKEN
npx wrangler pages secret put IP_SALT     # rate limiting izlari uchun
```

Bitta manzil ikki xil javob beradi — brauzer HTML soʻraydi, `curl` yoʻq:

```
https://oydin-uz.pages.dev/api/stat?token=...&days=30   → oʻqiladigan sahifa
curl "https://oydin-uz.pages.dev/api/stat?token=..."     → JSON
```

Sahifa ataylab `/api/` ostida turadi: Oydin'da ikkita sahifa bor va
uchinchisi qoʻshilmasligi kerak. Saytda unga hech qanday havola yoʻq va
u qidiruv tizimlariga indekslanmaydi.

Bevosita bazadan ham oʻqish mumkin:

```bash
npx wrangler d1 execute oydin-db --remote --command \
  "SELECT day, event, hits FROM stats ORDER BY day DESC LIMIT 50"
```

## Holat

Oydin — mahsulot dizayni, vizual oʻzaro taʼsir, responsive frontend va real
deployment ustida ishlash uchun yaratilgan eksperimental prototip va shaxsiy
loyiha.

## Litsenziya

[MIT](LICENSE)
