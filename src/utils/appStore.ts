/**
 * The data layer behind the App Store search screen.
 *
 * An "app" here is a GitHub repository that publishes an installable APK on one
 * of its releases. Discovery uses GitHub's own search, so it needs no server of
 * our own; whether a repository is actually installable is decided by looking at
 * its latest release for an `.apk` asset.
 *
 * Nothing in this file throws for a network problem — a search that fails just
 * returns no results, because a discovery screen should degrade quietly rather
 * than show an error card over the whole page.
 */

import { githubHeaders } from '../git/githubApi';

export interface StoreApp {
  /** `owner/name`, the stable key. */
  id: string;
  owner: string;
  name: string;
  description: string;
  stars: number;
  language: string | null;
  isPrivate: boolean;
  ownerAvatar: string;
  htmlUrl: string;
  /** Filled in once the release check has run. */
  checked?: boolean;
  installable?: boolean;
  version?: string;
  apkName?: string;
  apkSize?: number;
  apkUrl?: string;
  packageName?: string;
}

export interface LibraryApp {
  id: string;
  name: string;
  owner: string;
  description: string;
  version: string;
  apkName: string;
  downloadedAt: number;
  htmlUrl: string;
  ownerAvatar: string;
}

const LIBRARY_KEY = 'gitofy.appstore.library';
const HISTORY_KEY = 'gitofy.appstore.history';
const MAX_HISTORY = 8;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full — drop it */ }
}

/* ----------------------------- discovery ----------------------------- */

interface RawRepo {
  full_name?: string;
  name?: string;
  owner?: { login?: string; avatar_url?: string };
  description?: string | null;
  stargazers_count?: number;
  language?: string | null;
  private?: boolean;
  html_url?: string;
}

function toStoreApp(r: RawRepo): StoreApp {
  return {
    id: String(r.full_name ?? ''),
    owner: String(r.owner?.login ?? r.full_name?.split('/')[0] ?? ''),
    name: String(r.name ?? ''),
    description: String(r.description ?? ''),
    stars: Number(r.stargazers_count ?? 0),
    language: r.language ?? null,
    isPrivate: Boolean(r.private),
    ownerAvatar: String(r.owner?.avatar_url ?? ''),
    htmlUrl: String(r.html_url ?? ''),
  };
}

/** GitHub-wide search for repositories that look like apps. */
export async function searchStoreApps(query: string, token: string): Promise<StoreApp[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=24`,
      { headers: githubHeaders(token) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? (data.items as RawRepo[]).map(toStoreApp) : [];
  } catch {
    return [];
  }
}

/** Turn an already-known repository list into app candidates (the "My repos" mode). */
export function myReposAsApps(
  repos: { full_name: string; name: string; description?: string | null; stargazers_count?: number; language?: string | null; private?: boolean; html_url?: string; owner?: { login?: string; avatar_url?: string } }[],
  query: string
): StoreApp[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? repos.filter((r) => r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q))
    : repos;
  return matched.map((r) => toStoreApp(r as RawRepo));
}

/**
 * Does this repository publish an installable APK? Looks at the newest few
 * releases and returns the first `.apk` asset it finds.
 */
export async function findApkAsset(
  owner: string,
  repo: string,
  token: string
): Promise<Pick<StoreApp, 'installable' | 'version' | 'apkName' | 'apkSize' | 'apkUrl'> | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
      { headers: githubHeaders(token) }
    );
    if (!res.ok) return null;
    const releases = await res.json();
    if (!Array.isArray(releases)) return null;
    for (const rel of releases) {
      const assets = Array.isArray(rel?.assets) ? rel.assets : [];
      const apk = assets.find((a: { name?: string }) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk'));
      if (apk) {
        return {
          installable: true,
          version: String(rel.tag_name ?? rel.name ?? ''),
          apkName: String(apk.name),
          apkSize: Number(apk.size ?? 0),
          // The plain download URL works for public repositories without extra
          // headers and follows GitHub's own signed redirect for private ones.
          apkUrl: String(apk.browser_download_url ?? ''),
        };
      }
    }
    return { installable: false };
  } catch {
    return null;
  }
}

/**
 * Check a batch of apps for an APK, a few at a time, calling back as each one
 * resolves so the list fills in progressively instead of blocking.
 */
export async function enrichWithApks(
  apps: StoreApp[],
  token: string,
  onEach: (id: string, patch: Partial<StoreApp>) => void,
  concurrency = 4,
  signal?: { cancelled: boolean }
): Promise<void> {
  const queue = [...apps];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      if (signal?.cancelled) return;
      const app = queue.shift();
      if (!app) return;
      const found = await findApkAsset(app.owner, app.name, token);
      if (signal?.cancelled) return;
      onEach(app.id, found ? { ...found, checked: true } : { checked: true });
    }
  });
  await Promise.all(workers);
}

/* ------------------------------ library ------------------------------ */

export function getLibrary(): LibraryApp[] {
  const list = readJson<LibraryApp[]>(LIBRARY_KEY, []);
  return Array.isArray(list) ? list.slice().sort((a, b) => b.downloadedAt - a.downloadedAt) : [];
}

export function addToLibrary(app: LibraryApp): void {
  const rest = getLibrary().filter((a) => a.id !== app.id);
  writeJson(LIBRARY_KEY, [app, ...rest].slice(0, 100));
}

export function removeFromLibrary(id: string): void {
  writeJson(LIBRARY_KEY, getLibrary().filter((a) => a.id !== id));
}

export function isInLibrary(id: string): boolean {
  return getLibrary().some((a) => a.id === id);
}

/* --------------------------- search history --------------------------- */

export function getHistory(): string[] {
  const list = readJson<string[]>(HISTORY_KEY, []);
  return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
}

export function pushHistory(query: string): void {
  const q = query.trim();
  if (q.length < 2) return;
  const rest = getHistory().filter((s) => s.toLowerCase() !== q.toLowerCase());
  writeJson(HISTORY_KEY, [q, ...rest].slice(0, MAX_HISTORY));
}

export function clearHistory(): void {
  writeJson(HISTORY_KEY, []);
}

/** "4.2 MB" — used on the app cards and in the library. */
export function formatAppSize(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* --------------------------- screenshots --------------------------- */

function b64ToUtf8(b64: string): string {
  try {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

/**
 * Pull image URLs out of a README (both markdown `![](...)` and HTML `<img>`),
 * resolved to absolute URLs against `base`. Badges/shields are skipped — they are
 * not screenshots.
 */
export function extractReadmeImages(markdown: string, base: string): string[] {
  const out = new Set<string>();
  const push = (raw: string) => {
    let s = raw.trim().replace(/^<|>$/g, '');
    if (!s) return;
    if (/shields\.io|badge|\/actions\/workflows\/.*\/badge/i.test(s)) return;
    if (s.startsWith('//')) s = `https:${s}`;
    else if (!/^https?:\/\//i.test(s)) {
      try { s = new URL(s, base).toString(); } catch { return; }
    }
    if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(s) || /user-images\.githubusercontent\.com|raw\.githubusercontent\.com/i.test(s)) {
      out.add(s);
    }
  };

  for (const m of markdown.match(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g) ?? []) {
    const inner = m.match(/\]\(([^)\s]+)/);
    if (inner) push(inner[1]);
  }
  for (const m of markdown.match(/<img[^>]+src=["']([^"']+)["']/gi) ?? []) {
    const inner = m.match(/src=["']([^"']+)["']/i);
    if (inner) push(inner[1]);
  }
  return Array.from(out).slice(0, 8);
}

/**
 * Screenshots for an app detail page: the images embedded in the repository's
 * README. Returns an empty array when there is no README or no usable images —
 * the caller shows a placeholder carousel in that case.
 */
export async function fetchRepoScreenshots(owner: string, repo: string, token: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: githubHeaders(token),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const content = typeof data?.content === 'string' ? data.content : '';
    if (!content) return [];
    const text = b64ToUtf8(content);
    if (!text) return [];
    return extractReadmeImages(text, `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/`);
  } catch {
    return [];
  }
}
