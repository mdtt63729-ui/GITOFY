import { AuthConfig, isGitHubApp } from './config';
import { oauthFormPost } from './oauthHttp';
import { fromDeviceFlowError, isNetworkError, makeError } from './errors';
import type { AuthError } from './types';

/**
 * GitHub OAuth Device Flow provider (§5). No client secret is ever involved.
 * Implements the polling state machine (§5.3): authorization_pending,
 * slow_down (+5s), expired_token, access_denied, device_flow_disabled and
 * network backoff. Polling never drops below `interval` and resumes
 * immediately when the app returns to the foreground.
 */

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

interface RawDeviceCode {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
  detail?: string;
}

export class DeviceFlowCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'DeviceFlowCancelled';
  }
}

/** Lets an external event (app foreground) wake the poll loop immediately. */
class WakeSignal {
  private resolvers: Array<() => void> = [];
  private pending = false;

  wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(new DeviceFlowCancelled());
      };
      const timer = setTimeout(finish, ms);
      if (this.pending) {
        this.pending = false;
        finish();
        return;
      }
      this.resolvers.push(finish);
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  nudge(): void {
    const r = this.resolvers.shift();
    if (r) r();
    else this.pending = true;
  }
}

export interface PollCallbacks {
  onIntervalChanged?: (interval: number) => void;
  onPending?: () => void;
  onOffline?: () => void;
  onOnline?: () => void;
}

/** Pure interpretation of a poll response — kept separate so it is unit-testable. */
export type PollAction =
  | { kind: 'token'; token: string }
  | { kind: 'continue' }
  | { kind: 'slow_down'; interval: number }
  | { kind: 'error'; error: AuthError };

export function nextPollAction(data: { access_token?: string; error?: string }, currentInterval: number): PollAction {
  if (data.access_token) return { kind: 'token', token: data.access_token };
  switch (data.error) {
    case 'authorization_pending':
      return { kind: 'continue' };
    case 'slow_down':
      return { kind: 'slow_down', interval: currentInterval + 5 };
    case 'expired_token':
      return { kind: 'error', error: makeError('E_CODE_EXPIRED') };
    case 'access_denied':
      return { kind: 'error', error: makeError('E_DENIED') };
    case 'rate_limit_exceeded':
      return { kind: 'error', error: makeError('E_RATE') };
    case 'incorrect_device_code':
    case 'unsupported_grant_type':
      return { kind: 'error', error: makeError('E_CONFIG', { diagnostic: `DEVFLOW_${data.error}` }) };
    case 'device_flow_disabled':
      return {
        kind: 'error',
        error: makeError('E_CONFIG', {
          message: 'Device Flow is not enabled for this OAuth App (developer configuration).',
          action: 'report',
          diagnostic: 'DEVFLOW_DISABLED',
        }),
      };
    default:
      return {
        kind: 'error',
        error: data.error
          ? fromDeviceFlowError(data.error)
          : makeError('E_UNKNOWN', { diagnostic: 'DEVFLOW_NO_TOKEN' }),
      };
  }
}

export class GitHubDeviceFlowProvider {
  readonly wake = new WakeSignal();

  async requestDeviceCode(scope: string, signal?: AbortSignal): Promise<DeviceCodeResponse> {
    // GitHub Apps use fine-grained app permissions, not OAuth scopes, so the
    // `scope` parameter is omitted for them (it would otherwise be rejected).
    const body: Record<string, string> = { client_id: AuthConfig.clientId };
    if (!isGitHubApp()) body.scope = scope;
    let data = (await oauthFormPost(AuthConfig.endpoints.deviceCode, body, signal)).json as RawDeviceCode;
    // One retry if the native transport reported a network error.
    if (data.error === 'network_error') {
      data = (await oauthFormPost(AuthConfig.endpoints.deviceCode, body, signal)).json as RawDeviceCode;
    }
    if (data.error) throw fromDeviceFlowError(data.error, data.detail);
    if (!data.device_code || !data.user_code) {
      throw makeError('E_CONFIG', { diagnostic: 'DEVFLOW_BAD_RESPONSE' });
    }
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri || AuthConfig.endpoints.deviceVerification,
      expiresIn: data.expires_in ?? AuthConfig.defaults.expiresIn,
      interval: data.interval ?? AuthConfig.defaults.interval,
    };
  }

  /**
   * Runs the poll loop until a token is obtained, the code expires, the user
   * denies, or the signal aborts. Returns the raw access token string.
   */
  async pollForToken(
    params: { deviceCode: string; interval: number; expiresAt: number },
    cb: PollCallbacks = {},
    signal?: AbortSignal
  ): Promise<string> {
    let intervalSec = Math.max(0.05, params.interval);
    let backoffMs = 0;
    let offline = false;

    for (;;) {
      if (signal?.aborted) throw new DeviceFlowCancelled();

      const remaining = params.expiresAt - Date.now();
      if (remaining <= 0) throw makeError('E_CODE_EXPIRED');

      const waitMs = Math.min(intervalSec * 1000 + backoffMs, remaining);
      await this.wake.wait(waitMs, signal);

      if (signal?.aborted) throw new DeviceFlowCancelled();
      if (Date.now() >= params.expiresAt) throw makeError('E_CODE_EXPIRED');

      let result;
      try {
        result = await oauthFormPost(
          AuthConfig.endpoints.accessToken,
          {
            client_id: AuthConfig.clientId,
            device_code: params.deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          },
          signal
        );
      } catch (err) {
        if (err instanceof DeviceFlowCancelled) throw err;
        if (isNetworkError(err)) {
          if (!offline) {
            offline = true;
            cb.onOffline?.();
          }
          // Exponential backoff, capped, but never stop polling (§5.3).
          backoffMs = Math.min(backoffMs === 0 ? 2000 : backoffMs * 2, 30000);
          continue;
        }
        throw err;
      }

      if (offline) {
        offline = false;
        backoffMs = 0;
        cb.onOnline?.();
      }

      const data = result.json as { access_token?: string; error?: string };
      const action = nextPollAction(data, intervalSec);
      if (action.kind === 'token') return action.token;
      if (action.kind === 'continue') {
        cb.onPending?.();
        continue;
      }
      if (action.kind === 'slow_down') {
        intervalSec = action.interval;
        cb.onIntervalChanged?.(intervalSec);
        continue;
      }
      throw action.error;
    }
  }
}

export const deviceFlowProvider = new GitHubDeviceFlowProvider();
