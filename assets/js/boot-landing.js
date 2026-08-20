/** Bosh sahifaning boshlanish nuqtasi. */

import { recoverMissing } from './core/storage.js';
import { startSync } from './sync/client.js';
import { mountSyncUI } from './sync/ui.js';
import { registerServiceWorker, startStats } from './core/app.js';
import { $$, prefersReducedMotion } from './core/index.js';
import { initTheme } from './core/theme.js';
import { initChat } from './ai/chat.js';

function initLandingPage() {
  initTheme();
  initChat();

  for (const link of $$('a[href^="#"]')) {
    link.addEventListener('click', event => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start'
      });
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }
}

await recoverMissing();
initLandingPage();
mountSyncUI();
startSync();
registerServiceWorker();
startStats('sahifa:oydin');
