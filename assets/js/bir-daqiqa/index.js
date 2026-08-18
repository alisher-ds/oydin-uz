/**
 * Bir daqiqa — 60 soniyalik erkin yozuv va undan keyingi qisqa tahlil.
 *
 * Tuzatilgan kamchilik: matn bo'sh bo'lsa, ilgari oldindan yozilgan namuna
 * qo'yilib, tahlil "Sizning boshingizdagi…" deb taqdim etilardi. Endi bo'sh
 * holat halol ko'rsatiladi va namunani foydalanuvchining o'zi tanlaydi.
 */

import { $, $$, el } from '../core/index.js';
import { centralityScores, embedTexts, getEmbedder } from './embed.js';

const DURATION = 60;
const MAX_LINES = 6;
const POSITIONS = [
  [10, 25],
  [36, 4],
  [70, 23],
  [13, 68],
  [49, 61],
  [77, 70]
];

const SAMPLE = `Portfolio qilishim kerak, lekin nimadan boshlashni bilmayman. Universitetga hujjat topshirish yaqin. Vaqt yetmayotgandek. GitHub'ni ham o'rganishim kerak. Ertaga dars bor edi, vazifasini qilishim kerak.`;

export function initBirDaqiqa() {
  const dump = $('#dump');
  if (!dump) return null;

  let remaining = DURATION;
  let clock = 0;
  let running = false;

  const show = id => {
    for (const screen of $$('.screen')) screen.classList.toggle('active', screen.id === id);
  };

  const countWords = text => text.trim().split(/\s+/).filter(Boolean).length;

  function stopClock() {
    clearInterval(clock);
    clock = 0;
    running = false;
  }

  function start() {
    // Har doim avvalgi taymerni to'xtatamiz — ikkita interval ishlab ketmasin.
    stopClock();
    show('write');
    dump.value = '';
    $('#count').textContent = '0';
    remaining = DURATION;
    $('#timer').textContent = '01:00';
    running = true;
    dump.focus();

    clock = setInterval(() => {
      remaining -= 1;
      $('#timer').textContent =
        remaining >= 60 ? '01:00' : `00:${String(Math.max(remaining, 0)).padStart(2, '0')}`;
      if (remaining <= 0) void reveal();
    }, 1000);
  }

  function renderEmpty(box) {
    box.replaceChildren();
    const empty = el('div', { class: 'reveal-empty' });
    empty.append(
      el('p', { text: 'Hech narsa yozilmadi — tahlil qilishga hali material yo‘q.' }),
      el('small', { text: 'Bir daqiqa yozib ko‘ring, keyin shu yerda o‘z fikringizni ko‘rasiz.' })
    );

    const again = el('button', { type: 'button', class: 'cta', text: 'Yana urinib ko‘rish' });
    again.addEventListener('click', start);

    const demo = el('button', { type: 'button', class: 'ghost-button', text: 'Namunada ko‘rsat' });
    demo.addEventListener('click', () => {
      dump.value = SAMPLE;
      void reveal({ force: true });
    });

    empty.append(el('div', { class: 'reveal-empty-actions' }, [again, demo]));
    box.append(empty);

    $('#signalTitle').textContent = 'Hali signal yo‘q.';
    $('#signalBody').textContent =
      'Bu ekran siz yozgan narsaning aks-sadosini ko‘rsatadi. Bo‘sh matndan aks-sado chiqmaydi.';
  }

  async function reveal({ force = false } = {}) {
    if (!running && !force) return;
    stopClock();
    show('reveal');

    const box = $('#constellation');
    const text = dump.value.trim();
    if (!text) {
      renderEmpty(box);
      return;
    }

    const lines = text
      .split(/[.!?\n]+/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, MAX_LINES);

    if (!lines.length) {
      renderEmpty(box);
      return;
    }

    box.replaceChildren(
      el('p', { class: 'loading', text: 'Fikrlar orasidagi bog‘liqlikni topyapmiz…' })
    );

    let centralIndex = Math.min(lines.length - 1, Math.floor(lines.length / 2));
    let relatedCount = 0;
    let usedFallback = false;

    try {
      const extractor = await getEmbedder();
      const vectors = await embedTexts(extractor, lines);
      const scores = centralityScores(vectors);
      centralIndex = scores.indexOf(Math.max(...scores));
      relatedCount = vectors.filter(
        (vector, i) =>
          i !== centralIndex &&
          vector.reduce((sum, value, k) => sum + value * vectors[centralIndex][k], 0) > 0.45
      ).length;
    } catch (error) {
      console.warn('Semantik tahlil ishlamadi, oddiy usulga o‘tildi:', error);
      usedFallback = true;
    }

    box.replaceChildren();
    lines.forEach((line, index) => {
      const node = el('div', {
        class: `node ${index === centralIndex ? 'major' : ''}`,
        text: line
      });
      node.style.left = `${POSITIONS[index][0]}%`;
      node.style.top = `${POSITIONS[index][1]}%`;
      node.style.animationDelay = `${index * 0.12}s`;
      box.append(node);
    });

    const central = lines[centralIndex] ?? lines[0] ?? '';
    $('#signalTitle').textContent = central.length > 70 ? `${central.slice(0, 67)}…` : central;
    $('#signalBody').textContent = usedFallback
      ? 'Semantik tahlil yuklanmadi, shuning uchun bu shunchaki matningizning o‘rtasidagi fikr. Faqat boshlashning o‘zi bosimni pasaytiradi.'
      : relatedCount > 0
        ? `${relatedCount} ta boshqa fikringiz ham shu mavzu atrofida aylanyapti — demak bu hozir boshingizda eng ko‘p joy egallagan narsa.`
        : 'Bu fikr boshqalardan ajralib turibdi — ehtimol shuni birinchi bo‘lib hal qilish yengillik beradi.';
  }

  $('#begin')?.addEventListener('click', start);
  $('#finish')?.addEventListener('click', () => void reveal());
  $('#again')?.addEventListener('click', start);
  dump.addEventListener('input', () => {
    $('#count').textContent = String(countWords(dump.value));
  });

  return { start, reveal };
}
