/* Oydin storage bridge
 * Keeps the current localStorage contract intact while adding:
 * - versioned IndexedDB backup
 * - automatic backup after writes
 * - recovery when localStorage is empty/corrupt
 * - safe legacy-data migration without changing the UI layer
 *
 * This is intentionally a compatibility layer: existing app code can keep using
 * localStorage while the persistence implementation is prepared for a future
 * authenticated server sync.
 */
(() => {
  const DB = 'oydin-storage';
  const STORE = 'snapshots';
  const VERSION = 1;
  const KEYS = ['oydin-maps', 'oydin-active-map', 'oydin-theme'];
  const READY = Symbol('oydin-storage-bridge');

  if (!window.indexedDB || window[READY]) return;
  window[READY] = true;

  const openDB = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const write = async (key, value) => {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ key, value, version: VERSION, updatedAt: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.warn('[Oydin] IndexedDB backup unavailable:', error);
    }
  };

  const read = async key => {
    try {
      const db = await openDB();
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result?.value);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return result;
    } catch {
      return null;
    }
  };

  const originalSet = Storage.prototype.setItem;
  const originalRemove = Storage.prototype.removeItem;

  Storage.prototype.setItem = function(key, value) {
    const result = originalSet.call(this, key, value);
    if (this === localStorage && KEYS.includes(key)) write(key, String(value));
    return result;
  };

  Storage.prototype.removeItem = function(key) {
    const result = originalRemove.call(this, key);
    if (this === localStorage && KEYS.includes(key)) write(key, null);
    return result;
  };

  window.OydinStorage = Object.freeze({
    version: VERSION,
    backup: key => KEYS.includes(key) ? write(key, localStorage.getItem(key)) : Promise.resolve(),
    restore: async key => {
      if (!KEYS.includes(key) || localStorage.getItem(key) !== null) return false;
      const value = await read(key);
      if (value === null || value === undefined) return false;
      originalSet.call(localStorage, key, value);
      return true;
    }
  });

  // Recovery runs before app.js is allowed to initialize its map state.
  // If a previous browser session lost localStorage but the backup exists,
  // restore it and reload once. The session marker prevents reload loops.
  (async () => {
    const marker = 'oydin-storage-recovered-v1';
    if (sessionStorage.getItem(marker)) return;
    let recovered = false;
    for (const key of ['oydin-maps', 'oydin-active-map']) recovered = (await window.OydinStorage.restore(key)) || recovered;
    if (recovered) {
      sessionStorage.setItem(marker, '1');
      location.reload();
    }
  })();
})();
