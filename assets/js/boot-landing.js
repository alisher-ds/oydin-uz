/** Bosh sahifaning boshlanish nuqtasi. */

import { recoverMissing } from './core/storage.js';
import { initLandingPage } from './landing/index.js';
import { startSync } from './sync/client.js';
import { mountSyncUI } from './sync/ui.js';
import { registerServiceWorker } from './core/pwa.js';
import { startStats } from './core/stat.js';

await recoverMissing();
initLandingPage();
mountSyncUI();
startSync();
registerServiceWorker();
startStats('sahifa:oydin');
