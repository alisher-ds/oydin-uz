/**
 * Makon holati — YAGONA haqiqat manbai.
 *
 * Ilgari to'rtta mustaqil blok bir xil ma'lumotni localStorage dan alohida
 * qayta o'qirdi (`getStoredConnections()` tirik `connections` o'zgaruvchisi
 * yonida turib ham). Endi hamma shu moduldan o'qiydi.
 *
 * Qo'shilgan kafolatlar:
 *  - saqlash muvaffaqiyatsiz bo'lsa (kvota) chaqiruvchi buni BILADI;
 *  - o'chirilgan makonlar tombstone qoldiradi, shuning uchun sinxronizatsiya
 *    ularni qaytarib keltirmaydi;
 *  - bekor qilish tarixi ham son, ham bayt hajmi bo'yicha cheklangan.
 */

import { EVENTS, readJson, uid, writeJson } from '../core/index.js';

const MAPS_KEY = 'oydin-maps';
const ACTIVE_KEY = 'oydin-active-map';
const RELATIONS_KEY = 'oydin-connection-relations-v1';
const TOMBSTONE_KEY = 'oydin-deleted-maps-v1';
const HISTORY_KEY = 'oydin-history-v1';

const HISTORY_MAX_ENTRIES = 20;
const HISTORY_MAX_BYTES = 1_500_000;
/** Tombstone shuncha vaqtdan keyin keraksiz bo'ladi (30 kun). */
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SPACES = Object.freeze({
  paper: { name: 'Sokin qog‘oz', class: 'space-paper' },
  mist: { name: 'Yumshoq tuman', class: 'space-mist' },
  sand: { name: 'Iliq qum', class: 'space-sand' },
  night: { name: 'Sokin tun', class: 'space-night' },
  ink: { name: 'Siyoh makon', class: 'space-ink' }
});

export const CARD_TYPES = Object.freeze(['G‘oya', 'Reja', 'Savol', 'Kontekst']);

export const RELATION_TYPES = Object.freeze([
  { id: 'davomi', label: 'Davomi' },
  { id: 'sabab', label: 'Sabab' },
  { id: 'natija', label: 'Natija' },
  { id: 'qarshi', label: 'Qarama-qarshi' },
  { id: 'izoh', label: 'Izoh' }
]);

const nowIso = () => new Date().toISOString();

export const emptyMap = (id = uid()) => ({
  id,
  title: 'Yangi makon',
  cards: [],
  connections: [],
  space: 'paper',
  updatedAt: nowIso()
});

/** Ixtiyoriy kirishni ishonchli makon obyektiga keltiradi. */
export function normalizeMap(raw, fallbackId) {
  const id = String(raw?.id ?? fallbackId ?? uid());
  const cards = Array.isArray(raw?.cards) ? raw.cards : [];
  const connections = Array.isArray(raw?.connections) ? raw.connections : [];
  const cardIds = new Set(cards.filter(card => card?.id != null).map(card => String(card.id)));

  return {
    id,
    title: String(raw?.title ?? 'Yangi makon').slice(0, 160) || 'Yangi makon',
    space: Object.hasOwn(SPACES, raw?.space) ? raw.space : 'paper',
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : nowIso(),
    cards: cards
      .filter(card => card?.id != null)
      .map(card => ({
        id: String(card.id),
        text: String(card.text ?? ''),
        type: CARD_TYPES.includes(card.type) ? card.type : CARD_TYPES[0],
        x: Number.isFinite(Number(card.x)) ? Number(card.x) : 80,
        y: Number.isFinite(Number(card.y)) ? Number(card.y) : 120,
        createdAt: typeof card.createdAt === 'string' ? card.createdAt : nowIso(),
        detail: {
          summary: String(card.detail?.summary ?? ''),
          due: String(card.detail?.due ?? ''),
          status: ['Ochiq', 'Jarayonda', 'Tayyor'].includes(card.detail?.status)
            ? card.detail.status
            : 'Ochiq',
          notes: String(card.detail?.notes ?? '')
        }
      })),
    // Mavjud bo'lmagan kartaga ishora qiluvchi aloqalar tashlanadi —
    // aks holda ular ko'rinmas "arvoh" bo'lib qoladi.
    connections: connections
      .filter(edge => edge && cardIds.has(String(edge.from)) && cardIds.has(String(edge.to)))
      .map(edge => ({
        id: String(edge.id ?? uid()),
        from: String(edge.from),
        to: String(edge.to)
      }))
  };
}

/** Ichki holat. Tashqaridan faqat funksiyalar orqali o'zgaradi. */
const state = {
  maps: {},
  activeId: '',
  relations: {},
  tombstones: {}
};

let recordingHistory = true;
/**
 * Oxirgi SAQLANGAN holat.
 *
 * Tarixga hozirgi emas, aynan OLDINGI holat yoziladi — aks holda "bekor
 * qilish" o'zini o'ziga qaytarardi va hech narsa o'zgarmasdi.
 */
let lastSnapshot = null;

function emit(type, detail) {
  globalThis.dispatchEvent?.(new CustomEvent(type, { detail }));
}

function pruneTombstones() {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  let changed = false;
  for (const [id, iso] of Object.entries(state.tombstones)) {
    if (Date.parse(iso) < cutoff) {
      delete state.tombstones[id];
      changed = true;
    }
  }
  return changed;
}

/** Holatni saqlashdan o'qiydi. Sahifa yuklanganda bir marta chaqiriladi. */
export function loadState() {
  const rawMaps = readJson(MAPS_KEY, {});
  state.maps = {};
  for (const [key, value] of Object.entries(rawMaps ?? {})) {
    const map = normalizeMap(value, key);
    state.maps[map.id] = map;
  }

  state.relations = readJson(RELATIONS_KEY, {}) ?? {};
  state.tombstones = readJson(TOMBSTONE_KEY, {}) ?? {};
  pruneTombstones();

  const savedActive = readJson(ACTIVE_KEY, null);
  const activeId = typeof savedActive === 'string' ? savedActive : String(savedActive ?? '');

  if (!Object.keys(state.maps).length) {
    const fresh = emptyMap('map-default');
    state.maps[fresh.id] = fresh;
    state.activeId = fresh.id;
  } else {
    state.activeId = Object.hasOwn(state.maps, activeId) ? activeId : Object.keys(state.maps)[0];
  }
  lastSnapshot = snapshotOf();
  return state;
}

export const allMaps = () => Object.values(state.maps);
export const activeMap = () => state.maps[state.activeId];
export const activeMapId = () => state.activeId;
export const cards = () => activeMap()?.cards ?? [];
export const connections = () => activeMap()?.connections ?? [];
export const tombstones = () => ({ ...state.tombstones });

export const findCard = id => cards().find(card => card.id === String(id));
export const findConnection = id => connections().find(edge => edge.id === String(id));

/**
 * Holatni diskka yozadi.
 * @returns {{ok: boolean, reason?: string}} — chaqiruvchi xatoni ko'rsatishi SHART.
 */
export function persist({ touch = true } = {}) {
  const map = activeMap();
  if (map && touch) map.updatedAt = nowIso();

  if (recordingHistory) pushHistory();

  const mapsResult = writeJson(MAPS_KEY, state.maps);
  if (!mapsResult.ok) return mapsResult;

  writeJson(ACTIVE_KEY, state.activeId);
  writeJson(RELATIONS_KEY, state.relations);
  writeJson(TOMBSTONE_KEY, state.tombstones);

  emit(EVENTS.stateChanged, { mapId: state.activeId });
  return { ok: true };
}

/* ------------------------------- kartalar ------------------------------- */

/** Yangi karta uchun joy tanlaydi. Ustunlar soni ekran kengligiga bog'liq. */
export function placeCard({ index, viewportWidth, parent }) {
  const COLUMN = 300;
  const ROW = 175;
  const MARGIN = 40;

  // Telefonda bitta ustun, keng ekranda bir nechta.
  const columns = Math.max(1, Math.floor((viewportWidth - MARGIN) / COLUMN));

  if (parent) {
    // Bolani ota-onaning yoniga qo'yamiz; joy bo'lmasa — tagiga.
    const besideX = parent.x + COLUMN - 10;
    const fitsBeside = besideX + 240 <= Math.max(viewportWidth, COLUMN * columns + MARGIN);
    return fitsBeside
      ? { x: besideX, y: parent.y + ((index % 3) - 1) * 110 }
      : { x: parent.x, y: parent.y + ROW };
  }

  const column = index % columns;
  const row = Math.floor(index / columns);
  return { x: MARGIN + column * COLUMN, y: 100 + row * ROW };
}

export function addCard({ text, type, parentId = null, viewportWidth = 1200 }) {
  const map = activeMap();
  if (!map) return null;

  const parent = parentId ? findCard(parentId) : null;
  const index = map.cards.length;
  const point = placeCard({ index, viewportWidth, parent });

  const card = {
    id: uid(),
    text: String(text ?? '').slice(0, 500),
    type: CARD_TYPES.includes(type) ? type : CARD_TYPES[0],
    x: point.x,
    y: point.y,
    createdAt: nowIso(),
    detail: { summary: '', due: '', status: 'Ochiq', notes: '' }
  };
  map.cards.push(card);
  if (parent) map.connections.push({ id: uid(), from: parent.id, to: card.id });
  return card;
}

export function updateCard(id, patch) {
  const card = findCard(id);
  if (!card) return null;
  if (patch.text != null) card.text = String(patch.text).slice(0, 500);
  if (patch.type != null && CARD_TYPES.includes(patch.type)) card.type = patch.type;
  if (Number.isFinite(patch.x)) card.x = patch.x;
  if (Number.isFinite(patch.y)) card.y = patch.y;
  if (patch.detail) card.detail = { ...card.detail, ...patch.detail };
  return card;
}

export function removeCard(id) {
  const map = activeMap();
  if (!map) return;
  const target = String(id);
  map.cards = map.cards.filter(card => card.id !== target);
  const dropped = map.connections.filter(edge => edge.from === target || edge.to === target);
  map.connections = map.connections.filter(edge => edge.from !== target && edge.to !== target);
  for (const edge of dropped) delete state.relations[edge.id];
}

export function moveCardTo(id, x, y) {
  const card = findCard(id);
  if (!card) return;
  card.x = x;
  card.y = y;
}

/** Bir nechta kartani birdaniga ko'chiradi (avtomatik joylash uchun). */
export function applyPositions(positions) {
  for (const [id, point] of positions) moveCardTo(id, point.x, point.y);
}

/* -------------------------------- aloqalar ------------------------------- */

export function connect(fromId, toId) {
  const map = activeMap();
  if (!map) return null;
  const from = String(fromId);
  const to = String(toId);
  if (from === to) return null;
  if (!findCard(from) || !findCard(to)) return null;

  const exists = map.connections.some(
    edge => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from)
  );
  if (exists) return null;

  const edge = { id: uid(), from, to };
  map.connections.push(edge);
  return edge;
}

export function disconnect(id) {
  const map = activeMap();
  if (!map) return;
  const target = String(id);
  map.connections = map.connections.filter(edge => edge.id !== target);
  delete state.relations[target];
}

export const relationFor = connectionId => state.relations[String(connectionId)] ?? null;

export function setRelation(connectionId, typeId) {
  const type = RELATION_TYPES.find(item => item.id === typeId);
  if (!type) return null;
  state.relations[String(connectionId)] = { type: type.id, label: type.label };
  return state.relations[String(connectionId)];
}

export function clearRelation(connectionId) {
  delete state.relations[String(connectionId)];
}

/* -------------------------------- makonlar ------------------------------- */

export function setTitle(title) {
  const map = activeMap();
  if (map)
    map.title =
      String(title ?? '')
        .trim()
        .slice(0, 160) || 'Yangi makon';
}

export function setSpace(space) {
  const map = activeMap();
  if (map) map.space = Object.hasOwn(SPACES, space) ? space : 'paper';
}

export function createMap() {
  const map = emptyMap();
  state.maps[map.id] = map;
  state.activeId = map.id;
  return map;
}

export function switchMap(id) {
  if (!Object.hasOwn(state.maps, String(id))) return false;
  state.activeId = String(id);
  return true;
}

export function renameMap(id, title) {
  const map = state.maps[String(id)];
  if (!map) return false;
  map.title =
    String(title ?? '')
      .trim()
      .slice(0, 160) || 'Yangi makon';
  map.updatedAt = nowIso();
  return true;
}

/**
 * Makonni o'chiradi va TOMBSTONE qoldiradi.
 *
 * Tombstone bo'lmasa, keyingi sinxronizatsiya o'chirilgan makonni serverdan
 * qaytarib keltiradi — foydalanuvchi uchun tushunarsiz xatti-harakat.
 */
export function deleteMap(id) {
  const target = String(id);
  if (!Object.hasOwn(state.maps, target)) return false;
  if (Object.keys(state.maps).length === 1) return false;

  for (const edge of state.maps[target].connections) delete state.relations[edge.id];
  delete state.maps[target];
  state.tombstones[target] = nowIso();

  if (state.activeId === target) state.activeId = Object.keys(state.maps)[0];
  return true;
}

/* --------------------------- masofaviy birlashuv -------------------------- */

/**
 * Serverdan kelgan makonlarni lokal holat bilan birlashtiradi.
 * Tombstone'lar hurmat qilinadi: o'chirilgan makon qaytib kelmaydi.
 * @returns {boolean} holat o'zgardimi
 */
export function mergeRemote(remoteMaps = [], remoteTombstones = {}) {
  let changed = false;

  for (const [id, iso] of Object.entries(remoteTombstones ?? {})) {
    const key = String(id);
    if (!state.tombstones[key] || state.tombstones[key] < iso) {
      state.tombstones[key] = iso;
      changed = true;
    }
    if (Object.hasOwn(state.maps, key) && (state.maps[key].updatedAt ?? '') <= iso) {
      delete state.maps[key];
      changed = true;
    }
  }

  for (const raw of remoteMaps) {
    const map = normalizeMap(raw);
    const tombstone = state.tombstones[map.id];
    // Server bizga o'chirilgan makonni qaytarsa — e'tiborsiz qoldiramiz.
    if (tombstone && map.updatedAt <= tombstone) continue;

    const local = state.maps[map.id];
    if (!local || (local.updatedAt ?? '') < map.updatedAt) {
      state.maps[map.id] = map;
      changed = true;
    }
  }

  if (!Object.keys(state.maps).length) {
    const fresh = emptyMap('map-default');
    state.maps[fresh.id] = fresh;
    state.activeId = fresh.id;
    changed = true;
  } else if (!Object.hasOwn(state.maps, state.activeId)) {
    state.activeId = Object.keys(state.maps)[0];
    changed = true;
  }

  if (changed) persist({ touch: false });
  return changed;
}

/* --------------------------------- tarix --------------------------------- */

const snapshotOf = () => JSON.stringify({ maps: state.maps, activeId: state.activeId });

function pushHistory() {
  const current = snapshotOf();
  const previous = lastSnapshot;
  lastSnapshot = current;

  if (!previous || previous === current) return;

  const history = readJson(HISTORY_KEY, []);
  if (!Array.isArray(history)) return;
  if (history.at(-1) === previous) return;

  history.push(previous);
  // Ham son, ham bayt bo'yicha cheklaymiz — ilgari 30 ta to'liq nusxa
  // localStorage kvotasini yeb, asosiy yozuvni ham buzardi.
  while (history.length > HISTORY_MAX_ENTRIES) history.shift();
  while (history.length > 1 && history.join('').length > HISTORY_MAX_BYTES) history.shift();

  writeJson(HISTORY_KEY, history, { silent: true });
}

export const canUndo = () => (readJson(HISTORY_KEY, [])?.length ?? 0) > 0;

/** Oxirgi holatga qaytaradi. @returns {boolean} qaytarildimi */
export function undo() {
  const history = readJson(HISTORY_KEY, []);
  if (!Array.isArray(history) || !history.length) return false;

  const snapshot = history.pop();
  writeJson(HISTORY_KEY, history, { silent: true });

  let parsed;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    return false;
  }

  state.maps = {};
  for (const [key, value] of Object.entries(parsed.maps ?? {})) {
    const map = normalizeMap(value, key);
    state.maps[map.id] = map;
  }
  if (!Object.keys(state.maps).length) {
    const fresh = emptyMap('map-default');
    state.maps[fresh.id] = fresh;
  }
  state.activeId = Object.hasOwn(state.maps, parsed.activeId)
    ? parsed.activeId
    : Object.keys(state.maps)[0];

  recordingHistory = false;
  const result = persist({ touch: false });
  recordingHistory = true;
  lastSnapshot = snapshotOf();
  return result.ok;
}

/** Testlar uchun: holatni to'liq almashtiradi. */
export function _setStateForTests(next) {
  state.maps = next.maps ?? {};
  state.activeId = next.activeId ?? Object.keys(state.maps)[0] ?? '';
  state.relations = next.relations ?? {};
  state.tombstones = next.tombstones ?? {};
  lastSnapshot = snapshotOf();
}
