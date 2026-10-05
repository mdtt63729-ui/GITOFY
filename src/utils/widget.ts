/**
 * Home-screen widget summary.
 *
 * The widget itself has no network access — it draws whatever the app last
 * pushed to it. This module builds that short summary and hands it to the
 * native shell, which stores it and redraws every placed widget.
 *
 * It is entirely best-effort: in a browser preview, or if the user has not
 * placed a widget, this is a silent no-op.
 */

interface WidgetBridge {
  updateWidget?: (json: string) => void;
}

export interface WidgetSummary {
  repos: number;
  private: number;
  lastRun?: string;
}

function bridge(): WidgetBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { GitofyAndroid?: WidgetBridge }).GitofyAndroid;
}

/** Count a repository list. Kept pure so it can be tested without a browser. */
export function summariseRepos(repos: { private?: boolean }[]): { repos: number; private: number } {
  const total = repos.length;
  const priv = repos.filter((r) => r.private).length;
  return { repos: total, private: priv };
}

/** A one-line description of a finished workflow run for the widget. */
export function describeRun(workflowName: string, conclusion: string | null, runNumber?: number): string {
  const label =
    conclusion === 'success' ? 'succeeded'
    : conclusion === 'failure' ? 'failed'
    : conclusion === 'cancelled' ? 'cancelled'
    : conclusion === 'timed_out' ? 'timed out'
    : 'finished';
  const number = runNumber ? ` #${runNumber}` : '';
  return `${workflowName}${number} ${label}`;
}

function push(summary: WidgetSummary): void {
  try {
    const b = bridge();
    if (!b?.updateWidget) return;
    b.updateWidget(JSON.stringify(summary));
  } catch {
    /* the widget is optional; never let it break the app */
  }
}

/** Called after the repository list loads. */
export function pushRepoSummary(repos: { private?: boolean }[], lastRun?: string): void {
  const counts = summariseRepos(repos);
  push({ ...counts, lastRun });
}

/** Called when a workflow run finishes, keeping the repository counts. */
export function pushRunSummary(workflowName: string, conclusion: string | null, runNumber?: number): void {
  push({ repos: -1, private: 0, lastRun: describeRun(workflowName, conclusion, runNumber) });
}
