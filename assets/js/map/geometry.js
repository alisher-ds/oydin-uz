/**
 * Makon geometriyasi — SOF funksiyalar, DOM ga bog'liq emas.
 *
 * Ilgari egri chiziq matematikasi ikki joyda so'zma-so'z takrorlangan va
 * anchoring moduli `d` atributidan raqamlarni regex bilan qayta o'qib,
 * chiziq qaysi kartaga tegishli ekanini "eng yaqin markaz" bo'yicha taxmin
 * qilardi. Endi geometriya shu yerda, bir marta, va test bilan qoplangan.
 */

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1.75;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Zoom qiymatini ruxsat etilgan oraliqqa keltiradi. */
export const clampZoom = value => clamp(Number(value) || 1, ZOOM_MIN, ZOOM_MAX);

/**
 * Karta to'rtburchagining markazi.
 * @param {{x:number,y:number,width:number,height:number}} rect
 */
export const centerOf = rect => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
});

/**
 * Chiziq kartaning MARKAZIDAN emas, CHEGARASIDAN boshlanishi kerak —
 * aks holda u o'qiladigan matn ustidan kesib o'tadi.
 *
 * Markazdan `target` tomon yo'nalgan nurni to'rtburchak chegarasi bilan
 * kesishtiramiz va tashqariga `gap` piksel suramiz.
 */
export function anchorPoint(rect, target, gap = 8) {
  const center = centerOf(rect);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const halfWidth = rect.width / 2 || 1;
  const halfHeight = rect.height / 2 || 1;

  const scaleX = Math.abs(dx) / halfWidth;
  const scaleY = Math.abs(dy) / halfHeight;
  const scale = 1 / Math.max(scaleX, scaleY, 1e-6);

  const edgeX = center.x + dx * scale;
  const edgeY = center.y + dy * scale;
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: edgeX + (dx / length) * gap,
    y: edgeY + (dy / length) * gap
  };
}

/**
 * Ikki nuqta orasidagi yumshoq egri chiziqning SVG `d` atributi.
 * Gorizontal va vertikal yo'nalishlar uchun boshqaruv nuqtalari farq qiladi.
 */
export function buildPath(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const distance = Math.hypot(dx, dy);
  const bend = clamp(distance * 0.32, 55, 180);

  if (Math.abs(dx) > Math.abs(dy)) {
    const c1x = p1.x + Math.sign(dx) * bend;
    const c2x = p2.x - Math.sign(dx) * bend;
    return `M${p1.x},${p1.y} C${c1x},${p1.y - dy * 0.08} ${c2x},${p2.y + dy * 0.08} ${p2.x},${p2.y}`;
  }
  const c1y = p1.y + Math.sign(dy) * bend;
  const c2y = p2.y - Math.sign(dy) * bend;
  return `M${p1.x},${p1.y} C${p1.x - dx * 0.08},${c1y} ${p2.x + dx * 0.08},${c2y} ${p2.x},${p2.y}`;
}

/** Ikki karta orasidagi to'liq yo'lni chegaradan chegaraga quradi. */
export function connectionPath(fromRect, toRect, gap = 8) {
  const p1 = anchorPoint(fromRect, centerOf(toRect), gap);
  const p2 = anchorPoint(toRect, centerOf(fromRect), gap);
  return buildPath(p1, p2);
}

/**
 * Kartalarni aloqalar bo'yicha darajalarga ajratadi (BFS).
 * Bog'lanmagan komponentlar ham o'z ildizini oladi — ilgari ular hammasi
 * 0-darajaga tushib, ustma-ust chizilardi.
 * @returns {Map<string, number>}
 */
export function levelsOf(cards, connections) {
  const byId = new Map(cards.map(card => [String(card.id), card]));
  const outgoing = new Map();
  const incoming = new Set();

  for (const edge of connections) {
    const from = String(edge.from);
    const to = String(edge.to);
    if (!byId.has(from) || !byId.has(to)) continue;
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(to);
    incoming.add(to);
  }

  const levels = new Map();
  const roots = cards.filter(card => !incoming.has(String(card.id)));
  const queue = (roots.length ? roots : cards).map(card => String(card.id));
  for (const id of queue) levels.set(id, 0);

  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    const level = levels.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      if (levels.has(next)) continue;
      levels.set(next, level + 1);
      queue.push(next);
    }
  }

  // Hech qaysi ildizdan yetib bo'lmagan kartalar (tsikllar) ham joy oladi.
  for (const card of cards) {
    const id = String(card.id);
    if (!levels.has(id)) levels.set(id, 0);
  }
  return levels;
}

/**
 * Kartalarni daraxt ko'rinishida avtomatik joylashtiradi.
 * SOF: kirish massivini o'zgartirmaydi, yangi joylashuvlar xaritasini qaytaradi.
 * @returns {Map<string, {x:number, y:number}>}
 */
export function autoLayout(cards, connections, viewportWidth, options = {}) {
  const columnGap = options.columnGap ?? 300;
  const rowGap = options.rowGap ?? 150;
  const topPadding = options.topPadding ?? 120;
  const sidePadding = options.sidePadding ?? 60;

  const levels = levelsOf(cards, connections);
  const groups = new Map();
  for (const card of cards) {
    const level = levels.get(String(card.id)) ?? 0;
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(card);
  }

  const positions = new Map();
  for (const [level, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const rowWidth = Math.max(0, (group.length - 1) * columnGap);
    const startX = Math.max(sidePadding, (viewportWidth - rowWidth) / 2);
    const y = topPadding + level * rowGap;
    group.forEach((card, index) => {
      positions.set(String(card.id), { x: startX + index * columnGap, y });
    });
  }
  return positions;
}

/**
 * Kartalarni o'rab turgan to'rtburchak.
 * @param {Array<{x:number,y:number,width:number,height:number}>} rects
 */
export function boundsOf(rects) {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Barcha kartalarni ekranga sig'dirish uchun kerakli zoom va pan.
 * DIQQAT: bu kartalarni KO'CHIRMAYDI — faqat kamerani sozlaydi.
 */
export function fitToView(rects, viewport, padding = 80) {
  const bounds = boundsOf(rects);
  if (!bounds) return { zoom: 1, panX: 0, panY: 0 };

  const usableWidth = Math.max(1, viewport.width - padding * 2);
  const usableHeight = Math.max(1, viewport.height - padding * 2);
  const zoom = clampZoom(
    Math.min(usableWidth / (bounds.width || 1), usableHeight / (bounds.height || 1))
  );

  const panX = (viewport.width - bounds.width * zoom) / 2 - bounds.minX * zoom;
  const panY = (viewport.height - bounds.height * zoom) / 2 - bounds.minY * zoom;
  return { zoom, panX, panY };
}
