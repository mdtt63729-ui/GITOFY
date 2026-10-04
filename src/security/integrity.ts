/**
 * Build-integrity verification (anti-tamper).
 *
 * The build emits integrity.json (see scripts/generate-integrity.mjs) listing a
 * SHA-256 for every bundle file plus a combined `root`. At runtime we re-hash
 * every listed file, rebuild the root and compare it against both the manifest
 * and a native anchor (res/raw/integrity_root.txt, written by CI). If anything
 * was edited with a file manager and repackaged, the roots no longer match and
 * the app flags itself as unofficial.
 *
 * If integrity.json is absent (dev server) the check is skipped ("unavailable").
 */

export type IntegrityStatus = 'ok' | 'tampered' | 'unavailable';

export interface IntegrityReport {
  status: IntegrityStatus;
  checked: number;
  expectedRoot: string;
  actualRoot: string;
  reason?: string;
}

interface SecurityBridge {
  getExpectedIntegrityRoot?: () => string;
  isDebugBuild?: () => boolean;
}

function bridge(): SecurityBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { GitofyAndroid?: SecurityBridge }).GitofyAndroid;
}

const HEX64 = /^[0-9a-f]{64}$/;

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export async function computeRoot(files: Record<string, string>): Promise<string> {
  const lines = Object.keys(files)
    .sort()
    .map((p) => `${p}:${files[p]}`);
  return sha256Hex(new TextEncoder().encode(lines.join('\n')).buffer as ArrayBuffer);
}

interface Manifest {
  root?: string;
  files?: Record<string, string>;
}

export async function verifyBundleIntegrity(): Promise<IntegrityReport> {
  const unavailable = (reason: string): IntegrityReport => ({
    status: 'unavailable',
    checked: 0,
    expectedRoot: '',
    actualRoot: '',
    reason,
  });

  let manifest: Manifest;
  try {
    const res = await fetch('./integrity.json', { cache: 'no-store' });
    if (!res.ok) return unavailable('no manifest');
    manifest = (await res.json()) as Manifest;
  } catch {
    return unavailable('manifest fetch failed');
  }

  if (!manifest.root || !manifest.files || Object.keys(manifest.files).length === 0) {
    return unavailable('empty manifest');
  }

  const actual: Record<string, string> = {};
  const missing: string[] = [];
  const paths = Object.keys(manifest.files).sort();
  for (const p of paths) {
    try {
      const res = await fetch(`./${p}`, { cache: 'no-store' });
      if (!res.ok) {
        missing.push(p);
        continue;
      }
      actual[p] = await sha256Hex(await res.arrayBuffer());
    } catch {
      missing.push(p);
    }
  }

  const actualRoot = await computeRoot(actual);
  const nativeRoot = (bridge()?.getExpectedIntegrityRoot?.() ?? '').trim();
  const hasNativeAnchor = HEX64.test(nativeRoot);

  const manifestOk = actualRoot === manifest.root;
  const nativeOk = !hasNativeAnchor || nativeRoot === manifest.root;
  const complete = missing.length === 0;

  const status: IntegrityStatus = manifestOk && nativeOk && complete ? 'ok' : 'tampered';
  return {
    status,
    checked: paths.length,
    expectedRoot: hasNativeAnchor ? nativeRoot : manifest.root,
    actualRoot,
    reason: !complete
      ? `${missing.length} file(s) missing`
      : !manifestOk
      ? 'content hash mismatch'
      : !nativeOk
      ? 'anchor mismatch'
      : undefined,
  };
}
