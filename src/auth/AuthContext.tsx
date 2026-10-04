import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { authRepository, type ProfileResult } from './authRepository';
import { sessionManager, type SessionState } from './sessionManager';
import { tokenRepository } from './tokenRepository';
import { installAuthInterceptor } from './authFetch';
import { DeviceFlowCancelled } from './deviceFlow';
import { AuthConfig, isClientConfigured } from './config';
import { makeError, toAuthError } from './errors';
import { trackError, trackFunnel } from './diagnostics';
import { BASE_SCOPES, FEATURE_SCOPES, SCOPE_CATALOG, scopesToString } from './scopes';
import { buildAuthorizeUrl, createWebSession, exchangeCodeForToken, validateCallback } from './webPkce';
import type { AuthError, AuthState, GitHubAccount } from './types';

interface OpenBridge {
  openCustomTab?: (url: string) => void;
  copyText?: (text: string, sensitive?: boolean) => void;
  setSecureFlag?: (on: boolean) => void;
}

function bridge(): OpenBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { GitofyAndroid?: OpenBridge }).GitofyAndroid;
}

export interface AuthContextValue {
  session: SessionState;
  authState: AuthState;
  ready: boolean;
  clientConfigured: boolean;
  accounts: GitHubAccount[];
  activeAccount: GitHubAccount | null;
  grantedScopes: string[];
  startDeviceLogin: (opts?: { scope?: string; feature?: string }) => Promise<void>;
  retryNewCode: () => void;
  cancelLogin: () => void;
  resetLogin: () => void;
  loginWithPat: (token: string) => Promise<{ ok: boolean; error?: AuthError }>;
  startWebFlow: () => Promise<void>;
  requestFeatureScope: (feature: string) => Promise<{ ok: boolean; error?: AuthError }>;
  switchAccount: (id: number) => Promise<void>;
  removeAccount: (id: number) => Promise<void>;
  logoutActive: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshSession: () => Promise<void>;
  openVerificationUri: (uri: string) => void;
  copyText: (text: string, sensitive?: boolean) => Promise<void>;
  dismissError: () => void;
  hasScope: (scope: string) => boolean;
  scopeCatalog: typeof SCOPE_CATALOG;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { updateSettings } = useTheme();
  const [session, setSession] = useState<SessionState>(() => sessionManager.snapshot());
  const [authState, setAuthState] = useState<AuthState>({ status: 'idle' });
  const [ready, setReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastSyncedAccountId = useRef<number | null | undefined>(undefined);

  // Keep the (non-secret) profile mirror in ThemeContext in sync so existing
  // screens that read settings.githubUsername / avatarUrl keep working, and so
  // cold-start can paint Home instantly. The token is mirrored in memory only.
  useEffect(() => {
    const active = session.accounts.find((a) => a.id === session.activeAccountId) ?? null;
    if (lastSyncedAccountId.current === session.activeAccountId && session.isAuthenticated) return;
    lastSyncedAccountId.current = session.activeAccountId;
    updateSettings({
      personalAccessToken: session.token ?? '',
      githubUsername: active?.login ?? '',
      avatarUrl: active?.avatarUrl ?? '',
    });
  }, [session.activeAccountId, session.isAuthenticated, session.token, session.accounts, updateSettings]);

  // Install the central 401/403 interceptor once.
  useEffect(() => {
    const uninstall = installAuthInterceptor({
      getActiveToken: () => sessionManager.getActiveToken(),
      onAuthError: (error) => {
        trackError(error.code);
        sessionManager.handleAuthError(error);
      },
    });
    return uninstall;
  }, []);

  const beginPolling = useCallback(
    (
      info: { userCode: string; verificationUri: string; expiresAt: number; interval: number; scope: string },
      isResumed: boolean
    ) => {
      setAuthState({
        status: 'awaiting_user',
        userCode: info.userCode,
        verificationUri: info.verificationUri,
        expiresAt: info.expiresAt,
        interval: info.interval,
        scope: info.scope,
        isResumed,
      });
      trackFunnel('code_shown');
    },
    []
  );

  const startDeviceLogin = useCallback(
    async (opts?: { scope?: string; feature?: string }) => {
      if (!isClientConfigured()) {
        const error = makeError('E_CONFIG', {
          message: 'Gitufy has no GitHub client_id configured. Set VITE_GITHUB_CLIENT_ID.',
          action: 'report',
          diagnostic: 'NO_CLIENT_ID',
        });
        setAuthState({ status: 'failed', error });
        return;
      }
      trackFunnel('login_tap');
      setAuthState({ status: 'requesting_code' });
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let scope = opts?.scope ?? scopesToString(BASE_SCOPES);
      if (opts?.feature) {
        const plan = authRepository.planEscalation(opts.feature);
        if (plan) scope = plan.combined;
        else scope = opts?.scope ?? scopesToString(BASE_SCOPES);
      }

      try {
        const result = await authRepository.loginWithDevice(
          scope,
          {
            onCode: (info) => beginPolling({ ...info, scope }, false),
            onPolling: () => {
              setAuthState((prev) =>
                prev.status === 'awaiting_user' || prev.status === 'polling'
                  ? { ...prev, status: 'polling' }
                  : prev
              );
            },
            onIntervalChanged: (interval) =>
              setAuthState((prev) =>
                'expiresAt' in prev ? { ...prev, interval } : prev
              ),
            onOffline: () =>
              setAuthState((prev) =>
                'expiresAt' in prev ? { ...prev } : prev
              ),
          },
          controller.signal
        );
        trackFunnel('token_ok');
        await authRepository.persist(result);
        setAuthState({ status: 'success', account: result.account });
      } catch (err) {
        if (err instanceof DeviceFlowCancelled) {
          setAuthState({ status: 'idle' });
          return;
        }
        const error = (err as AuthError)?.code ? (err as AuthError) : toAuthError(err);
        trackError(error.code);
        setAuthState({ status: 'failed', error });
      }
    },
    [beginPolling]
  );

  const cancelLogin = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    void tokenRepository.setDeviceSession(null);
    setAuthState({ status: 'idle' });
  }, []);

  const resetLogin = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    void tokenRepository.setDeviceSession(null);
    setAuthState({ status: 'idle' });
  }, []);

  const retryNewCode = useCallback(() => {
    void startDeviceLogin();
  }, [startDeviceLogin]);

  const loginWithPat = useCallback(
    async (token: string): Promise<{ ok: boolean; error?: AuthError }> => {
      try {
        const result = await authRepository.loginWithPat(token);
        await authRepository.persist(result);
        setAuthState({ status: 'success', account: result.account });
        return { ok: true };
      } catch (err) {
        const error = (err as AuthError)?.code ? (err as AuthError) : toAuthError(err);
        return { ok: false, error };
      }
    },
    []
  );

  const startWebFlow = useCallback(async () => {
    if (!AuthConfig.webFlowEnabled || !AuthConfig.clientSecret) {
      setAuthState({
        status: 'failed',
        error: makeError('E_CONFIG', {
          message: 'The experimental Web flow is disabled or not configured.',
          action: 'report',
          diagnostic: 'WEBFLOW_DISABLED',
        }),
      });
      return;
    }
    try {
      const webSession = await createWebSession(scopesToString(BASE_SCOPES));
      await tokenRepository.setWebSession(webSession);
      const url = await buildAuthorizeUrl(webSession);
      trackFunnel('github_opened');
      const b = bridge();
      if (b?.openCustomTab) b.openCustomTab(url);
      else window.location.href = url;
    } catch (err) {
      const error = (err as AuthError)?.code ? (err as AuthError) : toAuthError(err);
      setAuthState({ status: 'failed', error });
    }
  }, []);

  // Handle the Web+PKCE deep-link callback (§6).
  useEffect(() => {
    const onDeepLink = async (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      try {
        const webSession = await tokenRepository.getWebSession();
        const { code } = validateCallback(detail, webSession);
        if (!webSession) return;
        const token = await exchangeCodeForToken(code, webSession);
        await tokenRepository.setWebSession(null);
        const result = await authRepository.loginWithWebToken(token);
        await authRepository.persist(result);
        setAuthState({ status: 'success', account: result.account });
      } catch (err) {
        const error = (err as AuthError)?.code ? (err as AuthError) : toAuthError(err);
        setAuthState({ status: 'failed', error });
      }
    };
    window.addEventListener('gitofydeeplink', onDeepLink as EventListener);
    return () => window.removeEventListener('gitofydeeplink', onDeepLink as EventListener);
  }, []);

  const requestFeatureScope = useCallback(    async (feature: string): Promise<{ ok: boolean; error?: AuthError }> => {
      const required = FEATURE_SCOPES[feature];
      if (!required) return { ok: true };
      const granted = sessionManager.snapshot().scopes;
      const missing = required.filter((s) => !granted.includes(s));
      if (missing.length === 0) return { ok: true };
      const combined = scopesToString([...granted, ...required]);
      try {
        const result = await authRepository.loginWithDevice(
          combined,
          {
            onCode: (info) => beginPolling({ ...info, scope: combined }, false),
            onPolling: () => undefined,
          }
        );
        await authRepository.persist(result);
        return { ok: true };
      } catch (err) {
        const error = (err as AuthError)?.code ? (err as AuthError) : toAuthError(err);
        return { ok: false, error };
      }
    },
    [beginPolling]
  );

  const switchAccount = useCallback(async (id: number) => {
    await sessionManager.switchAccount(id);
  }, []);

  const removeAccount = useCallback(async (id: number) => {
    await sessionManager.removeAccount(id);
  }, []);

  const logoutActive = useCallback(async () => {
    const id = sessionManager.snapshot().activeAccountId;
    if (id != null) await sessionManager.removeAccount(id);
  }, []);

  const logoutAll = useCallback(async () => {
    await sessionManager.logoutAll();
    setAuthState({ status: 'idle' });
  }, []);

  const refreshSession = useCallback(async () => {
    await authRepository.validateActiveSession();
  }, []);

  const openVerificationUri = useCallback((uri: string) => {
    trackFunnel('github_opened');
    const b = bridge();
    if (b?.openCustomTab) {
      b.openCustomTab(uri);
      return;
    }
    window.open(uri, '_blank', 'noopener');
  }, []);

  const copyText = useCallback(async (text: string, sensitive = false) => {
    const b = bridge();
    if (b?.copyText) {
      b.copyText(text, sensitive);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be unavailable; the code remains visible on screen.
    }
  }, []);

  const dismissError = useCallback(() => {
    sessionManager.setError(null);
  }, []);

  // Boot: restore session, resume a pending device flow, then validate in the
  // background (never block the UI on the network — §7.3).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sessionManager.init();
      if (cancelled) return;
      setReady(true);

      const pending = await tokenRepository.getDeviceSession();
      if (!cancelled && pending && pending.expiresAt > Date.now()) {
        beginPolling(
          {
            userCode: pending.userCode,
            verificationUri: pending.verificationUri,
            expiresAt: pending.expiresAt,
            interval: pending.interval,
            scope: pending.scope,
          },
          true
        );
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const result = await authRepository.loginWithDevice(
            pending.scope,
            {
              onCode: () => undefined,
              onPolling: () => setAuthState((p) => ('expiresAt' in p ? { ...p, status: 'polling' } : p)),
            },
            controller.signal
          );
          await authRepository.persist(result);
          setAuthState({ status: 'success', account: result.account });
        } catch {
          // Non-fatal: the user can start again.
        }
      } else if (pending) {
        await tokenRepository.setDeviceSession(null);
      }

      void authRepository.validateActiveSession();
    })();

    const unsub = sessionManager.subscribe(setSession);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [beginPolling]);

  // Periodic lightweight health refresh (§7.3): daily + on foreground.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && sessionManager.isAuthenticated()) {
        void authRepository.validateActiveSession();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const daily = window.setInterval(() => {
      if (sessionManager.isAuthenticated()) void authRepository.validateActiveSession();
    }, 24 * 60 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(daily);
    };
  }, []);

  const activeAccount = useMemo(
    () => session.accounts.find((a) => a.id === session.activeAccountId) ?? null,
    [session.accounts, session.activeAccountId]
  );

  const hasScope = useCallback(
    (scope: string) => {
      const active = session.accounts.find((a) => a.id === session.activeAccountId);
      // GitHub Apps don't expose scopes — permissions are governed by the app
      // configuration, so we must not hard-gate features on unknown scopes.
      if (active && active.scopesKnown === false) return true;
      return session.scopes.includes(scope);
    },
    [session.scopes, session.accounts, session.activeAccountId]
  );

  const value: AuthContextValue = {
    session,
    authState,
    ready,
    clientConfigured: isClientConfigured(),
    accounts: session.accounts,
    activeAccount,
    grantedScopes: session.scopes,
    startDeviceLogin,
    retryNewCode,
    cancelLogin,
    resetLogin,
    loginWithPat,
    startWebFlow,
    requestFeatureScope,
    switchAccount,
    removeAccount,
    logoutActive,
    logoutAll,
    refreshSession,
    openVerificationUri,
    copyText,
    dismissError,
    hasScope,
    scopeCatalog: SCOPE_CATALOG,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { AuthConfig };
export type { ProfileResult };
