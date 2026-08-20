/**
 * Node muhitida brauzer globallarining minimal o'rnini bosuvchi.
 * Faqat `state.js` va `storage.js` ishlatadigan qismlar.
 */

class MemoryStorage {
  #data = new Map();
  #limit;

  constructor(limitBytes = Infinity) {
    this.#limit = limitBytes;
  }

  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }

  setItem(key, value) {
    const next = String(value);
    let total = next.length;
    for (const [existingKey, existingValue] of this.#data) {
      if (existingKey !== key) total += existingValue.length;
    }
    if (total > this.#limit) {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.#data.set(key, next);
  }

  removeItem(key) {
    this.#data.delete(key);
  }

  clear() {
    this.#data.clear();
  }

  get length() {
    return this.#data.size;
  }
}

/** Brauzer globallarini o'rnatadi va kuzatuv obyektini qaytaradi. */
export function installBrowserGlobals({ quotaBytes = Infinity } = {}) {
  const events = [];
  globalThis.localStorage = new MemoryStorage(quotaBytes);
  globalThis.indexedDB = undefined;
  globalThis.dispatchEvent = event => {
    events.push({ type: event.type, detail: event.detail });
    return true;
  };
  globalThis.addEventListener = () => {};
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });

  return {
    events,
    reset() {
      globalThis.localStorage.clear();
      events.length = 0;
    }
  };
}
