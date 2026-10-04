import { decryptString, encryptString } from './crypto';

/**
 * Encrypted key/value store over IndexedDB (§7.1). Every value is AES-GCM
 * encrypted with the device-bound key before it touches disk. No token ever
 * lands in localStorage, so it can never ride along in a plaintext backup.
 */

const DB = 'gitofy_secure_v1';
const STORE = 'kv';

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function rawGet(key: string): Promise<string | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const v = await idbRequest<string | undefined>(tx.objectStore(STORE).get(key));
  return v;
}

async function rawSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbRequest(tx.objectStore(STORE).put(value, key));
}

async function rawDel(key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  await idbRequest(tx.objectStore(STORE).delete(key));
}

async function rawKeys(): Promise<string[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  return idbRequest<string[]>(tx.objectStore(STORE).getAllKeys() as IDBRequest<string[]>);
}

export const SecureStore = {
  async setString(key: string, value: string): Promise<void> {
    await rawSet(key, await encryptString(value));
  },

  async getString(key: string): Promise<string | null> {
    const cipher = await rawGet(key);
    if (!cipher) return null;
    try {
      return await decryptString(cipher);
    } catch {
      // Key rotated / data from another device — treat as absent.
      return null;
    }
  },

  async setJson<T>(key: string, value: T): Promise<void> {
    await this.setString(key, JSON.stringify(value));
  },

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async remove(key: string): Promise<void> {
    await rawDel(key);
  },

  async keys(): Promise<string[]> {
    return rawKeys();
  },

  async clear(): Promise<void> {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    await idbRequest(tx.objectStore(STORE).clear());
  },
};
