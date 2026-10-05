import { useCallback, useEffect, useRef, useState } from 'react';
import { verifyBundleIntegrity } from './integrity';
import {
  downloadApk,
  fetchLatestRelease,
  getInstalledVersion,
  installApk,
  isUpdateAvailable,
  type ReleaseInfo,
} from './updater';
import type { DownloadPhase, SecurityMode } from '../screens/security/SecuritySheet';
import { openExternal } from '../utils/external';

/**
 * Runs the two startup checks and drives the security sheet:
 *  1. bundle integrity (anti-tamper) — blocking "unofficial app" popup;
 *  2. a newer GitHub release — non-blocking "update available" popup.
 *
 * The download button always tries the in-app download; if no release metadata
 * is reachable (e.g. a private repo while signed out) it opens the releases page.
 */

export const RELEASES_PAGE = 'https://github.com/mdtt63729-ui/GITOFY/releases/latest';

/** Remembers the last APK asset we saw, so a re-uploaded APK is detected too. */
const LAST_ASSET_KEY = 'gitofy.lastAssetId';

interface SecurityBridge {
  isDebugBuild?: () => boolean;
  openCustomTab?: (url: string) => void;
}

function bridge(): SecurityBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { GitofyAndroid?: SecurityBridge }).GitofyAndroid;
}

export interface SecurityGateState {
  visible: boolean;
  mode: SecurityMode;
  version?: string;
  apkName?: string;
  phase: DownloadPhase;
  progress: number;
  error: string | null;
  onDownload: () => void;
  onLater: () => void;
  onContinue: () => void;
}

export function useSecurityGate(ready: boolean, token: string | null): SecurityGateState {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<SecurityMode>('update');
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [apkName, setApkName] = useState<string | undefined>(undefined);
  const [phase, setPhase] = useState<DownloadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const integrityDoneRef = useRef(false);
  const tamperedRef = useRef(false);
  const releaseRef = useRef<ReleaseInfo | null>(null);
  const lastTokenRef = useRef<string | null | undefined>(undefined);
  const suppressedRef = useRef(false);
  // True once the user has actually touched the screen while the sheet is up.
  const gestureRef = useRef(false);
  const lastRunRef = useRef(-1);
  const dismissedRef = useRef<string | null>(null);
  const [tick, setTick] = useState(0);

  // Re-check for a newer release whenever the app returns to the foreground, so
  // a freshly published APK is noticed without restarting the app.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') setTick((t) => t + 1); };
    document.addEventListener('visibilitychange', onVis);
    // Also poll while the app is open, so an APK uploaded to the release shows
    // up within a minute instead of only after backgrounding or restarting.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    }, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(timer);
    };
  }, []);

  // Track a real touch so onDownload can refuse an automatic activation.
  useEffect(() => {
    if (!visible) {
      gestureRef.current = false;
      return;
    }
    const mark = () => { gestureRef.current = true; };
    window.addEventListener('pointerdown', mark, { once: true });
    window.addEventListener('touchstart', mark, { once: true });
    window.addEventListener('click', mark, { once: true });
    return () => {
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('touchstart', mark);
      window.removeEventListener('click', mark);
    };
  }, [visible]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      if (!integrityDoneRef.current) {
        integrityDoneRef.current = true;
        // NOTE: no debug-build bypass — a modified bundle must always be flagged,
        // otherwise a repackaged app could hide the warning just by being debuggable.
        const report = await verifyBundleIntegrity();
        if (!cancelled && report.status === 'tampered') {
          tamperedRef.current = true;
          setMode('unofficial');
          setPhase('idle');
          setError(null);
          setVisible(true);
        }
      }

      if (suppressedRef.current) return;
      if (lastRunRef.current === tick && lastTokenRef.current === token) return;
      lastRunRef.current = tick;
      lastTokenRef.current = token;

      const latest = await fetchLatestRelease(token);
      if (cancelled || !latest) return;
      releaseRef.current = latest;
      if (tamperedRef.current) return;

      const installed = getInstalledVersion();
      const assetId = latest.apiAssetUrl.split('/').pop() || '';
      const key = `${latest.version}:${assetId}`;

      // Offer the update when the release version is newer than what is installed,
      // OR when the same release's APK asset was replaced (a re-uploaded build) —
      // which is how "a new APK uploaded to the release" gets surfaced in-app.
      let lastSeen = '';
      try { lastSeen = localStorage.getItem(LAST_ASSET_KEY) || ''; } catch { /* ignore */ }
      const newer = !!installed && isUpdateAvailable(latest.version, installed);
      const replaced = !!lastSeen && !!assetId && lastSeen !== assetId;
      try { if (assetId) localStorage.setItem(LAST_ASSET_KEY, assetId); } catch { /* ignore */ }

      if (dismissedRef.current === key) return;
      if (newer || replaced) {
        setMode('update');
        setVersion(latest.version);
        setApkName(latest.apkName);
        setPhase('idle');
        setError(null);
        setVisible(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, token, tick]);

  const onDownload = useCallback(async () => {
    // Safety net: a download may only ever start from an actual touch on the
    // sheet, never from a synthetic/automatic activation.
    if (!gestureRef.current) return;
    const info = releaseRef.current;
    if (!info) {
      // No metadata (e.g. private repo signed-out) — open the releases page.
      const b = bridge();
      if (b?.openCustomTab) b.openCustomTab(RELEASES_PAGE);
      else openExternal(RELEASES_PAGE);
      return;
    }
    setPhase('downloading');
    setProgress(0);
    setError(null);

    const res = await downloadApk(info, token, (p) => setProgress(p));
    if (!res.ok || !res.path) {
      setPhase('error');
      setError(res.error ?? 'Download failed.');
      return;
    }

    setProgress(100);
    setPhase('installing');
    const installed = installApk(res.path);
    if (!installed) {
      setPhase('error');
      setError('Could not open the installer.');
      return;
    }
    setPhase('done');
    suppressedRef.current = true;
    window.setTimeout(() => setVisible(false), 1500);
  }, [token]);

  const onLater = useCallback(() => {
    if (mode === 'update') {
      // Remember the version the user dismissed so a foreground re-check does not
      // nag about the same one again.
      dismissedRef.current = `${releaseRef.current?.version ?? ''}:${(releaseRef.current?.apiAssetUrl ?? '').split('/').pop() ?? ''}`;
      setVisible(false);
    }
  }, [mode]);

  const onContinue = useCallback(() => {
    setVisible(false);
  }, []);

  return { visible, mode, version, apkName, phase, progress, error, onDownload, onLater, onContinue };
}
