/**
 * A tiny read-through cache for the data the app needs most.
 *
 * It stores JSON in localStorage with a timestamp. Screens read the cache
 * first (so something is on screen immediately, even with no network) and
 * write back after every successful fetch. Nothing here ever throws: a full
 * quota, a corrupt entry or a disabled storage all degrade to "no cache".
 *
 * It deliberately never stores a token or anything else secret.
 */

const PREFIX = 'gitofy.cache.';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // a week

interface Entry<T> {
  savedAt: number;
  value: T;
}

/** localStorage is not always available (private mode, quota); never trust it. */
function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__gitofy_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function cachePut<T>(key: string, value: T): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), value } satisfies Entry<T>));
  } catch {
    // Quota is full — drop the oldest cached entries and try once more.
    try {
      const keys: { k: string; at: number }[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k?.startsWith(PREFIX)) continue;
        let at = 0;
        try { at = (JSON.parse(store.getItem(k) ?? '{}') as Entry<unknown>).savedAt ?? 0; } catch { at = 0; }
        keys.push({ k, at });
      }
      keys.sort((a, b) => a.at - b.at).slice(0, 20).forEach(({ k }) => store.removeItem(k));
      store.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), value } satisfies Entry<T>));
    } catch {
      /* give up quietly */
    }
  }
}

export function cacheGet<T>(key: string, ttlMs = DEFAULT_TTL_MS): { value: T; savedAt: number } | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.savedAt !== 'number') return null;
    if (Date.now() - entry.savedAt > ttlMs) {
      store.removeItem(PREFIX + key);
      return null;
    }
    return { value: entry.value, savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

export function cacheRemove(key: string): void {
  storage()?.removeItem(PREFIX + key);
}

/** Wipe every cached entry — used on sign-out so nothing leaks between accounts. */
export function cacheClear(): void {
  const store = storage();
  if (!store) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => store.removeItem(k));
  } catch {
    /* nothing we can do */
  }
}

/** A short, human line like "saved 4 minutes ago". */
export function cacheAge(savedAt: number): string {
  const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (secs < 60) return 'saved just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `saved ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `saved ${hours} h ago`;
  return `saved ${Math.round(hours / 24)} d ago`;
}

/** Cache keys, kept in one place so they cannot drift apart. */
export const CACHE_KEYS = {
  repos: (login: string) => `repos:${login || 'me'}`,
  tree: (owner: string, repo: string, branch: string) => `tree:${owner}/${repo}@${branch}`,
  commits: (owner: string, repo: string, branch: string) => `commits:${owner}/${repo}@${branch}`,
  file: (owner: string, repo: string, branch: string, path: string) => `file:${owner}/${repo}@${branch}:${path}`,
  releases: (owner: string, repo: string) => `releases:${owner}/${repo}`,
} as const;
