/**
 * Oydin suhbat oynasi.
 *
 * Endi so'rov vault tokeni bilan yuboriladi — server AI xarajatini
 * anonim trafikka emas, aniq vaultga bog'lay oladi.
 */

import { $, EVENTS, el, on } from '../core/index.js';
import { getToken, sync } from '../sync/client.js';
import { track } from '../core/app.js';

const STORAGE_KEY = 'oydin-ai-chat-v1';
const MAX_MESSAGES = 16;
const MAX_INPUT = 1800;

const load = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(m => m && typeof m.text === 'string') : [];
  } catch {
    return [];
  }
};

const persist = messages => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  } catch {
    /* suhbat tarixi kritik emas — kvota tugasa e'tiborsiz qoldiramiz */
  }
};

async function request(messages) {
  const headers = { 'content-type': 'application/json' };
  const token = getToken();
  if (token) headers['X-Oydin-Vault'] = token;

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: JSON.stringify({ messages: messages.slice(-MAX_MESSAGES) })
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    /* bo'sh javob — quyida umumiy xato beriladi */
  }

  if (response.status === 401) {
    // Vault hali yaratilmagan bo'lishi mumkin — bir marta yaratib ko'ramiz.
    await sync();
    throw new Error('Ulanish tayyorlanmoqda — bir soniyadan keyin qayta urinib ko‘ring.');
  }
  if (response.status === 429) {
    throw new Error('Juda ko‘p so‘rov yuborildi. Bir daqiqadan keyin urinib ko‘ring.');
  }
  if (!response.ok) throw new Error(data.error || 'Oydin hozircha javob bera olmadi.');
  return data;
}

export function initChat() {
  const trigger = $('#oydinAiOpen');
  if (!trigger) return null;

  const dialog = el('dialog', { id: 'oydinAiDialog' });
  dialog.innerHTML = `
    <div class="ai-dialog">
      <button class="dialog-close" type="button" data-close aria-label="Yopish">×</button>
      <p class="kicker">OYDIN / SUHBAT</p>
      <h2>Fikringizni davom ettiring.</h2>
      <p class="dialog-hint">
        Bu yerda savol-javobdan ko‘ra fikrlash muhim. Oydin kerak bo‘lsa savol
        beradi, kerak bo‘lsa fikringizni ochib beradi.
      </p>
      <div class="ai-messages" id="aiMessages" role="log" aria-live="polite" aria-label="Suhbat"></div>
      <form class="ai-form" id="aiForm">
        <label class="visually-hidden" for="aiInput">Xabaringiz</label>
        <textarea id="aiInput" maxlength="${MAX_INPUT}" placeholder="Nimani o‘ylayapsiz?" required></textarea>
        <button class="primary-button" type="submit">Davom etish <span aria-hidden="true">→</span></button>
      </form>
      <p class="ai-status" id="aiStatus" role="status"></p>
    </div>`;
  document.body.append(dialog);

  const messagesEl = dialog.querySelector('#aiMessages');
  const form = dialog.querySelector('#aiForm');
  const input = dialog.querySelector('#aiInput');
  const status = dialog.querySelector('#aiStatus');
  let messages = load();

  function render() {
    messagesEl.replaceChildren();
    for (const message of messages) {
      const isAssistant = message.role === 'assistant';
      const bubble = el('div', { class: `ai-message ${isAssistant ? 'is-ai' : 'is-user'}` });
      // `textContent` — HTML in'yeksiyasi uchun yo'l yo'q.
      bubble.append(
        el('span', { text: isAssistant ? 'Oydin' : 'Siz' }),
        el('p', { text: message.text })
      );
      messagesEl.append(bubble);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  trigger.addEventListener('click', () => {
    render();
    if (!dialog.open) dialog.showModal();
    setTimeout(() => input.focus(), 30);
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    messages.push({ role: 'user', text });
    track('ai');
    messages = messages.slice(-MAX_MESSAGES);
    persist(messages);
    render();

    // Lokal havola: `require-atomic-updates` uchun ham, o'qish uchun ham aniqroq.
    const field = input;
    field.value = '';
    field.disabled = true;
    status.textContent = 'Oydin fikrni ko‘rib chiqyapti…';
    status.dataset.tone = 'pending';

    try {
      const result = await request(messages);
      const reply = String(result.reply || '').trim();
      if (!reply) throw new Error('Javob bo‘sh qaytdi.');
      messages.push({ role: 'assistant', text: reply });
      messages = messages.slice(-MAX_MESSAGES);
      persist(messages);
      render();
      status.textContent = '';
      status.dataset.tone = 'ok';
    } catch (error) {
      // Javob kelmagan bo'lsa, foydalanuvchi xabari suhbatda javobsiz
      // osilib qolmasligi kerak: uni olib tashlaymiz va matnni maydonga
      // qaytaramiz, shunda qayta yuborish bir bosishda bo'ladi. Aks holda
      // har bir urinish yangi nusxa qoldiradi va ular tarix sifatida
      // keyingi so'rovga ham ketaveradi.
      const last = messages.at(-1);
      if (last?.role === 'user' && last.text === text) messages.pop();
      persist(messages);
      render();
      if (!field.value.trim()) field.value = text;
      status.textContent = error.message;
      status.dataset.tone = 'error';
    } finally {
      field.disabled = false;
      field.focus();
    }
  });

  on(globalThis, EVENTS.sync, () => {
    if (status.dataset.tone === 'error' && getToken()) status.textContent = '';
  });

  return { open: () => dialog.showModal() };
}
