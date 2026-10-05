import { useCallback, useEffect, useRef, useState } from 'react';

interface DownloadBridge {
  startDownload?: (url: string, fileName: string, token: string) => void;
  installApk?: (path: string) => boolean;
}

export interface ApkDownloadState {
  status: 'idle' | 'downloading' | 'done' | 'error';
  /** 0–100. */
  percent: number;
  received: number;
  total: number;
  /** Bytes per second, measured by the native downloader. */
  speedBps: number;
  path?: string;
  error?: string;
}

const IDLE: ApkDownloadState = { status: 'idle', percent: 0, received: 0, total: 0, speedBps: 0 };

function bridge(): DownloadBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { GitofyAndroid?: DownloadBridge }).GitofyAndroid;
}

/**
 * Drives one in-app APK download at a time.
 *
 * The native shell streams the bytes (so there is no CORS problem) and reports
 * `gitofy-download` events with the real byte counts and the speed it is
 * actually achieving. On completion the Android package installer is opened —
 * the app never installs anything silently.
 *
 * The listener is always torn down, so a cancelled or superseded download can
 * never leave a handler behind updating an unmounted screen.
 */
export function useApkDownload(onDone?: (path: string) => void) {
  const [state, setState] = useState<ApkDownloadState>(IDLE);
  const handlerRef = useRef<((e: Event) => void) | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const cleanup = useCallback(() => {
    if (handlerRef.current) {
      window.removeEventListener('gitofy-download', handlerRef.current as EventListener);
      handlerRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback((url: string, fileName: string, token: string) => {
    cleanup();
    const b = bridge();
    if (!b?.startDownload) {
      setState({ ...IDLE, status: 'error', error: 'Downloads work inside the app, not in the browser preview.' });
      return;
    }

    setState({ status: 'downloading', percent: 0, received: 0, total: 0, speedBps: 0 });

    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        type?: string; percent?: number; received?: number; total?: number; speed?: number; path?: string; error?: string;
      };
      if (!d) return;

      if (d.type === 'progress') {
        setState((prev) => ({
          ...prev,
          status: 'downloading',
          percent: Math.max(0, Math.min(100, d.percent ?? prev.percent)),
          received: d.received ?? prev.received,
          total: d.total ?? prev.total,
          speedBps: d.speed ?? prev.speedBps,
        }));
        return;
      }

      cleanup();
      if (d.type === 'done' && d.path) {
        setState((prev) => ({ ...prev, status: 'done', percent: 100, speedBps: 0, path: d.path }));
        doneRef.current?.(d.path);
        try { b.installApk?.(d.path); } catch { /* the user can install it from the library */ }
      } else {
        setState((prev) => ({ ...prev, status: 'error', error: d.error || 'Download failed.' }));
      }
    };

    handlerRef.current = handler;
    window.addEventListener('gitofy-download', handler as EventListener);
    try {
      b.startDownload(url, fileName, token);
    } catch {
      cleanup();
      setState({ ...IDLE, status: 'error', error: 'Could not start the download.' });
    }
  }, [cleanup]);

  const reset = useCallback(() => { cleanup(); setState(IDLE); }, [cleanup]);

  return { state, start, reset };
}

/** "1.2 MB/s", or an ellipsis while the first sample is still coming. */
export function formatSpeed(bps: number): string {
  if (bps <= 0) return '…';
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}
