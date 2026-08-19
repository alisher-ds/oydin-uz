/**
 * Statistika sahifasi — HTML ko'rinishi.
 *
 * Nima uchun alohida modul: bu SOF funksiya (kirish ma'lumoti → matn),
 * ya'ni uni brauzersiz, tarmoqsiz va bazasiz to'liq test qilish mumkin.
 *
 * Nima uchun sahifa `/api/stat` ichida, alohida `.html` fayl emas:
 * Oydin'da ataylab ikkita sahifa bor (Oydin va Makon). Bu sahifa esa
 * mahsulotning bir qismi emas — u faqat egasi uchun, token bilan
 * ochiladi va saytda unga hech qanday havola yo'q.
 *
 * DIQQAT: sahifa ichida `<style>` bloki ham, `style="..."` atributi ham
 * ishlatilmaydi — CSP (`style-src 'self'`) ularni bloklaydi. Uslub
 * `/assets/css/stat.css` dan keladi, diagramma esa SVG atributlari
 * bilan chiziladi.
 */

/** Texnik nomlar → odam o'qiydigan nomlar. */
const LABELS = Object.freeze({
  tashrif: 'Tashrif',
  qaytish: 'Qaytgan',
  'sahifa:oydin': 'Bosh sahifa ochildi',
  'sahifa:makon': 'Makon ochildi',
  ornatildi: 'Bosh ekranga o‘rnatildi',
  fikr: 'Fikr yozildi',
  aloqa: 'Fikrlar bog‘landi',
  makon: 'Yangi makon',
  tez: 'Tez yozishga yozildi',
  'tez:makonga': 'Makonga ko‘chirildi',
  'recall:korsatildi': 'Eski fikr ko‘rsatildi',
  'recall:qabul': 'Eski fikr qabul qilindi',
  'recall:yopildi': 'Eski fikr yopildi',
  ai: 'AI suhbat'
});

const escape = value =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** "19 avg" ko'rinishidagi qisqa sana. */
const OYLAR = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
const shortDate = day => {
  const [, month, date] = day.split('-');
  return `${Number(date)} ${OYLAR[Number(month) - 1] ?? ''}`.trim();
};

/**
 * Kunlik ustunli diagramma — sof SVG, atributlar bilan.
 *
 * @param {Array<{day: string, value: number}>} points eski→yangi tartibda
 */
function chart(points) {
  if (!points.length) return '';

  const W = 720;
  const H = 180;
  const PAD = 10;
  const max = Math.max(...points.map(p => p.value), 1);
  const slot = (W - PAD * 2) / points.length;
  const barWidth = Math.max(2, Math.min(slot - 3, 34));

  const bars = points
    .map((point, index) => {
      const height = Math.round((point.value / max) * (H - PAD * 2));
      const x = PAD + index * slot + (slot - barWidth) / 2;
      const y = H - PAD - height;
      return (
        `<rect class="bar" x="${x.toFixed(1)}" y="${y}" width="${barWidth.toFixed(1)}" ` +
        `height="${Math.max(height, 1)}" rx="2"><title>${escape(shortDate(point.day))}: ` +
        `${point.value}</title></rect>`
      );
    })
    .join('');

  // Sanalar SVG ichida EMAS: `viewBox` telefonda ~0.5 ga kichrayadi va
  // matn o'qib bo'lmas holga keladi. HTML da esa u har doim o'z o'lchamida.
  const first = escape(shortDate(points[0].day));
  const last = escape(shortDate(points.at(-1).day));
  const axis =
    points.length > 1
      ? `<p class="axis"><span>${first}</span><span>${last}</span></p>`
      : `<p class="axis"><span>${first}</span></p>`;

  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" ` +
    `aria-label="Kunlik tashriflar diagrammasi">` +
    `<line class="grid" x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" />` +
    `${bars}</svg>${axis}`
  );
}

/**
 * @param {object} input
 * @param {number} input.days qamrab olingan kunlar
 * @param {string} input.since boshlanish sanasi
 * @param {Record<string, number>} input.total hodisa → jami son
 * @param {Record<string, Record<string, number>>} input.byDay kun → hodisalar
 */
export function renderStatsPage({ days, since, total = {}, byDay = {} }) {
  const get = key => Number(total[key] ?? 0);
  const tashrif = get('tashrif');
  const yozgan = get('fikr') + get('tez');

  const tiles = [
    ['Tashrif', tashrif, 'noyob, kuniga bir marta'],
    ['Qaytgan', get('qaytish'), 'ilgari ham kirgan'],
    ['Fikr yozildi', get('fikr'), 'makonda karta'],
    ['Tez yozish', get('tez'), 'panel orqali']
  ]
    .map(
      ([label, value, hint]) =>
        `<div class="tile"><b>${value}</b><span>${escape(label)}</span>` +
        `<span>${escape(hint)}</span></div>`
    )
    .join('');

  // Eng muhim raqam: kirgan odamlarning qanchasi ISH qilgan.
  const ulush = tashrif ? Math.round((yozgan / tashrif) * 100) : 0;
  const note = tashrif
    ? `<p class="note"><strong>${ulush}%</strong> — kirganlarning shuncha qismi ` +
      `hech bo‘lmasa bitta fikr yozgan (${yozgan} / ${tashrif}). ` +
      `Bu raqam past bo‘lsa muammo reklama emas, birinchi ekranda.</p>`
    : '';

  const points = Object.keys(byDay)
    .sort()
    .map(day => ({ day, value: Number(byDay[day]?.tashrif ?? 0) }));

  const rows = Object.entries(total)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([event, value]) =>
        `<tr><td>${escape(LABELS[event] ?? event)}</td>` +
        `<td class="code">${escape(event)}</td>` +
        `<td class="num">${Number(value)}</td></tr>`
    )
    .join('');

  const body = Object.keys(total).length
    ? `<h2>Umumiy</h2><div class="tiles">${tiles}</div>${note}` +
      `<h2>Kunlik tashrif</h2>${chart(points)}` +
      `<h2>Barcha hodisalar</h2><div class="scroll"><table>` +
      `<thead><tr><th>Hodisa</th><th>Nomi</th><th class="num">Soni</th></tr></thead>` +
      `<tbody>${rows}</tbody></table></div>`
    : `<p class="empty">Hali ma’lumot yo‘q.<br />Statistika sayt yangilangan ` +
      `paytdan boshlab yig‘iladi — undan oldingi tashriflar hech qayerda ` +
      `saqlanmagan.</p>`;

  return `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Oydin — statistika</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap"
    />
    <link rel="stylesheet" href="/assets/css/tokens.css" />
    <link rel="stylesheet" href="/assets/css/stat.css" />
  </head>
  <body>
    <div class="wrap">
      <header>
        <h1>Oydin</h1>
        <p class="sub">Statistika · so‘nggi ${Number(days)} kun — ${escape(shortDate(since))}dan buyon</p>
      </header>
      ${body}
      <footer>
        Bu sahifada shaxsiy ma’lumot yo‘q va bo‘lishi ham mumkin emas: bazada
        faqat <em>(kun, hodisa, son)</em> saqlanadi. IP, cookie va qurilma
        identifikatori hech qachon yig‘ilmagan, shuning uchun bu raqamlarni
        birorta odamga bog‘lab bo‘lmaydi.
      </footer>
    </div>
  </body>
</html>`;
}
