const encoder = new TextEncoder();

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function safeId(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function now() {
  return new Date().toISOString();
}
