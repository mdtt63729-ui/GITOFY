/**
 * Encryption-at-rest primitives (§7.1) using Web Crypto.
 *
 * A non-extractable AES-256-GCM key is generated once and persisted in
 * IndexedDB (CryptoKey structured-clone). Because the key is non-extractable it
 * cannot be read back out even if the DB is dumped — this is the closest web
 * analogue to an Android Keystore-backed key. If the runtime cannot persist a
 * CryptoKey object we fall back to a JWK-stored key and flag the reduced
 * guarantee (documented in docs/security.md).
 */

const KEY_DB = 'gitofy_secure_keys';
const KEY_STORE = 'keys';
const KEY_ID = 'master';

let cachedKey: CryptoKey | null = null;
let keyKind: 'non-extractable' | 'jwk-fallback' = 'non-extractable';

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readRaw(id: string): Promise<unknown> {
  const db = await openKeyDb();
  try {
    const tx = db.transaction(KEY_STORE, 'readonly');
    return await idbRequest(tx.objectStore(KEY_STORE).get(id));
  } finally {
    db.close();
  }
}

async function writeRaw(id: string, value: unknown): Promise<void> {
  const db = await openKeyDb();
  try {
    const tx = db.transaction(KEY_STORE, 'readwrite');
    await idbRequest(tx.objectStore(KEY_STORE).put(value, id));
  } finally {
    db.close();
  }
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const stored = await readRaw(KEY_ID);
  if (stored && (stored as CryptoKey).type === 'secret') {
    cachedKey = stored as CryptoKey;
    keyKind = 'non-extractable';
    return cachedKey;
  }
  if (typeof stored === 'string') {
    // JWK fallback path.
    const jwk = JSON.parse(stored) as JsonWebKey;
    cachedKey = await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
    keyKind = 'jwk-fallback';
    return cachedKey;
  }

  // First run: create a fresh non-extractable key and try to persist it.
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  try {
    await writeRaw(KEY_ID, key);
    keyKind = 'non-extractable';
    cachedKey = key;
  } catch {
    // Some engines can't structured-clone a CryptoKey into IDB.
    const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const jwk = await crypto.subtle.exportKey('jwk', extractable);
    await writeRaw(KEY_ID, JSON.stringify(jwk));
    keyKind = 'jwk-fallback';
    cachedKey = extractable;
  }
  return cachedKey;
}

export function keyStrength(): string {
  return keyKind;
}

export async function encryptString(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(new TextEncoder().encode(plaintext))
  );
  return `v1.${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

export async function decryptString(payload: string): Promise<string> {
  const key = await getKey();
  const parts = payload.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Unsupported ciphertext format');
  const iv = fromB64(parts[1]);
  const ct = fromB64(parts[2]);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(ct)
  );
  return new TextDecoder().decode(pt);
}

/** Cryptographically strong random bytes (used by PKCE/state) (§6). */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function base64Url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    asBufferSource(new TextEncoder().encode(input))
  );
  return base64Url(new Uint8Array(digest));
}

/** TS lib.dom now types BufferSource strictly against ArrayBuffer; normalise. */
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

/** Wipe the master key so any previously stored ciphertext becomes undecryptable (§7.4). */
export async function destroyKey(): Promise<void> {
  cachedKey = null;
  const db = await openKeyDb();
  try {
    const tx = db.transaction(KEY_STORE, 'readwrite');
    await idbRequest(tx.objectStore(KEY_STORE).delete(KEY_ID));
  } finally {
    db.close();
  }
}
