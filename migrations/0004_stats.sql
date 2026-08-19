-- Oydin 0004 — anonim statistika.
--
-- Nima uchun kerak:
-- Saytga kim kirgani, kirgan odam fikr yozganmi yoki shunchaki chiqib
-- ketganmi — bularning hech biri ma'lum emas edi. Bularsiz mahsulot
-- haqida qaror qabul qilib bo'lmaydi.
--
-- Nima uchun AYNAN shunday:
-- Bu jadvalda foydalanuvchi yozuvi YO'Q. Faqat sanoq: qaysi kuni qaysi
-- hodisa necha marta bo'lgani. IP, cookie, qurilma identifikatori, matn —
-- birortasi ham saqlanmaydi va serverga umuman yuborilmaydi.
--
-- Buning oqibati: ikkita hodisani bir odamga bog'lash MUMKIN EMAS. Baza
-- to'liq sizib ketsa ham undan hech kimning shaxsi aniqlanmaydi, chunki
-- unda shaxs haqida hech narsa yo'q.
--
-- "Nechta odam" degan sanoq qurilmaning o'zida hisoblanadi: brauzer
-- bugun birinchi marta ochilganini o'zi biladi va serverga faqat "+1"
-- yuboradi.

CREATE TABLE IF NOT EXISTS stats (
  day   TEXT NOT NULL,
  event TEXT NOT NULL,
  hits  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
);
