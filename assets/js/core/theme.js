/**
 * Mavzu (yorug'/tungi) boshqaruvi.
 *
 * Tuzatilgan kamchiliklar:
 *  - operatsion tizim sozlamasi (`prefers-color-scheme`) endi hisobga olinadi;
 *  - foydalanuvchi tanlagan `light` rejim tizimning dark sozlamasi bilan ustma-ust kelmaydi;
 *  - `<meta name="theme-color">` mavzu bilan birga yangilanadi;
 *  - tugma holati `aria-pressed` orqali yordamchi texnologiyalarga uzatiladi.
 */

import { $, $$, readRaw, writeRaw } from './index.js';

const KEY = 'oydin-theme';
const COLORS = { light: '#f6f2ea', night: '#20221f' };

const systemPrefersDark = () =>
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

/** Saqlangan tanlov, aks holda tizim sozlamasi. */
export function currentTheme() {
  const saved = readRaw(KEY);
  if (saved === 'night' || saved === 'light') return saved;
  return systemPrefersDark() ? 'night' : 'light';
}

function paint(theme) {
  const night = theme === 'night';

  // Muhim: `tokens.css` ning prefers-color-scheme qoidasi faqat `.night`
  // yoki `.light` bo'lmagan bodyga tegishli. Avval faqat `.night` qo'yilganida,
  // foydalanuvchi `light`ni tanlagan taqdirda ham OS dark rejimi uni qayta
  // qorong'ilashtirardi. Endi ikkala holat ham aniq belgilanadi.
  document.body.classList.toggle('night', night);
  document.body.classList.toggle('light', !night);
  document.documentElement.style.colorScheme = night ? 'dark' : 'light';

  let meta = $('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = COLORS[theme];

  for (const button of $$('#themeToggle')) {
    button.setAttribute('aria-pressed', String(night));
    button.setAttribute('aria-label', night ? 'Yorug‘ rejimga o‘tish' : 'Tungi rejimga o‘tish');
  }
}

/** Mavzuni almashtiradi va tanlovni saqlaydi. */
export function toggleTheme() {
  const next = currentTheme() === 'night' ? 'light' : 'night';
  writeRaw(KEY, next);
  paint(next);
  return next;
}

/** Sahifa yuklanganda mavzuni o'rnatadi va tugmani ulaydi. */
export function initTheme() {
  paint(currentTheme());
  for (const button of $$('#themeToggle')) {
    button.addEventListener('click', toggleTheme);
  }

  // Foydalanuvchi o'z tanlovini qilmagan bo'lsa, tizim o'zgarishiga ergashamiz.
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (readRaw(KEY) == null) paint(currentTheme());
  });
}
