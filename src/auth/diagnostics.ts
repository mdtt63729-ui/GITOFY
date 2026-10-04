/**
 * Privacy-preserving observability (§14). Funnel events and error counts only —
 * never a token, secret, username or any PII. Anonymous and opt-in; can be
 * disabled at any time. Alerts the developer when E_CONFIG / device_flow_disabled
 * spikes.
 */

export type FunnelEvent =
  | 'login_tap'
  | 'code_shown'
  | 'github_opened'
  | 'authorized'
  | 'token_ok'
  | 'home_shown';

interface DiagState {
  enabled: boolean;
  funnel: Partial<Record<FunnelEvent, number>>;
  errorCounts: Record<string, number>;
  lastLoginStartedAt: number | null;
  lastStepAt: number | null;
  timings: number[];
}

const state: DiagState = {
  enabled: true,
  funnel: {},
  errorCounts: {},
  lastLoginStartedAt: null,
  lastStepAt: null,
  timings: [],
};

export function setDiagnosticsEnabled(enabled: boolean): void {
  state.enabled = enabled;
}

export function isDiagnosticsEnabled(): boolean {
  return state.enabled;
}

export function trackFunnel(event: FunnelEvent): void {
  if (!state.enabled) return;
  state.funnel[event] = (state.funnel[event] ?? 0) + 1;
  const now = Date.now();
  if (event === 'login_tap') {
    state.lastLoginStartedAt = now;
    state.lastStepAt = now;
  } else if (event === 'home_shown' && state.lastLoginStartedAt) {
    state.timings.push(now - state.lastLoginStartedAt);
    state.lastLoginStartedAt = null;
  }
  state.lastStepAt = now;
}

export function trackError(code: string): void {
  if (!state.enabled) return;
  state.errorCounts[code] = (state.errorCounts[code] ?? 0) + 1;
}

/** Developer-facing alert heuristic: sudden E_CONFIG spikes (§14). */
export function shouldAlertDeveloper(code: string): boolean {
  return (state.errorCounts[code] ?? 0) >= 5;
}

export function getFunnelSnapshot(): {
  funnel: Partial<Record<FunnelEvent, number>>;
  errorCounts: Record<string, number>;
  medianLoginMs: number | null;
  conversion: number;
} {
  const funnel = { ...state.funnel };
  const started = funnel.login_tap ?? 0;
  const done = funnel.home_shown ?? 0;
  const sorted = [...state.timings].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  return {
    funnel,
    errorCounts: { ...state.errorCounts },
    medianLoginMs: median,
    conversion: started ? done / started : 0,
  };
}
