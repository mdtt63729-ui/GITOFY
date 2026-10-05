import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../../ui/ThemeContext';
import { useAuth } from '../../auth/AuthContext';
import { useT } from '../../i18n/strings';
import { M3Button } from '../../ui/m3/M3Button';
import { M3TextField } from '../../ui/m3/M3TextField';
import { M3BottomSheet } from '../../ui/m3/M3BottomSheet';
import { M3CircularProgress } from '../../ui/m3/M3CircularProgress';
import { DeviceCodeView } from './DeviceCodeView';
import { GoogleAccountChooser } from './GoogleAccountChooser';
import { AuthConfig } from '../../auth/config';
import { trackFunnel } from '../../auth/diagnostics';
import type { AuthError } from '../../auth/types';

const GithubMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.8 18 5.1 18 5.1c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
  </svg>
);

const GoogleMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export interface LoginScreenProps {
  onLoggedIn: () => void;
  onOpenPrivacy?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoggedIn, onOpenPrivacy }) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const t = useT();
  const {
    authState,
    clientConfigured,
    startDeviceLogin,
    cancelLogin,
    retryNewCode,
    resetLogin,
    loginWithPat,
    openVerificationUri,
    copyText,
    accounts,
    switchAccount,
    session,
  } = useAuth();

  const [remaining, setRemaining] = useState(0);
  const [copied, setCopied] = useState(false);
  const [offline, setOffline] = useState(false);
  const [patOpen, setPatOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [patToken, setPatToken] = useState('');
  const [patBusy, setPatBusy] = useState(false);
  const [patError, setPatError] = useState<AuthError | null>(null);
  const [googleAccounts, setGoogleAccounts] = useState<Array<{ name: string; label: string }>>([]);
  // Fades the success view out just before the app switches to Home, so the
  // hand-off reads as one smooth admission instead of a hard cut.
  const [leaving, setLeaving] = useState(false);
  const successTimerRef = useRef<number | null>(null);
  const authRef = useRef(false);
  useEffect(() => { authRef.current = session.isAuthenticated; }, [session.isAuthenticated]);
  const navigatedRef = useRef(false);

  const reduceMotion = settings.reduceMotion;

  // Countdown ticker for the code screen.
  useEffect(() => {
    if (authState.status !== 'awaiting_user' && authState.status !== 'polling') return;
    const expiresAt = authState.expiresAt;
    const tick = () => setRemaining(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [authState]);

  // Network status for the "offline — will continue" line (§5.3).
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Success: play the tick animation, then hand off to Home (§5.4 state 4).
  useEffect(() => {
    if (authState.status !== 'success' || navigatedRef.current) return;
    navigatedRef.current = true;
    triggerHaptic('success');
    const delay = reduceMotion ? 120 : 900;
    successTimerRef.current = window.setTimeout(() => {
      successTimerRef.current = null;
      trackFunnel('home_shown');
      // Fade the success view out first, then switch — a smooth admission
      // rather than an abrupt cut.
      setLeaving(true);
      window.setTimeout(() => {
        if (authRef.current) {
          onLoggedIn();
        } else {
          // The session did not stick, so there is nothing to open. Return to
          // the form instead of leaving the user stranded here.
          navigatedRef.current = false;
          setLeaving(false);
          resetLogin();
        }
      }, reduceMotion ? 0 : 220);
    }, delay);
  }, [authState, reduceMotion, onLoggedIn, triggerHaptic, resetLogin]);

  // Only clear the handoff timer when the screen really goes away.
  useEffect(() => () => {
    if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    if (authState.status !== 'awaiting_user' && authState.status !== 'polling') return;
    triggerHaptic('tick');
    await copyText(authState.userCode, true);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [authState, copyText, triggerHaptic]);

  const handleOpen = useCallback(() => {
    if (authState.status !== 'awaiting_user' && authState.status !== 'polling') return;
    triggerHaptic('click');
    void copyText(authState.userCode, true);
    openVerificationUri(authState.verificationUri);
  }, [authState, copyText, openVerificationUri, triggerHaptic]);

  const handlePatSubmit = useCallback(async () => {
    if (!patToken.trim()) return;
    setPatBusy(true);
    setPatError(null);
    const res = await loginWithPat(patToken.trim());
    setPatBusy(false);
    if (res.ok) {
      setPatOpen(false);
      triggerHaptic('success');
    } else {
      triggerHaptic('error');
      setPatError(res.error ?? null);
    }
  }, [patToken, loginWithPat, triggerHaptic]);

  const handlePickAccount = useCallback(
    async (id: number) => {
      setChooserOpen(false);
      triggerHaptic('success');
      try {
        await switchAccount(id);
      } catch {
        // The stored session could not be restored — fall back to a fresh
        // GitHub login instead of silently doing nothing.
        triggerHaptic('error');
        void startDeviceLogin();
      }
    },
    [switchAccount, startDeviceLogin, triggerHaptic]
  );

  const handleUseAnother = useCallback(() => {
    setChooserOpen(false);
    void startDeviceLogin();
  }, [startDeviceLogin]);

  // Load the Google accounts on this device so the "Choose an account" chooser
  // can list them, exactly like Google's own account picker.
  useEffect(() => {
    const bridge = (window as unknown as {
      GitofyAndroid?: { getGoogleAccounts?: () => string };
    }).GitofyAndroid;
    if (!bridge?.getGoogleAccounts) return;
    try {
      const parsed = JSON.parse(bridge.getGoogleAccounts()) as Array<{ name: string; label: string }>;
      if (Array.isArray(parsed)) setGoogleAccounts(parsed.filter((a) => !!a?.name));
    } catch {
      // No accounts / permission not granted — the chooser still works.
    }
  }, []);

  const handlePickGoogle = useCallback(() => {
    setChooserOpen(false);
    // A Google account cannot itself authorise GitHub from a third-party app, so
    // continue into the GitHub sign-in (which opens in the browser, where GitHub
    // offers its own "Sign in with Google").
    void startDeviceLogin();
  }, [startDeviceLogin]);

  // ---- Success view -------------------------------------------------------
  if (authState.status === 'success') {
    const account = authState.account;
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-4 p-6 animate-fade-in"
        style={{
          opacity: leaving ? 0 : 1,
          transform: leaving ? 'translateY(-6px) scale(0.99)' : 'none',
          transition: 'opacity 220ms ease, transform 220ms cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-lg animate-success-pop">
          <svg className="w-11 h-11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path className="animate-draw-tick" d="M5 12l4 4L19 6" />
          </svg>
        </div>
        {!reduceMotion && account.avatarUrl && (
          <img src={account.avatarUrl} alt={account.login} className="w-14 h-14 rounded-full border-2 animate-rise-in" style={{ borderColor: colors.outlineVariant }} />
        )}
        <div className="text-center">
          <p className="text-lg font-black" style={{ color: colors.onSurface }}>
            {t('login.welcome')}, @{account.login}
          </p>
          <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
            {t('login.success')}
          </p>
        </div>
      </div>
    );
  }

  // ---- Code screen --------------------------------------------------------
  if (authState.status === 'awaiting_user' || authState.status === 'polling') {
    return (
      <DeviceCodeView
        userCode={authState.userCode}
        verificationUri={authState.verificationUri}
        remaining={remaining}
        totalSeconds={AuthConfig.defaults.expiresIn}
        isResumed={authState.isResumed}
        offline={offline}
        colors={colors}
        reduceMotion={reduceMotion}
        t={t}
        onCopy={handleCopy}
        onOpen={handleOpen}
        onCancel={() => {
          triggerHaptic('click');
          cancelLogin();
        }}
        onWrongAccount={() => {
          triggerHaptic('click');
          resetLogin();
        }}
        copied={copied}
      />
    );
  }

  // ---- Failed view --------------------------------------------------------
  if (authState.status === 'failed') {
    const err = authState.error;
    const actionKey = err.action ? `action.${err.action}` : 'action.retry';
    return (
      <>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 text-center animate-fade-in">
        <div
          className={`w-20 h-20 rounded-[28px] flex items-center justify-center ${reduceMotion ? '' : 'animate-shake'}`}
          style={{ backgroundColor: colors.errorContainer, color: colors.error }}
        >
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        </div>
        <div>
          <p className="text-base font-black" style={{ color: colors.onSurface }}>
            {t(`error.${err.code}`)}
          </p>
          <p className="text-[10px] font-mono mt-1" style={{ color: colors.onSurfaceVariant }}>
            {err.diagnostic}
          </p>
        </div>
        <div className="w-full max-w-xs flex flex-col gap-2">
          {err.code === 'E_CODE_EXPIRED' ? (
            <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" onClick={retryNewCode}>
              {t('action.new_code')}
            </M3Button>
          ) : err.code === 'E_SESSION' ? (
            <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" onClick={() => startDeviceLogin()}>
              {t('action.login')}
            </M3Button>
          ) : (
            <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" onClick={() => startDeviceLogin()}>
              {t(actionKey)}
            </M3Button>
          )}
          {AuthConfig.patFallbackEnabled && (
            <M3Button variant="text" shape="capsule" size="medium" className="w-full" onClick={() => setPatOpen(true)}>
              {t('login.pat')}
            </M3Button>
          )}
          <M3Button variant="text" shape="capsule" size="medium" className="w-full" onClick={resetLogin}>
            {t('login.cancel')}
          </M3Button>
        </div>
      </div>

      {/* The PAT sheet has to exist in THIS branch too, otherwise the
          "Login with a Personal Access Token" link here does nothing — it only
          appeared after Cancel returned the screen to the idle branch. */}
        <M3BottomSheet isOpen={patOpen} onClose={() => setPatOpen(false)} title={t('pat.title')} subtitle={t('pat.hint')}>
          <div className="flex flex-col gap-3 pt-1">
            <M3TextField
              label={t('pat.title')}
              type="password"
              value={patToken}
              onChange={(e) => setPatToken(e.target.value)}
              placeholder={t('pat.placeholder')}
              validating={patBusy}
              error={patError ? t(`error.${patError.code}`) : undefined}
            />
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo,notifications&description=Gitufy"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold py-2 px-3 rounded-xl border text-center"
              style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outline, color: colors.primary }}
            >
              {t('pat.generate')} ↗
            </a>
            <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" loading={patBusy} disabled={!patToken.trim()} onClick={handlePatSubmit}>
              {t('pat.verify')}
            </M3Button>
          </div>
        </M3BottomSheet>
      </>
    );
  }

  // ---- Idle / Requesting --------------------------------------------------
  const requesting = authState.status === 'requesting_code';
  return (
    <div className="flex-1 flex flex-col justify-between p-6 select-none gitofy-scroll animate-fade-in">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl border-2"
          style={{ backgroundColor: colors.primaryContainer, borderColor: colors.primary, color: colors.onPrimaryContainer }}
        >
          <GithubMark className="w-11 h-11" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-black tracking-tight" style={{ color: colors.onSurface }}>
            {t('login.title')}
          </h1>
          <p className="text-xs max-w-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
            {t('login.subtitle')}
          </p>
          <p className="text-[10px] max-w-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
            {t('app.tagline')}
          </p>
        </div>

        {!clientConfigured && (
          <div
            className="p-3 rounded-2xl border text-[11px] max-w-xs"
            style={{ backgroundColor: colors.errorContainer, borderColor: colors.error, color: colors.error }}
          >
            Set <span className="font-mono">VITE_GITHUB_CLIENT_ID</span> (or window.GITUFY_CONFIG.clientId) to enable GitHub login.
          </div>
        )}

        <div className="w-full max-w-xs flex flex-col gap-3 mt-2">
          {/* Login with PAT — GitHub logo; opens the existing PAT sheet (smooth slide-up) */}
          {AuthConfig.patFallbackEnabled && (
            <M3Button
              variant="outlined"
              shape="capsule"
              size="large"
              className="w-full font-bold"
              onClick={() => {
                triggerHaptic('click');
                setPatOpen(true);
              }}
            >
              <span className="inline-flex items-center gap-2">
                <GithubMark className="w-5 h-5" />
                {t('login.patShort')}
              </span>
            </M3Button>
          )}

          {/* or divider */}
          <div className="flex items-center gap-3">
            <span className="flex-1 h-px" style={{ backgroundColor: colors.outlineVariant }} />
            <span className="text-[11px] font-semibold" style={{ color: colors.onSurfaceVariant }}>
              {t('login.or')}
            </span>
            <span className="flex-1 h-px" style={{ backgroundColor: colors.outlineVariant }} />
          </div>

          {/* Log in with Google — performs GitHub OAuth; opens the in-app account chooser */}
          <M3Button
            variant="filled"
            shape="capsule"
            size="large"
            className="w-full font-bold shadow-lg"
            loading={requesting}
            disabled={!clientConfigured}
            onClick={() => {
              triggerHaptic('click');
              // With no previously signed-in account the chooser would only show
              // "Use another account", so start the GitHub login straight away.
              if (accounts.length === 0 && googleAccounts.length === 0) {
                void startDeviceLogin();
                return;
              }
              setChooserOpen(true);
            }}
          >
            {requesting ? (
              <span className="inline-flex items-center gap-2">
                <M3CircularProgress size={18} />
                {t('login.requesting')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                {t('login.google')}
              </span>
            )}
          </M3Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 pt-4 text-[11px]" style={{ color: colors.onSurfaceVariant }}>
        <button type="button" className="hover:underline cursor-pointer" onClick={onOpenPrivacy}>
          {t('login.privacy')}
        </button>
        <span>·</span>
        <button type="button" className="hover:underline cursor-pointer" onClick={onOpenPrivacy}>
          {t('login.terms')}
        </button>
      </div>

      {/* PAT fallback sheet (§3.2) */}
      <M3BottomSheet isOpen={patOpen} onClose={() => setPatOpen(false)} title={t('pat.title')} subtitle={t('pat.hint')}>
        <div className="flex flex-col gap-3 pt-1">
          <M3TextField
            label={t('pat.title')}
            type="password"
            value={patToken}
            onChange={(e) => setPatToken(e.target.value)}
            placeholder={t('pat.placeholder')}
            validating={patBusy}
            error={patError ? t(`error.${patError.code}`) : undefined}
          />
          <a
            href="https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo,notifications&description=Gitufy"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold py-2 px-3 rounded-xl border text-center"
            style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outline, color: colors.primary }}
          >
            {t('pat.generate')} ↗
          </a>
          <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" loading={patBusy} disabled={!patToken.trim()} onClick={handlePatSubmit}>
            {t('pat.verify')}
          </M3Button>
        </div>
      </M3BottomSheet>

      {/* In-app account chooser (Google-style) — stays inside the app */}
      <GoogleAccountChooser
        isOpen={chooserOpen}
        onClose={() => setChooserOpen(false)}
        accounts={accounts}
        googleAccounts={googleAccounts}
        onPick={(a) => { void handlePickAccount(a.id); }}
        onPickGoogle={handlePickGoogle}
        onUseAnother={handleUseAnother}
      />
    </div>
  );
};
