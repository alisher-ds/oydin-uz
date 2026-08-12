(() => {
  const STORAGE_KEY = 'oydin-ai-chat-v1';
  const MAX_MESSAGES = 16;
  const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
  const save = messages => localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  const $ = s => document.querySelector(s);

  async function send(messages) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: messages.slice(-MAX_MESSAGES) })
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || 'Oydin AI hozircha javob bera olmadi.');
    return data;
  }

  function mount() {
    if (!$('#oydinAiOpen')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'oydinAiDialog';
    dialog.innerHTML = `<div class="ai-dialog">
      <button class="dialog-close" type="button" aria-label="Yopish">×</button>
      <p class="kicker">OYDIN / SUHBAT</p>
      <h2>Fikringizni davom ettiring.</h2>
      <p class="dialog-hint">Bu yerda savol-javobdan ko‘ra fikrlash muhim. Oydin kerak bo‘lsa savol beradi, kerak bo‘lsa fikringizni ochib beradi.</p>
      <div class="ai-messages" id="aiMessages"></div>
      <form class="ai-form" id="aiForm"><textarea id="aiInput" maxlength="1800" placeholder="Nimani o‘ylayapsiz?" required></textarea><button class="primary-button" type="submit">Davom etish <span>→</span></button></form>
      <p class="ai-status" id="aiStatus" aria-live="polite"></p>
    </div>`;
    document.body.append(dialog);
    const close = dialog.querySelector('.dialog-close');
    const messagesEl = $('#aiMessages'), form = $('#aiForm'), input = $('#aiInput'), status = $('#aiStatus');
    let messages = load();
    const render = () => { messagesEl.innerHTML = messages.map(m => `<div class="ai-message ${m.role === 'assistant' ? 'is-ai' : 'is-user'}"><span>${m.role === 'assistant' ? 'Oydin' : 'Siz'}</span><p>${escapeHtml(m.text)}</p></div>`).join(''); messagesEl.scrollTop = messagesEl.scrollHeight; };
    const escapeHtml = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    $('#oydinAiOpen').addEventListener('click', () => { render(); dialog.showModal(); setTimeout(() => input.focus(), 30); });
    close.onclick = () => dialog.close();
    form.addEventListener('submit', async e => {
      e.preventDefault(); const text = input.value.trim(); if (!text) return;
      messages.push({ role: 'user', text }); save(messages); render(); input.value = ''; input.disabled = true; status.textContent = 'Oydin fikrni ko‘rib chiqyapti…';
      try {
        const result = await send(messages); const reply = String(result.reply || '').trim();
        if (!reply) throw new Error('Javob bo‘sh qaytdi.');
        messages.push({ role: 'assistant', text: reply }); save(messages); render(); status.textContent = result.usedAI ? 'AI bilan davom etyapmiz.' : '';
      } catch (error) { status.textContent = error.message; }
      finally { input.disabled = false; input.focus(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
