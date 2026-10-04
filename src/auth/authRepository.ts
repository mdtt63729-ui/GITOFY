import { AuthConfig, isGitHubApp } from './config';
import { deviceFlowProvider } from './deviceFlow';
import { sessionManager } from './sessionManager';
import { tokenRepository } from './tokenRepository';
import { parseScopesHeader, BASE_SCOPES, FEATURE_SCOPES, scopesToString, unionScopes } from './scopes';
import { makeError, toAuthError } from './errors';
import type { AccountRecord, AuthError, AuthProviderKind, GitHubAccount, TokenKind } from './types';

/**
 * AuthRepository (§11) — orchestrates the providers and hands results to the
 * SessionManager. Providers: device (primary), web+PKCE (optional), PAT
 * (fallback). All three converge on `fetchProfile`, which reads X-OAuth-Scopes
 * so the UI reflects the scopes *actually* granted (§4).
 */

interface GitHubUserResponse {
  id: number;
  login: string;
  name?: string | null;
  avatar_url?: string;
  email?: string | null;
  html_url?: string;
}

export interface ProfileResult {
  account: GitHubAccount;
  token: string;
}

async function fetchProfile(
  token: string,
  kind: TokenKind,
  provider: AuthProviderKind
): Promise<ProfileResult> {
  const res = await fetch(AuthConfig.endpoints.userApi, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    if (res.status === 401) throw makeError('E_SESSION', { httpStatus: 401, diagnostic: 'PROFILE_401' });
    throw makeError('E_UNKNOWN', { diagnostic: `PROFILE_${res.status}`, httpStatus: res.status });
  }
  const data = (await res.json()) as GitHubUserResponse;
  const isApp = isGitHubApp();
  const scopes = isApp ? [] : parseScopesHeader(res.headers.get('x-oauth-scopes'));
  const account: GitHubAccount = {
    id: data.id,
    login: data.login,
    name: data.name ?? null,
    avatarUrl: data.avatar_url ?? '',
    email: data.email ?? null,
    htmlUrl: data.html_url,
    scopes,
    scopesKnown: !isApp,
    tokenKind: kind,
    provider,
    loginAt: Date.now(),
    lastValidatedAt: Date.now(),
  };
  return { account, token };
}

export class AuthRepository {
  /** Primary flow: Device Flow (§5). */
  async loginWithDevice(
    scope: string,
    handlers: {
      onCode: (info: {
        userCode: string;
        verificationUri: string;
        expiresAt: number;
        interval: number;
      }) => void;
      onPolling: () => void;
      onIntervalChanged?: (interval: number) => void;
      onOffline?: () => void;
      onOnline?: () => void;
    },
    signal?: AbortSignal
  ): Promise<ProfileResult> {
    const code = await deviceFlowProvider.requestDeviceCode(scope, signal);
    const expiresAt = Date.now() + code.expiresIn * 1000;

    await tokenRepository.setDeviceSession({
      deviceCode: code.deviceCode,
      userCode: code.userCode,
      verificationUri: code.verificationUri,
      scope,
      interval: code.interval,
      expiresAt,
      createdAt: Date.now(),
    });

    handlers.onCode({
      userCode: code.userCode,
      verificationUri: code.verificationUri,
      expiresAt,
      interval: code.interval,
    });

    const token = await deviceFlowProvider.pollForToken(
      { deviceCode: code.deviceCode, interval: code.interval, expiresAt },
      {
        onPending: handlers.onPolling,
        onIntervalChanged: handlers.onIntervalChanged,
        onOffline: handlers.onOffline,
        onOnline: handlers.onOnline,
      },
      signal
    );

    await tokenRepository.setDeviceSession(null);
    return fetchProfile(token, 'oauth', 'device');
  }

  /** Fallback flow: a user-supplied Personal Access Token (§3.2). */
  async loginWithPat(token: string): Promise<ProfileResult> {
    const clean = token.trim();
    if (!clean) throw makeError('E_CONFIG', { diagnostic: 'PAT_EMPTY' });
    return fetchProfile(clean, 'pat', 'pat');
  }

  /** Optional Web + PKCE flow — token exchange happens in webPkce.ts (§6). */
  async loginWithWebToken(token: string): Promise<ProfileResult> {
    return fetchProfile(token, 'oauth', 'web_pkce');
  }

  async persist(result: ProfileResult): Promise<void> {
    const record: AccountRecord = { account: result.account, token: result.token };
    await sessionManager.persistAccount(record);
  }

  /** Re-validate the active session in the background (§7.3). */
  async validateActiveSession(): Promise<void> {
    const token = sessionManager.getActiveToken();
    if (!token) return;
    try {
      const profile = await fetchProfile(token, sessionManager.getActiveAccount()?.tokenKind ?? 'oauth', sessionManager.getActiveAccount()?.provider ?? 'device');
      await sessionManager.updateAccount({ ...profile.account, loginAt: sessionManager.getActiveAccount()?.loginAt ?? Date.now() });
    } catch (err) {
      sessionManager.handleAuthError(err instanceof Error && 'code' in err ? (err as unknown as AuthError) : toAuthError(err));
    }
  }

  /** Compute the scopes still needed for a feature and the combined request (§4). */
  planEscalation(feature: string): { required: string[]; missing: string[]; combined: string } | null {
    const required = FEATURE_SCOPES[feature];
    if (!required) return null;
    const granted = sessionManager.snapshot().scopes;
    const missing = required.filter((s) => !granted.includes(s));
    if (missing.length === 0) return null;
    const combined = scopesToString(unionScopes(granted, required));
    return { required, missing, combined };
  }

  defaultScopeString(): string {
    return scopesToString(BASE_SCOPES);
  }
}

export const authRepository = new AuthRepository();
