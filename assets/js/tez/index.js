/**
 * Tez yozish sahifasi.
 *
 * Qoida: fikr hech qachon yo'qolmasin. Shuning uchun
 *  - matn har bosishda qoralamaga yoziladi (sahifa yopilsa ham qoladi);
 *  - saqlash muvaffaqiyatsiz bo'lsa, matn maydonda qoladi va xato aytiladi;
 *  - Enter darhol saqlaydi, Shift+Enter yangi qator qo'shadi.
 */

import { $, addToInbox, on, readInbox, removeFromInbox } from '../core/index.js';

const DRAFT_KEY = 'oydin-tez-draft-v1';
const RECENT_SHOWN = 8;

/** Ovoz bilan yozish brauzerda bormi. */
const speechApi = () => globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;

export function initTez() {
  const form = $('#tezForm');
  const field = $('#fikr');
  const state = $('#tezState');
  const list = $('#tezList');
  const count = $('#tezCount');
  const mic = $('#tezMic');
  if (!form || !field) return;

  let statusTimer = 0;

  const say = (text, sticky = false) => {
    if (!state) return;
    state.textContent = text;
    clearTimeout(statusTimer);
    if (text && !sticky) statusTimer = setTimeout(() => (state.textContent = ''), 2200);
  };

  function render() {
    const entries = readInbox();
    if (count) {
      count.textContent = entries.length
        ? `Kiruvchi — ${entries.length} ta fikr`
        : 'Kiruvchi bo‘sh';
    }
    if (!list) return;

    list.replaceChildren();
    for (const entry of entries.slice(0, RECENT_SHOWN)) {
      const item = document.createElement('li');
      item.className = 'tez-item';
      const body = document.createElement('p');
      body.textContent = entry.text;
      item.append(body);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Bu fikrni o‘chirish');
      remove.addEventListener('click', () => {
        removeFromInbox(entry.id);
        render();
        say('O‘chirildi');
      });

      item.append(remove);
      list.append(item);
    }
  }

  function save() {
    const text = field.value;
    const result = addToInbox(text);

    if (!result.ok) {
      if (result.reason === 'empty') {
        field.focus();
        return;
      }
      // Matnni TOZALAMAYMIZ: saqlanmagan fikr yo'qolmasligi kerak.
      say('Saqlanmadi — joy tugagan bo‘lishi mumkin', true);
      return;
    }

    field.value = '';
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* muhim emas */
    }
    render();
    say('Kiruvchiga qo‘shildi');
    field.focus();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    save();
  });

  // Enter — saqlash, Shift+Enter — yangi qator. Telefon klaviaturasida
  // Enter odatda yangi qator bo'lgani uchun "Saqlash" tugmasi ham bor.
  on(field, 'keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      save();
    }
  });

  // Qoralama: sahifa tasodifan yopilsa yozilgan matn qolsin.
  on(field, 'input', () => {
    try {
      localStorage.setItem(DRAFT_KEY, field.value);
    } catch {
      /* joy yo'q — qoralama ikkinchi darajali */
    }
  });

  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) field.value = draft;
  } catch {
    /* o'qib bo'lmadi */
  }

  initMic({ mic, field, say });
  render();
  field.focus();
}

/**
 * Ovoz bilan yozish. Brauzer qo'llamasa, tugma umuman ko'rsatilmaydi —
 * ishlamaydigan tugma ishonchni yo'qotadi.
 */
function initMic({ mic, field, say }) {
  const Recognition = speechApi();
  if (!mic || !Recognition) return;

  mic.hidden = false;
  let recognition = null;

  const stop = () => {
    recognition?.stop();
    recognition = null;
    mic.setAttribute('aria-pressed', 'false');
  };

  mic.addEventListener('click', () => {
    if (recognition) {
      stop();
      return;
    }

    recognition = new Recognition();
    recognition.lang = 'uz-UZ';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.addEventListener('result', event => {
      let heard = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        heard += event.results[i][0].transcript;
      }
      if (!heard.trim()) return;
      field.value = field.value ? `${field.value.trimEnd()} ${heard.trim()}` : heard.trim();
      field.dispatchEvent(new Event('input'));
    });

    recognition.addEventListener('error', event => {
      stop();
      say(
        event.error === 'not-allowed'
          ? 'Mikrofonga ruxsat berilmadi'
          : 'Ovozni tanib bo‘lmadi — yozib ko‘ring'
      );
    });

    recognition.addEventListener('end', () => {
      if (recognition) stop();
    });

    try {
      recognition.start();
      mic.setAttribute('aria-pressed', 'true');
      say('Gapiring…', true);
    } catch {
      stop();
      say('Ovoz yozish boshlanmadi');
    }
  });
}
