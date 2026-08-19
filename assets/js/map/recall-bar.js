/**
 * Eski fikrni qaytaruvchi chiziq.
 *
 * Makon ochilganda bitta unutilgan fikrni yuzaga chiqaradi. Bezovta
 * qilmasligi uchun qat'iy chegaralar bor (qoidalar `core/recall.js` da):
 * kuniga bir marta, faqat ancha eski fikrlar, va mos narsa bo'lmasa
 * chiziq umuman ko'rinmaydi.
 *
 * Bildirishnoma emas — sahifadagi bitta jimgina qator. Foydalanuvchi
 * uni yopsa, bugun boshqa qaytmaydi.
 */

import { $, el, readJson, writeJson } from '../core/index.js';
import { RECALL_KEY, humanAge, markShown, pickRecall } from '../core/recall.js';

export function createRecallBar({ onOpenMap, onPlace }) {
  const host = $('#recall');
  if (!host) return { refresh: () => {} };

  function hide() {
    host.hidden = true;
    host.replaceChildren();
  }

  /**
   * Qaror qabul qilinganini bildiradi.
   *
   * Bu shunchaki test uchun emas: chiziq ilova ishga tushgandan keyin
   * paydo bo'ladi, ya'ni "hali qaror qilinmagan" va "ko'rsatadigan narsa
   * yo'q" holatlari tashqaridan bir xil ko'rinadi. Belgi ularni ajratadi.
   */
  const markDecided = () => {
    host.dataset.recall = 'decided';
  };

  function show() {
    const state = readJson(RECALL_KEY, {}) ?? {};
    const item = pickRecall({
      notes: readJson('oydin-oqim', []) ?? [],
      maps: readJson('oydin-maps', {}) ?? {},
      state
    });

    if (!item) {
      hide();
      markDecided();
      return;
    }

    host.replaceChildren();
    host.hidden = false;

    const label = el('p', { class: 'recall-label', text: humanAge(item.ageDays).toUpperCase() });
    const text = el('p', { class: 'recall-text' });
    text.textContent = item.text;

    const actions = el('div', { class: 'recall-actions' });

    if (item.source === 'card' && item.mapId) {
      const openButton = el('button', { type: 'button', class: 'soft-button', text: 'Ochish' });
      openButton.addEventListener('click', () => {
        onOpenMap(item.mapId, item.id);
        hide();
      });
      actions.append(openButton);
    } else {
      const placeButton = el('button', { type: 'button', class: 'soft-button', text: 'Makonga' });
      placeButton.addEventListener('click', () => {
        onPlace(item.text, item.id);
        hide();
      });
      actions.append(placeButton);
    }

    const dismiss = el('button', {
      type: 'button',
      class: 'icon-button',
      'aria-label': 'Yopish',
      text: '×'
    });
    dismiss.addEventListener('click', hide);
    actions.append(dismiss);

    host.append(el('div', { class: 'recall-body' }, [label, text]), actions);

    // Ko'rsatilgani darhol qayd etiladi: foydalanuvchi hech narsa
    // bosmasa ham, ertaga boshqa fikr chiqishi kerak.
    writeJson(RECALL_KEY, markShown(state, item.id));
    markDecided();
  }

  return { refresh: show, hide };
}
