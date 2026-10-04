/**
 * Gitufy Auth — shared types (PRD v2.0 §11)
 *
 * The single source of truth for auth is SessionManager; UI never holds a raw
 * token. These types describe the sealed AuthState machine, accounts, scopes
 * and the user-facing error taxonomy from §9.
 */

/** Stable, non-secret diagnostic + user-facing error taxonomy (§9). */
export type AuthErrorCode =
  | 'E_NET'
  | 'E_CODE_EXPIRED'
  | 'E_DENIED'
  | 'E_RATE'
  | 'E_CONFIG'
  | 'E_SESSION'
  | 'E_ORG'
  | 'E_SCOPE'
  | 'E_UNKNOWN';

export type AuthErrorAction =
  | 'retry'
  | 'new_code'
  | 'login'
  | 'pat'
  | 'report'
  | 'grant'
  | 'fix_org'
  | 'open_apps';

export interface AuthError {
  code: AuthErrorCode;
  /** English fallback; UI resolves a localized string by `code`. */
  message: string;
  /** Short, token/secret-free code safe to show in support screens. */
  diagnostic: string;
  action?: AuthErrorAction;
  retryable: boolean;
  httpStatus?: number;
}

export type TokenKind = 'oauth' | 'pat';
export type AuthProviderKind = 'device' | 'web_pkce' | 'pat';

export interface GitHubAccount {
  /** GitHub user id — stable across renames (§7.5). */
  id: number;
  login: string;
  name?: string | null;
  avatarUrl: string;
  email?: string | null;
  htmlUrl?: string;
  /** Scopes actually granted, parsed from X-OAuth-Scopes (§4). Empty for GitHub Apps. */
  scopes: string[];
  /** False when scopes are not knowable (GitHub App) — the UI then does not hard-gate. */
  scopesKnown?: boolean;
  tokenKind: TokenKind;
  provider: AuthProviderKind;
  loginAt: number;
  lastValidatedAt?: number;
}

export interface AccountRecord {
  account: GitHubAccount;
  token: string;
}

/** Sealed auth state machine (§11). */
export type AuthState =
  | { status: 'idle' }
  | { status: 'requesting_code' }
  | {
      status: 'awaiting_user';
      userCode: string;
      verificationUri: string;
      /** Monotonic epoch-ms deadline computed from expires_in, never the wall clock (§8). */
      expiresAt: number;
      interval: number;
      scope: string;
      isResumed: boolean;
    }
  | {
      status: 'polling';
      userCode: string;
      verificationUri: string;
      expiresAt: number;
      interval: number;
      scope: string;
      isResumed: boolean;
    }
  | { status: 'success'; account: GitHubAccount }
  | { status: 'failed'; error: AuthError }
  | { status: 'expired' };

/** Persisted (encrypted) state that lets polling resume after a process kill (§8). */
export interface DeviceFlowSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  scope: string;
  interval: number;
  /** Epoch-ms; recomputed against a monotonic baseline on restore. */
  expiresAt: number;
  createdAt: number;
}

/** Web flow (PKCE) in-flight session (§6). */
export interface WebPkceSession {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  scope: string;
  createdAt: number;
}

export interface SessionSnapshot {
  activeAccountId: number | null;
  accounts: GitHubAccount[];
  /** True when a stored token exists and the app is considered logged in. */
  isAuthenticated: boolean;
}

export interface AuthResult {
  ok: boolean;
  account?: GitHubAccount;
  error?: AuthError;
}

/** Diagnostics payload surfaced on the Login Diagnostics screen — never a token (§12). */
export interface LoginDiagnostics {
  lastValidatedAt: number | null;
  scopes: string[];
  rateLimitRemaining: number | null;
  rateLimitReset: number | null;
  transport: string;
  storage: string;
  clientConfigured: boolean;
}
