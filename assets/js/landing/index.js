/** Bosh sahifa: mavzu, suhbat oynasi va yumshoq aylantirish. */

import { $$, prefersReducedMotion } from '../core/index.js';
import { initTheme } from '../core/theme.js';
import { initChat } from '../ai/chat.js';

export function initLandingPage() {
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
