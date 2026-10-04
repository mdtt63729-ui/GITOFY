import React, { useState, useEffect } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3TextField } from '../ui/m3/M3TextField';
import { validateGitHubToken } from '../git/githubApi';

export interface OnboardingScreenProps {
  onComplete: (token: string, username: string, avatarUrl: string) => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const { colors, triggerHaptic } = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [token, setToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validatedUser, setValidatedUser] = useState<{
    username: string;
    avatarUrl: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-verify when user pastes or types a 40+ char token
  useEffect(() => {
    const trimmed = token.trim();
    if (trimmed.length >= 35 && (trimmed.startsWith('ghp_') || trimmed.startsWith('github_pat_'))) {
      runVerification(trimmed);
    } else {
      setValidatedUser(null);
      setErrorMsg('');
    }
  }, [token]);

  const runVerification = async (pat: string) => {
    setIsValidating(true);
    setErrorMsg('');
    const res = await validateGitHubToken(pat);
    setIsValidating(false);

    if (res.success) {
      triggerHaptic('success');
      setValidatedUser({
        username: res.username,
        avatarUrl: res.avatarUrl,
      });
    } else {
      triggerHaptic('error');
      setErrorMsg(res.error || 'Invalid token');
      setValidatedUser(null);
    }
  };

  const handlePaste = async () => {
    try {
      if (navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          triggerHaptic('tick');
          setToken(text.trim());
        }
      }
    } catch {
      // Fallback
    }
  };

  const handleFinish = () => {
    if (!validatedUser) return;
    triggerHaptic('success');
    onComplete(token.trim(), validatedUser.username, validatedUser.avatarUrl);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6 select-none overflow-y-auto overscroll-contain animate-fade-in">
      {step === 1 ? (
        /* Step 1: Welcome */
        <div className="flex-1 flex flex-col justify-between my-auto py-6">
          <div className="flex flex-col items-center text-center gap-4">
            {/* Logo Badge */}
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl border-2 mb-2 animate-bounce-once"
              style={{
                backgroundColor: colors.primaryContainer,
                borderColor: colors.primary,
                color: colors.onPrimaryContainer,
              }}
            >
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>

            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-black tracking-tight" style={{ color: colors.onSurface }}>
                Welcome to <span style={{ color: colors.primary }}>Gitofy</span>
              </h1>
              <p className="text-xs max-w-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                Fast Android GitHub repository client with in-app ZIP smart diff push, releases APK downloader, and Material 3 design.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="w-full max-w-xs flex flex-col gap-2.5 mt-4 text-left">
              <div
                className="p-3.5 rounded-2xl border flex items-center gap-3"
                style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
              >
                <div
                  className="w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: colors.primaryContainer,
                    borderColor: colors.outlineVariant,
                    color: colors.onPrimaryContainer,
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold">Smart Diff & ZIP Push</span>
                  <span className="text-[10px] opacity-70">Extract, hash blobs, and push directly to GitHub</span>
                </div>
              </div>

              <div
                className="p-3.5 rounded-2xl border flex items-center gap-3"
                style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
              >
                <div
                  className="w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: colors.secondaryContainer,
                    borderColor: colors.outlineVariant,
                    color: colors.onSecondaryContainer,
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold">In-App Release APK Downloader</span>
                  <span className="text-[10px] opacity-70">Directly download APKs and assets inside Gitofy</span>
                </div>
              </div>

              <div
                className="p-3.5 rounded-2xl border flex items-center gap-3"
                style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
              >
                <div
                  className="w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: colors.tertiaryContainer,
                    borderColor: colors.outlineVariant,
                    color: colors.onTertiaryContainer,
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold">Unsigned CI Build Workflows</span>
                  <span className="text-[10px] opacity-70">Build release APKs on GitHub Actions without secrets</span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-xs mx-auto pt-6">
            <M3Button
              variant="filled"
              shape="capsule"
              size="large"
              className="w-full font-bold shadow-lg"
              onClick={() => {
                triggerHaptic('click');
                setStep(2);
              }}
            >
              Get Started →
            </M3Button>
          </div>
        </div>
      ) : (
        /* Step 2: Token Input */
        <div className="flex-1 flex flex-col justify-between my-auto py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer border"
                style={{ borderColor: colors.outlineVariant }}
              >
                ←
              </button>
              <div>
                <h2 className="text-2xl font-black tracking-tight">Connect GitHub</h2>
                <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                  Authenticate with a GitHub Personal Access Token
                </p>
              </div>
            </div>

            {/* Token Instruction Card */}
            <div
              className="p-4 rounded-3xl border flex flex-col gap-2.5"
              style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: colors.primary }}>
                  Recommended Scopes
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/10">
                  repo · workflow · delete_repo
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                To create, delete, and push ZIP diffs directly to your GitHub account, generate a Classic Token or Fine-Grained Token.
              </p>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo,notifications&description=Gitofy"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold py-1.5 px-3 rounded-xl border text-center flex items-center justify-center gap-1.5 transition-all"
                style={{
                  backgroundColor: colors.surfaceContainerHighest,
                  borderColor: colors.outline,
                  color: colors.primary,
                }}
              >
                <span>Generate Token on GitHub ↗</span>
              </a>
            </div>

            {/* Token Input with Paste Button */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-xs font-bold" style={{ color: colors.onSurfaceVariant }}>
                  Personal Access Token (PAT)
                </label>
                <button
                  type="button"
                  onClick={handlePaste}
                  className="text-xs font-semibold cursor-pointer hover:underline"
                  style={{ color: colors.primary }}
                >
                  Paste from Clipboard
                </button>
              </div>

              <M3TextField
                label="GitHub Token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                validating={isValidating}
                isValid={validatedUser !== null}
                error={errorMsg || undefined}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              />
            </div>

            {/* Live Profile Verified Card */}
            {validatedUser && (
              <div
                className="p-4 rounded-3xl border flex items-center gap-3.5 shadow-sm animate-scale-in"
                style={{
                  backgroundColor: colors.diffAddedContainer,
                  borderColor: colors.diffAdded,
                }}
              >
                <img
                  src={validatedUser.avatarUrl}
                  alt={validatedUser.username}
                  className="w-12 h-12 rounded-full border-2 object-cover"
                  style={{ borderColor: colors.diffAdded }}
                />
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm truncate" style={{ color: colors.onSurface }}>
                      @{validatedUser.username}
                    </span>
                    <span className="text-xs font-bold" style={{ color: colors.diffAdded }}>
                      ✓ Verified
                    </span>
                  </div>
                  <span className="text-[11px] opacity-80" style={{ color: colors.onSurfaceVariant }}>
                    Connected to real GitHub account
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="w-full max-w-xs mx-auto pt-6 flex flex-col gap-2">
            {validatedUser ? (
              <M3Button
                variant="filled"
                shape="capsule"
                size="large"
                className="w-full font-bold shadow-lg"
                onClick={handleFinish}
              >
                Continue to Repositories →
              </M3Button>
            ) : (
              <M3Button
                variant="tonal"
                shape="capsule"
                size="large"
                className="w-full font-bold"
                loading={isValidating}
                disabled={!token.trim()}
                onClick={() => runVerification(token.trim())}
              >
                Verify Token
              </M3Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
