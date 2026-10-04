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

/**
 * Runs the two startup checks and drives the security sheet:
 *  1. bundle integrity (anti-tamper) — blocking "unofficial app" popup;
 *  2. a newer GitHub release — non-blocking "update available" popup.
 *
 * The download button always tries the in-app download; if no release metadata
 * is reachable (e.g. a private repo while signed out) it opens the releases page.
 */

export const RELEASES_PAGE = 'https://github.com/mdtt63729-ui/GITOFY/releases/latest';

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

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      if (!integrityDoneRef.current) {
        integrityDoneRef.current = true;
        const debug = bridge()?.isDebugBuild?.() ?? false;
        const report = await verifyBundleIntegrity();
        if (!cancelled && report.status === 'tampered' && !debug) {
          tamperedRef.current = true;
          setMode('unofficial');
          setPhase('idle');
          setError(null);
          setVisible(true);
        }
      }

      if (releaseRef.current || suppressedRef.current) return;
      if (lastTokenRef.current === token && lastTokenRef.current !== undefined) return;
      lastTokenRef.current = token;

      const latest = await fetchLatestRelease(token);
      if (cancelled || !latest) return;
      releaseRef.current = latest;
      if (tamperedRef.current) return;

      const installed = getInstalledVersion();
      if (installed && isUpdateAvailable(latest.version, installed)) {
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
  }, [ready, token]);

  const onDownload = useCallback(async () => {
    const info = releaseRef.current;
    if (!info) {
      // No metadata (e.g. private repo signed-out) — open the releases page.
      const b = bridge();
      if (b?.openCustomTab) b.openCustomTab(RELEASES_PAGE);
      else window.open(RELEASES_PAGE, '_blank', 'noopener');
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
    if (mode === 'update') setVisible(false);
  }, [mode]);

  const onContinue = useCallback(() => {
    setVisible(false);
  }, []);

  return { visible, mode, version, apkName, phase, progress, error, onDownload, onLater, onContinue };
}
