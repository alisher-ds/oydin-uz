/**
 * Makon sahifasining boshlanish nuqtasi.
 *
 * Tartib muhim: avval IndexedDB dan yo'qolgan ma'lumot tiklanadi, keyingina
 * holat o'qiladi. Aks holda tiklangan ma'lumot ko'rinmay qolardi.
 */

import { recoverMissing } from './core/storage.js';
import { initMapPage } from './map/index.js';
import { startSync } from './sync/client.js';
import { mountSyncUI } from './sync/ui.js';
import { registerServiceWorker } from './core/pwa.js';
import { startStats } from './core/stat.js';

await recoverMissing();
initMapPage();
mountSyncUI();
startSync();
registerServiceWorker();
startStats('sahifa:makon');
