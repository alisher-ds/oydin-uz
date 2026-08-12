export function createOydinSync({ storage = localStorage } = {}) {
  const TOKEN_KEY = 'oydin-vault-token-v1';
  const LAST_KEY = 'oydin-sync-last-v1';
  const getToken = () => storage.getItem(TOKEN_KEY);
  const setToken = token => storage.setItem(TOKEN_KEY, token);
  const read = () => { try { return JSON.parse(storage.getItem('oydin-maps') || '[]'); } catch { return []; } };
  const write = spaces => storage.setItem('oydin-maps', JSON.stringify(spaces));
  let timer;
  let inFlight = false;
  let queued = false;

  async function sync() {
    if (inFlight) { queued = true; return; }
    inFlight = true;
    try {
      const spaces = read();
      const headers = { 'content-type': 'application/json' };
      const token = getToken();
      if (token) headers['X-Oydin-Vault'] = token;
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: token || undefined, spaces })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Sync failed');
      if (data.token && !token) setToken(data.token);
      if (Array.isArray(data.spaces) && data.spaces.length) write(merge(read(), data.spaces));
      storage.setItem(LAST_KEY, data.syncedAt || new Date().toISOString());
      window.dispatchEvent(new CustomEvent('oydin:sync', { detail: { ok: true, at: data.syncedAt } }));
      return data;
    } catch (error) {
      window.dispatchEvent(new CustomEvent('oydin:sync', { detail: { ok: false, error: error.message } }));
      return null;
    } finally {
      inFlight = false;
      if (queued) { queued = false; sync(); }
    }
  }

  function merge(local, remote) {
    const map = new Map(local.filter(Boolean).map(x => [x.id, x]));
    for (const item of remote) {
      if (!item?.id) continue;
      const current = map.get(item.id);
      if (!current || String(item.updatedAt || item.updated_at || '') > String(current.updatedAt || '')) map.set(item.id, item);
    }
    return [...map.values()];
  }

  function schedule(delay = 1200) { clearTimeout(timer); timer = setTimeout(sync, delay); }
  window.addEventListener('online', () => schedule(100));
  window.addEventListener('pagehide', () => { if (navigator.onLine) sync(); });
  window.addEventListener('oydin:data-changed', () => schedule());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(100); });

  return Object.freeze({ sync, schedule, getToken, lastSync: () => storage.getItem(LAST_KEY) });
}
