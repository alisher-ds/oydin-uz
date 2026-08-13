(() => {
  const TOKEN_KEY = 'oydin-vault-token-v1';
  const LAST_KEY = 'oydin-sync-last-v1';
  const MAX_SPACES = 50;

  const normalize = value => {
    if (Array.isArray(value)) {
      return value.filter(item => item && typeof item === 'object' && item.id);
    }
    if (value && typeof value === 'object') {
      return Object.entries(value)
        .map(([id, item]) => {
          if (!item || typeof item !== 'object') return null;
          return { ...item, id: item.id || id };
        })
        .filter(item => item && item.id);
    }
    return [];
  };

  const read = () => {
    try {
      return normalize(JSON.parse(localStorage.getItem('oydin-maps') || '{}'));
    } catch {
      return [];
    }
  };

  const write = spaces => {
    const byId = Object.fromEntries(normalize(spaces).map(space => [String(space.id), space]));
    localStorage.setItem('oydin-maps', JSON.stringify(byId));
  };

  const timestamp = item => String(item?.updatedAt || item?.updated_at || '');

  const merge = (local, remote) => {
    const merged = new Map(normalize(local).map(item => [String(item.id), item]));
    for (const item of normalize(remote)) {
      const id = String(item.id);
      const current = merged.get(id);
      if (!current || timestamp(item) > timestamp(current)) merged.set(id, item);
    }
    return [...merged.values()];
  };

  let inFlight = false;
  let queued = false;
  let timer;

  async function sync() {
    if (inFlight) {
      queued = true;
      return;
    }

    inFlight = true;
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const spaces = read().slice(0, MAX_SPACES);
      const headers = { 'content-type': 'application/json' };
      if (token) headers['X-Oydin-Vault'] = token;

      const response = await fetch('/api/sync', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          ...(token ? { token } : {}),
          spaces
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Sync failed (${response.status})`);

      if (data.token && !token) localStorage.setItem(TOKEN_KEY, data.token);

      if (Array.isArray(data.spaces)) {
        write(merge(spaces, data.spaces));
      }

      const syncedAt = data.syncedAt || new Date().toISOString();
      localStorage.setItem(LAST_KEY, syncedAt);
      window.dispatchEvent(new CustomEvent('oydin:sync', {
        detail: { ok: true, at: syncedAt }
      }));
      return data;
    } catch (error) {
      window.dispatchEvent(new CustomEvent('oydin:sync', {
        detail: { ok: false, error: error.message }
      }));
      return null;
    } finally {
      inFlight = false;
      if (queued) {
        queued = false;
        schedule(50);
      }
    }
  }

  function schedule(delay = 1000) {
    clearTimeout(timer);
    timer = setTimeout(sync, delay);
  }

  window.OydinSync = Object.freeze({
    sync,
    schedule,
    lastSync: () => localStorage.getItem(LAST_KEY),
    getToken: () => localStorage.getItem(TOKEN_KEY)
  });

  window.addEventListener('online', () => schedule(100));
  window.addEventListener('pagehide', () => {
    if (navigator.onLine) sync();
  });
  window.addEventListener('oydin:data-changed', event => {
    if (event.detail?.key === 'oydin-maps') schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(100);
  });

  schedule(500);
})();
