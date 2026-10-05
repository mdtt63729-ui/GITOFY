/**
 * In-app update + download (reads the latest GitHub release of the app's own
 * repository, then downloads and installs the APK inside the app).
 *
 * Works signed-out for public repos and with the user's OAuth token for private
 * ones. Downloads are performed by the native bridge (HttpURLConnection) so the
 * APK streams to cache without CORS restrictions, reporting progress back to
 * the web layer through a `gitofy-download` window event.
 */

export const RELEASE_REPO = 'mdtt63729-ui/GITOFY';

export interface ReleaseInfo {
  tag: string;
  version: string;
  apkName: string;
  /** Direct asset URL (public repos). */
  downloadUrl: string;
  /** Asset API URL (used with auth + Accept: octet-stream for private repos). */
  apiAssetUrl: string;
  notes: string;
  publishedAt: string;
}

interface SecurityBridge {
  getAppVersion?: () => string;
  getAppVersionCode?: () => number;
  startDownload?: (url: string, fileName: string, token: string) => void;
  installApk?: (path: string) => boolean;
}

function bridge(): SecurityBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { GitofyAndroid?: SecurityBridge }).GitofyAndroid;
}

export function getInstalledVersion(): string {
  return bridge()?.getAppVersion?.() ?? '';
}

/** Returns [major, minor, patch] ignoring a leading "v" and any suffix. */
export function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split(/[.\-+]/)
    .map((n) => parseInt(n, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function isUpdateAvailable(latest: string, current: string): boolean {
  if (!latest || !current) return false;
  return compareVersions(latest, current) > 0;
}

export async function fetchLatestRelease(token?: string | null): Promise<ReleaseInfo | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, { headers });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      tag_name?: string;
      body?: string;
      published_at?: string;
      assets?: Array<{ name: string; browser_download_url: string; url: string }>;
    };
    const asset = (d.assets ?? []).find((a) => a.name.toLowerCase().endsWith('.apk'));
    if (!asset || !d.tag_name) return null;
    return {
      tag: d.tag_name,
      version: d.tag_name.replace(/^v/i, ''),
      apkName: asset.name,
      downloadUrl: asset.browser_download_url,
      apiAssetUrl: asset.url,
      notes: d.body ?? '',
      publishedAt: d.published_at ?? '',
    };
  } catch {
    return null;
  }
}

export interface DownloadResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/** Streams the APK via the native bridge; resolves when finished or failed. */
export interface DownloadProgress {
  percent: number;
  /** Bytes written so far (exact). */
  received: number;
  /** Total bytes, when the server reports a length. */
  total: number;
  /** Bytes per second, measured by the native downloader. */
  speedBps: number;
}

export function downloadApk(
  info: ReleaseInfo,
  token: string | null,
  onProgress: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  return new Promise((resolve) => {
    const b = bridge();
    if (!b?.startDownload) {
      resolve({ ok: false, error: 'In-app download is unavailable on this platform.' });
      return;
    }
    const url = token ? info.apiAssetUrl : info.downloadUrl;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        type: string;
        percent?: number;
        received?: number;
        total?: number;
        speed?: number;
        path?: string;
        error?: string;
      };
      if (!detail) return;
      if (detail.type === 'progress') {
        onProgress({
          percent: Math.max(0, Math.min(100, detail.percent ?? 0)),
          received: detail.received ?? 0,
          total: detail.total ?? 0,
          speedBps: detail.speed ?? 0,
        });
        return;
      }
      window.removeEventListener('gitofy-download', handler as EventListener);
      if (detail.type === 'done' && detail.path) resolve({ ok: true, path: detail.path });
      else resolve({ ok: false, error: detail.error || 'Download failed.' });
    };
    window.addEventListener('gitofy-download', handler as EventListener);

    try {
      b.startDownload(url, info.apkName, token ?? '');
    } catch {
      window.removeEventListener('gitofy-download', handler as EventListener);
      resolve({ ok: false, error: 'Could not start the download.' });
    }
  });
}

export function installApk(path: string): boolean {
  return bridge()?.installApk?.(path) ?? false;
}
