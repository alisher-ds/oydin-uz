/** Tez yozish sahifasining boshlanish nuqtasi. */

import { initTheme } from './core/theme.js';
import { initTez } from './tez/index.js';
import { registerServiceWorker } from './core/pwa.js';

initTheme();
initTez();
registerServiceWorker();
