/**
 * Optional, on-device crash reporting.
 *
 * Everything stays on the phone. Nothing is uploaded, sent or shared — this is
 * deliberately a *local* log the user can read and copy themselves, so the app
 * can be diagnosed without silently shipping anyone's data anywhere. It is
 * switched off entirely by the `diagnosticsOptIn` setting.
 *
 * The log is a small ring buffer (the newest 50 entries) in localStorage, so a
 * crash loop cannot fill the device.
 */

const STORAGE_KEY = 'gitofy.errorlog';
const MAX_ENTRIES = 50;

export interface ErrorEntry {
  id: string;
  at: number;
  message: string;
  stack?: string;
  /** Where it happened — a screen name, a feature, or "unhandled". */
  context: string;
  appVersion?: string;
}

let enabled = true;
const listeners = new Set<() => void>();

/** Called by the app when the `diagnosticsOptIn` setting changes. */
export function setErrorLogEnabled(on: boolean): void {
  enabled = on;
  if (!on) clearErrors();
}

export function isErrorLogEnabled(): boolean {
  return enabled;
}

function read(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: ErrorEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* storage full or unavailable — the log simply does not persist */
  }
}

function notify(): void {
  listeners.forEach((fn) => { try { fn(); } catch { /* a listener must not break logging */ } });
}

export function subscribeToErrorLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function appVersion(): string | undefined {
  try {
    const bridge = (window as unknown as { GitofyAndroid?: { getAppVersion?: () => string } }).GitofyAndroid;
    return bridge?.getAppVersion?.();
  } catch {
    return undefined;
  }
}

/** Record one failure. Never throws, whatever it is handed. */
export function logError(error: unknown, context = 'app'): void {
  if (!enabled) return;
  try {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));
    const entry: ErrorEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      message: err.message || 'Unknown error',
      stack: err.stack ? err.stack.split('\n').slice(0, 12).join('\n') : undefined,
      context,
      appVersion: appVersion(),
    };
    write([entry, ...read()]);
    notify();
  } catch {
    /* logging must never be the thing that crashes */
  }
}

export function getErrors(): ErrorEntry[] {
  return read();
}

export function clearErrors(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to do */ }
  notify();
}

/** The whole log as plain text, for the copy button. */
export function errorsAsText(): string {
  return read()
    .map((e) => `[${new Date(e.at).toISOString()}] ${e.context}: ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
    .join('\n\n');
}

/**
 * Catch everything the app itself does not: uncaught errors, rejected promises
 * and the native shell's own error channel. Safe to call more than once.
 */
let installed = false;
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => {
    logError(e.error ?? e.message, 'unhandled');
  });
  window.addEventListener('unhandledrejection', (e) => {
    logError(e.reason, 'unhandled promise');
  });
  // The Android shell forwards WebView console errors on this channel.
  window.addEventListener('gitofy:error', (e) => {
    const detail = (e as CustomEvent).detail;
    logError(typeof detail === 'string' ? detail : 'Native error', 'native');
  });
}
