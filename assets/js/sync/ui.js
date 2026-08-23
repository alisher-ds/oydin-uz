/**
 * Sinxronizatsiya holati va vault (qurilmalararo kalit) interfeysi.
 *
 * Ilgari `oydin:sync` hodisasi yuborilardi, lekin uni HECH KIM tinglamasdi —
 * sinxronizatsiya jimgina to'xtab qolardi. Vault tokenini ko'rish yoki boshqa
 * qurilmaga kiritish imkoni ham yo'q edi, ya'ni funksiyadan foydalanib
 * bo'lmasdi.
 */

import { $, EVENTS, el, escapeHtml } from '../core/index.js';
import { setStatsEnabled, statsOptedOut } from '../core/app.js';
import {
  enableSync,
  forgetToken,
  getToken,
  lastSyncedAt,
  revokeVault,
  rotateToken,
  sync,
  useToken
} from './client.js';

const LABELS = {
  idle: { text: 'lokal', title: 'O‘zgarishlar shu qurilmada saqlanadi.' },
  syncing: { text: 'sinxronlanmoqda…', title: 'Server bilan almashinyapmiz.' },
  ok: { text: 'sinxronlandi', title: 'Barcha o‘zgarishlar serverda.' },
  offline: { text: 'oflayn', title: 'Internet yo‘q — ma’lumot shu qurilmada xavfsiz.' },
  throttled: { text: 'kutyapmiz', title: 'Juda ko‘p so‘rov yuborildi, biroz kutamiz.' },
  error: { text: 'sinxronlanmadi', title: 'Server bilan bog‘lanib bo‘lmadi.' }
};

function mountIndicator() {
  const existing = $('#syncStatus');
  if (existing) return existing;

  const host = $('.topbar-actions');
  if (!host) return null;

  const button = el('button', {
    type: 'button',
    id: 'syncStatus',
    class: 'sync-status',
    'aria-live': 'polite'
  });
  button.append(
    el('span', { class: 'sync-dot', 'aria-hidden': 'true' }),
    el('span', { class: 'sync-text', text: LABELS.idle.text })
  );
  host.prepend(button);
  return button;
}

function formatTime(iso) {
  if (!iso) return 'hali sinxronlanmagan';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'hali sinxronlanmagan';
  return date.toLocaleString('uz-UZ');
}

function openVaultDialog() {
  const token = getToken();
  const dialog = el('dialog', { id: 'vaultDialog' });
  dialog.innerHTML = `
    <div class="product-dialog vault-dialog">
      <button class="dialog-close" type="button" data-close aria-label="Yopish">×</button>
      <p class="kicker">QURILMALARARO KALIT</p>
      <h2>Makonlaringizni boshqa qurilmada oching</h2>
      <p class="dialog-hint">
        ${
          token
            ? 'Bu kalit — sizning yagona parolingiz. Uni boshqa qurilmaga kiriting va makonlaringiz o‘sha yerda ham paydo bo‘ladi. Kalitni yo‘qotsangiz, serverdagi nusxaga kirish imkoni qolmaydi.'
            : 'Sinxronizatsiya <b>o‘chiq</b>: makonlaringiz faqat shu qurilmada va serverga hech narsa yuborilmaydi. Yoqsangiz kalit yaratiladi — u sizning yagona parolingiz bo‘ladi.'
        }
      </p>

      <label class="vault-field">Sizning kalitingiz
        <span class="vault-token-row">
          <input id="vaultToken" type="text" readonly value="${escapeHtml(token || '')}"
                 placeholder="sinxronizatsiya hali yoqilmagan">
          ${
            token
              ? '<button type="button" class="soft-button" data-copy>Nusxalash</button>'
              : '<button type="button" class="primary-button compact" data-enable>Yoqish</button>'
          }
        </span>
      </label>

      <label class="vault-field">Boshqa qurilmadagi kalit
        <span class="vault-token-row">
          <input id="vaultInput" type="text" inputmode="latin" autocomplete="off"
                 placeholder="64 belgili kalitni shu yerga qo‘ying">
          <button type="button" class="primary-button compact" data-connect>Ulanish</button>
        </span>
      </label>
      <p class="vault-message" id="vaultMessage" role="status"></p>

      <!-- Maxfiylik sozlamasi ataylab shu yerda: bu oyna ikkala sahifadan
           ham ochiladi va allaqachon "nima qurilmada, nima serverda"
           degan savolga javob beradi. -->
      <div class="vault-privacy">
        <div>
          <b>Anonim statistika</b>
          <span>
            Faqat hodisa nomi yuboriladi (masalan <code>fikr</code>). Matn, IP,
            cookie — hech qachon.
          </span>
        </div>
        <button type="button" class="soft-button" data-stats></button>
      </div>

      ${
        token
          ? `<div class="vault-manage">
        <button type="button" class="soft-button" data-rotate>Kalitni yangilash</button>
        <button type="button" class="soft-button" data-forget>Bu qurilmani uzish</button>
        <button type="button" class="soft-button is-danger" data-revoke>
          Serverdagi nusxani o‘chirish
        </button>
      </div>`
          : ''
      }

      <div class="vault-footer">
        <small>Oxirgi sinxronizatsiya: ${escapeHtml(formatTime(lastSyncedAt()))}</small>
      </div>
    </div>`;

  document.body.append(dialog);
  const message = dialog.querySelector('#vaultMessage');
  const say = (text, tone = 'ok') => {
    message.textContent = text;
    message.dataset.tone = tone;
  };

  /** Statistika tugmasini joriy holatga moslaydi. */
  const paintStats = () => {
    const button = dialog.querySelector('[data-stats]');
    if (!button) return;
    const off = statsOptedOut();
    button.textContent = off ? 'O‘chiq' : 'Yoqilgan';
    button.setAttribute('aria-pressed', String(!off));
    button.dataset.on = String(!off);
  };
  paintStats();

  dialog.querySelector('[data-stats]')?.addEventListener('click', () => {
    setStatsEnabled(statsOptedOut());
    paintStats();
    say(
      statsOptedOut()
        ? 'Statistika o‘chirildi. Bu qurilmadan boshqa hech narsa yuborilmaydi.'
        : 'Statistika yoqildi. Faqat hodisa nomlari — matnsiz.'
    );
  });

  dialog.querySelector('[data-close]').addEventListener('click', () => {
    dialog.close();
    dialog.remove();
  });

  dialog.querySelector('[data-copy]')?.addEventListener('click', async () => {
    const input = dialog.querySelector('#vaultToken');
    try {
      await navigator.clipboard.writeText(input.value);
      say('Kalit nusxalandi.');
    } catch {
      input.select();
      say('Nusxalab bo‘lmadi — kalitni qo‘lda belgilab oling.', 'error');
    }
  });

  /*
   * Vault AYNAN shu yerda yaratiladi. Ilgari u sahifa ochilishi bilan
   * o'z-o'zidan yaratilardi — ya'ni hech qachon sinxronizatsiyani
   * so'ramagan odam ham bazada qator qoldirardi.
   */
  dialog.querySelector('[data-enable]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    say('Yoqilmoqda…');

    await enableSync();

    if (getToken()) {
      dialog.close();
      dialog.remove();
      openVaultDialog(); // yangi kalit bilan qayta ochiladi
      return;
    }
    button.disabled = false;
    say('Yoqib bo‘lmadi — internetni tekshirib, qayta urinib ko‘ring.', 'error');
  });

  dialog.querySelector('[data-connect]').addEventListener('click', () => {
    const value = dialog.querySelector('#vaultInput').value;
    if (useToken(value)) {
      say('Ulanmoqda… makonlaringiz bir necha soniyada paydo bo‘ladi.');
      setTimeout(() => {
        dialog.close();
        dialog.remove();
      }, 1200);
    } else {
      say('Kalit noto‘g‘ri: u 64 ta belgidan (0-9, a-f) iborat bo‘lishi kerak.', 'error');
    }
  });

  /**
   * Ikki bosqichli tasdiqlash.
   *
   * Bu amallar qaytarib bo'lmaydigan: kalit yangilansa boshqa
   * qurilmalar uziladi, nusxa o'chirilsa serverda hech narsa qolmaydi.
   * Tasodifiy bosishdan himoya kerak, lekin alohida oyna ortiqcha —
   * tugmaning o'zi savol berib turadi.
   */
  const confirmed = (button, question) => {
    if (button.dataset.armed === 'yes') return true;
    button.dataset.armed = 'yes';
    const original = button.textContent.trim();
    button.textContent = 'Tasdiqlang';
    say(question, 'error');
    setTimeout(() => {
      if (!button.isConnected) return;
      button.dataset.armed = 'no';
      button.textContent = original;
    }, 6000);
    return false;
  };

  dialog.querySelector('[data-rotate]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    if (!confirmed(button, 'Yangi kalit beriladi va BOSHQA QURILMALAR uziladi. Davom etamizmi?')) {
      return;
    }
    button.disabled = true;
    say('Yangilanmoqda…');

    if (await rotateToken()) {
      dialog.close();
      dialog.remove();
      openVaultDialog(); // yangi kalit bilan qayta ochiladi
      return;
    }
    button.disabled = false;
    button.dataset.armed = 'no';
    say('Yangilab bo‘lmadi — internetni tekshirib, qayta urinib ko‘ring.', 'error');
  });

  dialog.querySelector('[data-revoke]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    if (
      !confirmed(
        button,
        'Serverdagi barcha nusxa o‘chiriladi va qaytarib bo‘lmaydi. Bu qurilmadagi fikrlar qoladi. Davom etamizmi?'
      )
    ) {
      return;
    }
    button.disabled = true;
    say('O‘chirilmoqda…');

    if (await revokeVault()) {
      say('Serverda hech narsa qolmadi. Fikrlaringiz shu qurilmada.');
      setTimeout(() => {
        dialog.close();
        dialog.remove();
      }, 1600);
      return;
    }
    button.disabled = false;
    button.dataset.armed = 'no';
    say('O‘chirib bo‘lmadi — qayta urinib ko‘ring.', 'error');
  });

  dialog.querySelector('[data-forget]')?.addEventListener('click', () => {
    forgetToken();
    say('Bu qurilma uzildi. Makonlar shu yerda qoldi.');
    setTimeout(() => {
      dialog.close();
      dialog.remove();
    }, 1200);
  });

  dialog.showModal();
}

/** Holat ko'rsatkichini o'rnatadi va sinxronizatsiya hodisalariga ulaydi. */
export function mountSyncUI() {
  const indicator = mountIndicator();
  if (!indicator) return;

  const textNode = indicator.querySelector('.sync-text');
  let state = 'idle';

  const paint = (next, message) => {
    state = next;
    const label = LABELS[next] ?? LABELS.idle;
    textNode.textContent = label.text;
    indicator.dataset.state = next;
    indicator.title = message || label.title;
    indicator.setAttribute(
      'aria-label',
      `Sinxronizatsiya holati: ${label.text}. Qurilmalararo kalitni ochish uchun bosing.`
    );
  };

  paint(getToken() ? 'ok' : 'idle');

  globalThis.addEventListener(EVENTS.sync, event => {
    const detail = event.detail ?? {};
    paint(detail.state ?? 'idle', detail.message);
  });

  indicator.addEventListener('click', openVaultDialog);
  indicator.addEventListener('dblclick', () => void sync());

  // Uzoq vaqt "sinxronlanmoqda" holatida qolib ketmasin.
  setInterval(() => {
    if (state === 'syncing') paint(getToken() ? 'ok' : 'idle');
  }, 15_000);
}
