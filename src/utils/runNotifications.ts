/**
 * "Your workflow finished" notifications.
 *
 * A run is polled only while the app is alive, so this fires when the app
 * notices a run has completed — which is the moment the user would otherwise
 * have to keep staring at the screen. It is deliberately quiet: one
 * notification per run, never a repeat for the same run id.
 */

interface NotifyBridge {
  notify?: (title: string, text: string) => void;
}

/** Run ids we have already announced, so a poll cannot notify twice. */
const announced = new Set<number>();

function bridge(): NotifyBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { GitofyAndroid?: NotifyBridge }).GitofyAndroid;
}

export interface RunFinishedInfo {
  runId: number;
  workflowName: string;
  repoName: string;
  conclusion: string | null;
  runNumber?: number;
}

function headline(conclusion: string | null): { title: string; body: string } {
  const label =
    conclusion === 'success' ? 'succeeded'
    : conclusion === 'failure' ? 'failed'
    : conclusion === 'cancelled' ? 'was cancelled'
    : conclusion === 'timed_out' ? 'timed out'
    : 'finished';
  return { title: `Workflow ${label}`, body: '' };
}

/** Fire once per run. Returns true when a notification was actually sent. */
export function notifyRunFinished(info: RunFinishedInfo): boolean {
  if (announced.has(info.runId)) return false;
  announced.add(info.runId);
  // Keep the set from growing for the lifetime of a long session.
  if (announced.size > 200) announced.clear();

  const { title } = headline(info.conclusion);
  const where = info.runNumber ? `${info.workflowName} · #${info.runNumber}` : info.workflowName;
  const body = `${where} — ${info.repoName}`;

  try {
    const b = bridge();
    if (b?.notify) { b.notify(title, body); return true; }
  } catch {
    /* fall through to the web notification */
  }

  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
      return true;
    }
  } catch {
    /* notifications are optional; never let this break the app */
  }
  return false;
}

/** Ask for notification permission once, on the web preview only. */
export function ensureNotificationPermission(): void {
  try {
    if (bridge()?.notify) return; // native handles its own permission
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    /* ignore */
  }
}
