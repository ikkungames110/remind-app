// Web Push (RFC 8291 aes128gcm + VAPID) を WebCrypto だけで実装
const enc = new TextEncoder();
const subtle = crypto.subtle;

export const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ub64u = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const concat = (...parts) => {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) out.set(a, (o += a.length) - a.length);
  return out;
};

async function hkdf(salt, ikm, info, len) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

export async function encrypt(sub, payload) {
  const uaPub = ub64u(sub.p256dh);
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  const uaKey = await subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256);

  const ikm = await hkdf(ub64u(sub.auth), shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), [2]));
  return concat(salt, [0, 0, 16, 0], [65], asPub, ct);
}

async function vapid(endpoint, jwk, subject) {
  const h = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = b64u(
    enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 43200, sub: subject })),
  );
  const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${h}.${c}`));
  const pub = concat([4], ub64u(jwk.x), ub64u(jwk.y));
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${b64u(pub)}`;
}

export async function sendPush(sub, payload, jwk, subject) {
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapid(sub.endpoint, jwk, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body: await encrypt(sub, payload),
  });
}
