/* Oydin storage bridge: local persistence + IndexedDB recovery + sync signal. */
(() => {
  const DB = 'oydin-storage', STORE = 'snapshots', VERSION = 2;
  const KEYS = ['oydin-maps', 'oydin-active-map', 'oydin-theme'];
  if (!window.indexedDB || window.__oydinStorageBridge) return;
  window.__oydinStorageBridge = true;

  const openDB = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
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
    } catch (error) { console.warn('[Oydin] backup unavailable', error); }
  };
  const read = async key => {
    try {
      const db = await openDB();
      const value = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return value;
    } catch { return null; }
  };

  const originalSet = Storage.prototype.setItem;
  const originalRemove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function(key, value) {
    const result = originalSet.call(this, key, value);
    if (this === localStorage && KEYS.includes(key)) {
      write(key, String(value));
      window.dispatchEvent(new CustomEvent('oydin:data-changed', { detail: { key, value: String(value), operation: 'set' } }));
    }
    return result;
  };
  Storage.prototype.removeItem = function(key) {
    const result = originalRemove.call(this, key);
    if (this === localStorage && KEYS.includes(key)) {
      write(key, null);
      window.dispatchEvent(new CustomEvent('oydin:data-changed', { detail: { key, value: null, operation: 'remove' } }));
    }
    return result;
  };

  window.OydinStorage = Object.freeze({
    version: VERSION,
    backup: key => KEYS.includes(key) ? write(key, localStorage.getItem(key)) : Promise.resolve(),
    restore: async key => {
      if (!KEYS.includes(key) || localStorage.getItem(key) !== null) return false;
      const item = await read(key);
      if (item?.value === undefined || item?.value === null) return false;
      originalSet.call(localStorage, key, item.value);
      window.dispatchEvent(new CustomEvent('oydin:storage-restored', { detail: { key } }));
      return true;
    }
  });

  (async () => {
    const marker = 'oydin-storage-recovered-v2';
    if (sessionStorage.getItem(marker)) return;
    let recovered = false;
    for (const key of ['oydin-maps', 'oydin-active-map']) recovered = (await window.OydinStorage.restore(key)) || recovered;
    if (recovered) sessionStorage.setItem(marker, '1');
  })();
})();
