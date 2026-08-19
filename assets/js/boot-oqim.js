/** Oqim sahifasining boshlanish nuqtasi. */

import { recoverMissing } from './core/storage.js';
import { initOqimPage } from './oqim/index.js';
import { startSync } from './sync/client.js';
import { mountSyncUI } from './sync/ui.js';
import { registerServiceWorker } from './core/pwa.js';

await recoverMissing();
initOqimPage();
mountSyncUI();
startSync();
registerServiceWorker();
