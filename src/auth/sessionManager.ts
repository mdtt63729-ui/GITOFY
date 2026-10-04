import { tokenRepository } from './tokenRepository';
import { makeError } from './errors';
import type { AccountRecord, AuthError, GitHubAccount, SessionSnapshot } from './types';

/**
 * SessionManager (§11) — the single source of truth. Owns accounts, the active
 * account, the in-memory token, granted scopes and the session-expired signal.
 * The UI never reads a token directly; it reads the snapshot this emits.
 */

export type SessionStatus = 'loading' | 'authenticated' | 'logged_out' | 'expired';

export interface SessionState extends SessionSnapshot {
  status: SessionStatus;
  token: string | null;
  scopes: string[];
  lastError: AuthError | null;
  rateLimitRemaining: number | null;
  rateLimitReset: number | null;
}

type Listener = (state: SessionState) => void;

class SessionManager {
  private accounts: GitHubAccount[] = [];
  private activeAccountId: number | null = null;
  private token: string | null = null;
  private scopes: string[] = [];
  private status: SessionStatus = 'loading';
  private lastError: AuthError | null = null;
  private rateLimitRemaining: number | null = null;
  private rateLimitReset: number | null = null;
  private listeners = new Set<Listener>();
  private initialized = false;
  private sessionExpiredNotified = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }

  snapshot(): SessionState {
    return {
      status: this.status,
      token: this.token,
      accounts: this.accounts,
      activeAccountId: this.activeAccountId,
      isAuthenticated: this.status === 'authenticated' && !!this.token,
      scopes: this.scopes,
      lastError: this.lastError,
      rateLimitRemaining: this.rateLimitRemaining,
      rateLimitReset: this.rateLimitReset,
    };
  }

  /** Cold-start restore from encrypted storage (§7.3). Fast: no network here. */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      this.accounts = await tokenRepository.listAccounts();
      this.activeAccountId = await tokenRepository.getActiveAccountId();
      if (this.activeAccountId != null) {
        this.token = await tokenRepository.getToken(this.activeAccountId);
        const active = this.accounts.find((a) => a.id === this.activeAccountId);
        this.scopes = active?.scopes ?? [];
      }
      this.status = this.token ? 'authenticated' : 'logged_out';
    } catch {
      this.status = 'logged_out';
    }
    this.emit();
  }

  getActiveToken(): string | null {
    return this.token;
  }

  getActiveAccount(): GitHubAccount | null {
    return this.accounts.find((a) => a.id === this.activeAccountId) ?? null;
  }

  isAuthenticated(): boolean {
    return this.status === 'authenticated' && !!this.token;
  }

  async persistAccount(record: AccountRecord, makeActive = true): Promise<void> {
    await tokenRepository.saveRecord(record);
    const idx = this.accounts.findIndex((a) => a.id === record.account.id);
    if (idx >= 0) this.accounts[idx] = record.account;
    else this.accounts = [...this.accounts, record.account];

    if (makeActive) {
      this.activeAccountId = record.account.id;
      this.token = record.token;
      this.scopes = record.account.scopes;
      this.status = 'authenticated';
      this.sessionExpiredNotified = false;
      await tokenRepository.setActiveAccountId(record.account.id);
    }
    this.lastError = null;
    this.emit();
  }

  async switchAccount(id: number): Promise<void> {
    const token = await tokenRepository.getToken(id);
    if (!token) return;
    this.activeAccountId = id;
    this.token = token;
    this.scopes = this.accounts.find((a) => a.id === id)?.scopes ?? [];
    this.status = 'authenticated';
    await tokenRepository.setActiveAccountId(id);
    this.emit();
  }

  async updateAccount(account: GitHubAccount): Promise<void> {
    const existingToken = (await tokenRepository.getToken(account.id)) ?? this.token ?? '';
    await tokenRepository.saveRecord({ account, token: existingToken });
    this.accounts = this.accounts.map((a) => (a.id === account.id ? account : a));
    if (account.id === this.activeAccountId) this.scopes = account.scopes;
    this.emit();
  }

  /** Removes one account. If it was active, falls back to another or logs out. */
  async removeAccount(id: number): Promise<void> {
    await tokenRepository.deleteAccount(id);
    this.accounts = this.accounts.filter((a) => a.id !== id);
    if (this.activeAccountId === id) {
      const next = this.accounts[0];
      if (next) {
        await this.switchAccount(next.id);
      } else {
        this.activeAccountId = null;
        this.token = null;
        this.scopes = [];
        this.status = 'logged_out';
        await tokenRepository.setActiveAccountId(null);
      }
    }
    this.emit();
  }

  /** Full local wipe of every account and cache (§7.4). */
  async logoutAll(): Promise<void> {
    await tokenRepository.clearAll();
    this.accounts = [];
    this.activeAccountId = null;
    this.token = null;
    this.scopes = [];
    this.status = 'logged_out';
    this.lastError = null;
    this.emit();
  }

  /** Called by the AuthInterceptor on a 401 — emits exactly one "session ended". */
  handleAuthError(error: AuthError): void {
    if (error.code === 'E_SESSION') {
      this.status = 'expired';
      this.lastError = error;
      if (!this.sessionExpiredNotified) {
        this.sessionExpiredNotified = true;
      }
      this.emit();
      return;
    }
    if (error.code === 'E_RATE') {
      const match = /HTTP_403_RATE_(\d+)m/.exec(error.diagnostic);
      this.rateLimitRemaining = 0;
      this.rateLimitReset = match ? Date.now() + Number(match[1]) * 60000 : null;
    }
    this.lastError = error;
    this.emit();
  }

  /** Clears the session-expired state after the user re-authenticates. */
  clearExpired(): void {
    this.sessionExpiredNotified = false;
    if (this.status === 'expired') {
      this.status = this.token ? 'authenticated' : 'logged_out';
      this.lastError = null;
      this.emit();
    }
  }

  setError(error: AuthError | null): void {
    this.lastError = error;
    this.emit();
  }

  buildSessionExpiredError(): AuthError {
    return makeError('E_SESSION');
  }
}

export const sessionManager = new SessionManager();
