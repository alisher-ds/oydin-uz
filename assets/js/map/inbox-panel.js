/**
 * Kiruvchi paneli — `/tez` da yozilgan fikrlarni makonga taqsimlash joyi.
 *
 * Yozish va joylashtirish ataylab ajratilgan: fikr kelganda "qaysi
 * makonga?" degan savol fikrni yo'qotadi. Shu sababli fikrlar avval
 * Kiruvchiga tushadi, keyin shu yerdan xotirjam taqsimlanadi.
 *
 * Panel Kiruvchi bo'sh bo'lsa umuman ko'rinmaydi — ishlatilmaydigan
 * tugma faqat ekranni to'ldiradi.
 */

import { $, el, isTypingTarget, on, readInbox, removeFromInbox } from '../core/index.js';

export function createInboxPanel({ onPlace }) {
  const button = $('#railInbox');
  const badge = $('#railInboxCount');
  let sheet = null;

  function refresh() {
    const total = readInbox().length;
    if (button) button.hidden = total === 0;
    if (badge) badge.textContent = String(total);
    return total;
  }

  function close() {
    if (!sheet) return;
    sheet.close();
    sheet.remove();
    sheet = null;
  }

  /** Bitta fikrni makonga ko'chiradi va Kiruvchidan olib tashlaydi. */
  function place(entry) {
    onPlace(entry.text);
    removeFromInbox(entry.id);
  }

  function open() {
    close();
    const entries = readInbox();
    if (!entries.length) return;

    sheet = el('dialog', { class: 'inbox-panel', id: 'inboxPanel' });

    const head = el('div', { class: 'inbox-head' });
    const closeButton = el('button', {
      type: 'button',
      class: 'dialog-close',
      'aria-label': 'Yopish',
      text: '×'
    });
    closeButton.addEventListener('click', close);
    head.append(
      el('div', {}, [
        el('p', { class: 'kicker', text: 'KIRUVCHI' }),
        el('p', {
          class: 'inbox-hint',
          text: 'Tez yozilgan fikrlar. Har birini makonga qo‘shing yoki o‘chiring.'
        })
      ]),
      closeButton
    );

    const list = el('div', { class: 'inbox-list' });

    for (const entry of entries) {
      const row = el('div', { class: 'inbox-item' });
      const text = el('p', { class: 'inbox-text' });
      text.textContent = entry.text;

      const add = el('button', { type: 'button', class: 'inbox-add', text: 'Makonga qo‘shish' });
      add.addEventListener('click', () => {
        place(entry);
        refresh();
        readInbox().length ? open() : close();
      });

      const drop = el('button', {
        type: 'button',
        class: 'inbox-drop',
        'aria-label': 'Bu fikrni o‘chirish',
        text: '×'
      });
      drop.addEventListener('click', () => {
        removeFromInbox(entry.id);
        refresh();
        readInbox().length ? open() : close();
      });

      row.append(text, el('div', { class: 'inbox-actions' }, [add, drop]));
      list.append(row);
    }

    const all = el('button', {
      type: 'button',
      class: 'inbox-all',
      text: `Hammasini qo‘shish (${entries.length})`
    });
    all.addEventListener('click', () => {
      for (const entry of entries) place(entry);
      refresh();
      close();
    });

    sheet.append(head, list, el('div', { class: 'inbox-foot' }, [all]));
    document.body.append(sheet);
    sheet.addEventListener('cancel', event => {
      event.preventDefault();
      close();
    });
    sheet.showModal();
  }

  button?.addEventListener('click', open);

  // `i` — Kiruvchini ochish. Dialog ochiq bo'lsa yoki matn yozilayotgan
  // bo'lsa ishlamaydi (mavjud qisqartmalar bilan bir xil qoida).
  on(document, 'keydown', event => {
    if (event.key !== 'i' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target) || document.querySelector('dialog[open]')) return;
    if (!readInbox().length) return;
    event.preventDefault();
    open();
  });

  refresh();
  return { refresh, open, close };
}
