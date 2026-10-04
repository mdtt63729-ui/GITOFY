import type { AuthError, AuthErrorCode, AuthErrorAction } from './types';

/**
 * Central construction + classification of user-facing auth errors (§9, appendix খ).
 * Every error carries a short diagnostic token that never contains a token/secret.
 */

interface Meta {
  message: string;
  action?: AuthErrorAction;
  retryable: boolean;
}

const CATALOG: Record<AuthErrorCode, Meta> = {
  E_NET: { message: 'No internet connection.', action: 'retry', retryable: true },
  E_CODE_EXPIRED: { message: 'The code has expired.', action: 'new_code', retryable: false },
  E_DENIED: { message: 'You cancelled the authorization.', action: 'retry', retryable: true },
  E_RATE: { message: 'Too many attempts. Please try again a little later.', action: 'pat', retryable: true },
  E_CONFIG: { message: 'There is a problem with the app configuration (tell the developer).', action: 'report', retryable: false },
  E_SESSION: { message: 'Your session has ended.', action: 'login', retryable: false },
  E_ORG: { message: 'This organization has restricted Gitufy access.', action: 'fix_org', retryable: false },
  E_SCOPE: { message: 'This action needs additional permission.', action: 'grant', retryable: false },
  E_UNKNOWN: { message: 'Something went wrong.', action: 'retry', retryable: true },
};

let diagSeq = 0;
function nextDiag(code: AuthErrorCode): string {
  diagSeq = (diagSeq + 1) % 100000;
  const stamp = Date.now().toString(36).slice(-4);
  return `${code}-${stamp}${diagSeq.toString(36)}`;
}

export function makeError(
  code: AuthErrorCode,
  overrides: Partial<Pick<AuthError, 'message' | 'action' | 'diagnostic' | 'httpStatus'>> = {}
): AuthError {
  const meta = CATALOG[code] ?? CATALOG.E_UNKNOWN;
  return {
    code,
    message: overrides.message ?? meta.message,
    action: overrides.action ?? meta.action,
    retryable: meta.retryable,
    diagnostic: overrides.diagnostic ?? nextDiag(code),
    httpStatus: overrides.httpStatus,
  };
}

/** Maps a GitHub OAuth device-flow `error` string to our taxonomy (§5.3). */
export function fromDeviceFlowError(error: string, detail?: string): AuthError {
  switch (error) {
    case 'authorization_pending':
      // Not a terminal error — the poller treats this as "keep waiting".
      return makeError('E_UNKNOWN', { message: 'authorization_pending', diagnostic: 'PENDING' });
    case 'slow_down':
      return makeError('E_UNKNOWN', { message: 'slow_down', diagnostic: 'SLOW_DOWN' });
    case 'expired_token':
      return makeError('E_CODE_EXPIRED');
    case 'access_denied':
      return makeError('E_DENIED');
    case 'incorrect_device_code':
    case 'unsupported_grant_type':
    case 'incorrect_client_credentials':
      return makeError('E_CONFIG', { diagnostic: `DEVFLOW_${error}` });
    case 'device_flow_disabled':
      return makeError('E_CONFIG', {
        message: 'Device Flow is not enabled for this OAuth App (developer configuration).',
        action: 'report',
        diagnostic: 'DEVFLOW_DISABLED',
      });
    case 'rate_limit_exceeded':
      return makeError('E_RATE');
    default:
      return makeError('E_UNKNOWN', { diagnostic: `DEVFLOW_${error || 'unknown'}${detail ? ` · ${detail}` : ''}` });
  }
}

/** Maps an HTTP status from api.github.com to the appendix-খ response map. */
export function classifyHttpStatus(
  status: number,
  headers: Headers
): AuthError | null {
  if (status === 401) {
    return makeError('E_SESSION', { httpStatus: status, diagnostic: 'HTTP_401' });
  }
  if (status === 403) {
    const remaining = headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const reset = headers.get('x-ratelimit-reset');
      const mins = reset ? Math.max(0, Math.ceil((Number(reset) * 1000 - Date.now()) / 60000)) : 0;
      return makeError('E_RATE', {
        httpStatus: status,
        diagnostic: `HTTP_403_RATE_${mins}m`,
        message: mins > 0 ? `Rate limited. Try again in about ${mins} minute(s).` : undefined,
      });
    }
    return makeError('E_ORG', { httpStatus: status, diagnostic: 'HTTP_403_ORG' });
  }
  if (status === 404) {
    return makeError('E_SCOPE', { httpStatus: status, diagnostic: 'HTTP_404_SCOPE' });
  }
  return null;
}

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /network|failed to fetch|load failed|timeout|aborted|offline/i.test(msg);
}

export function toAuthError(err: unknown): AuthError {
  if (isNetworkError(err)) return makeError('E_NET');
  const msg = err instanceof Error ? err.message : String(err);
  return makeError('E_UNKNOWN', { message: msg || undefined, diagnostic: 'UNCAUGHT' });
}
