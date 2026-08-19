/** Oydin mavzu boshqaruvi. */

import { $, $$, readRaw, writeRaw } from './index.js';

const KEY = 'oydin-theme';
const COLORS = { light: '#f6f2ea', night: '#20221f' };
const PAGE_DOTS = {
  light: 'radial-gradient(#77756e35 0.7px, transparent 0.7px)',
  night: 'radial-gradient(#aaa99f25 0.7px, transparent 0.7px)'
};

const systemPrefersDark = () =>
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function currentTheme() {
  const saved = readRaw(KEY);
  if (saved === 'night' || saved === 'light') return saved;
  return systemPrefersDark() ? 'night' : 'light';
}

function paint(theme) {
  const night = theme === 'night';
  const root = document.documentElement;
  const body = document.body;

  // Theme state is exposed on BOTH root and body so every page/component has
  // one unambiguous source of truth. The root attribute also survives CSS
  // selectors that are not scoped to body.
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  body.classList.toggle('night', night);
  body.classList.toggle('light', !night);

  // base.css historically declared its own background-image after tokens.css.
  // Set the page background explicitly here so the entire viewport changes,
  // not just the CSS variables used by child components.
  body.style.backgroundColor = night ? '#242521' : '#ebe7de';
  body.style.backgroundImage = PAGE_DOTS[theme];
  body.style.backgroundSize = '10px 10px';

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

export function toggleTheme() {
  const next = currentTheme() === 'night' ? 'light' : 'night';
  writeRaw(KEY, next);
  paint(next);
  return next;
}

export function initTheme() {
  paint(currentTheme());

  for (const button of $$('#themeToggle')) {
    // Avoid duplicate listeners if a page initializes its theme module twice.
    if (button.dataset.themeBound === '1') continue;
    button.dataset.themeBound = '1';
    button.addEventListener('click', toggleTheme);
  }

  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (readRaw(KEY) == null) paint(currentTheme());
  });
}
