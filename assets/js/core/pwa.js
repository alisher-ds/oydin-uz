/**
 * Service worker'ni ro'yxatdan o'tkazish.
 *
 * Buning yagona maqsadi — tezlik va oflayn ishlash: qobiq keshdan
 * ochilgani uchun ilova tarmoqni kutmaydi. Fikr kelganda kutish esa
 * fikrni yo'qotish demak.
 */
import { track } from './stat.js';

export function registerServiceWorker() {
  // Bosh ekranga o'rnatilgani — Oydin uchun eng muhim signal: odam
  // saytni bir marta emas, doim ishlatmoqchi degani.
  globalThis.addEventListener('appinstalled', () => track('ornatildi'));

  if (!('serviceWorker' in navigator)) return;
  // Ro'yxatdan o'tkazish sahifa yuklanishini sekinlashtirmasin.
  globalThis.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('Service worker ro‘yxatdan o‘tmadi:', error);
    });
  });
}
