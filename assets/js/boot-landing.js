/** Bosh sahifaning boshlanish nuqtasi. */

import { recoverMissing } from './core/storage.js';
import { initLandingPage } from './landing/index.js';
import { startSync } from './sync/client.js';
import { mountSyncUI } from './sync/ui.js';

await recoverMissing();
initLandingPage();
mountSyncUI();
startSync();
