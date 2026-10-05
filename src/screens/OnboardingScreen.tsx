import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';

export interface OnboardingScreenProps {
  onComplete: () => void;
}

interface Page {
  key: string;
  title: string;
  body: string;
  bullets: string[];
  accent: string;
  icon: React.ReactNode;
}

/**
 * First-run onboarding carousel.
 *
 * Five fully-designed pages (one per page-indicator dot), a GPU-accelerated
 * track with a soft cross-fade + slide between pages, an animated dot indicator,
 * and explicit Skip / Continue / Get Started buttons. It NEVER auto-advances.
 */
export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const { colors, triggerHaptic } = useTheme();
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const pages: Page[] = useMemo(() => [
    {
      key: 'welcome',
      title: 'Welcome to Gitofy',
      body: 'A fast, native-feeling GitHub client built for Android — repositories, diffs, releases and Actions in one place.',
      bullets: ['Native Android app', 'Material 3 design', 'Works offline for browsing'],
      accent: colors.primary,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 3 6.5v11L12 22l9-4.5v-11z" />
          <path d="M3 6.5 12 11l9-4.5" />
          <path d="M12 11v11" />
        </svg>
      ),
    },
    {
      key: 'diff',
      title: 'Smart Diff & ZIP push',
      body: 'Drop in a project ZIP. Gitofy extracts it, hashes every file, computes the diff against GitHub and uploads only what changed.',
      bullets: ['Byte-perfect extraction', 'Only changed files upload', 'One-tap commit & push'],
      accent: colors.secondary,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      ),
    },
    {
      key: 'releases',
      title: 'Releases & APK downloads',
      body: 'Browse every release of a repository and download its APKs and assets inside the app, with real pause and resume.',
      bullets: ['All release assets', 'True pause / resume', 'Install without leaving the app'],
      accent: colors.tertiary,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
    {
      key: 'actions',
      title: 'Workflows & live logs',
      body: 'Follow GitHub Actions runs as they happen — jobs, steps and the live build log, streaming inside the app.',
      bullets: ['Live run status', 'Jobs & steps detail', 'Streaming build logs'],
      accent: colors.diffAdded ?? colors.primary,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
    },
    {
      key: 'secure',
      title: 'Secure by design',
      body: 'Sign in with GitHub device flow — no secret ever ships in the app. Tokens are encrypted and an optional app lock keeps things private.',
      bullets: ['Secret-free device login', 'Encrypted token storage', 'Optional biometric lock'],
      accent: colors.diffModified ?? colors.secondary,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
  ], [colors.primary, colors.secondary, colors.tertiary, colors.diffAdded, colors.diffModified]);

  const total = pages.length;
  const isLast = index === total - 1;
  const accent = pages[index].accent;

  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(total - 1, next));
    if (clamped === index) return;
    triggerHaptic('tick');
    setDrag(0);
    setIndex(clamped);
  }, [index, total, triggerHaptic]);

  const finish = useCallback(() => {
    triggerHaptic('success');
    onComplete();
  }, [onComplete, triggerHaptic]);

  // Horizontal swipe between pages.
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    setDrag(e.touches[0].clientX - touchStartX.current);
  };
  const onTouchEnd = () => {
    const d = drag;
    touchStartX.current = null;
    setDrag(0);
    if (d < -48) goTo(index + 1);
    else if (d > 48) goTo(index - 1);
  };

  return (
    <div
      className="gitofy-onboard-in relative flex-1 flex flex-col select-none overflow-hidden"
      style={{ backgroundColor: colors.background, color: colors.onBackground }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Per-page accent glow — transitions smoothly as the page changes. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: '58%',
          background: `radial-gradient(ellipse 78% 62% at 50% 0%, ${accent}2e, transparent 72%)`,
          transition: 'background 620ms cubic-bezier(.2,0,0,1)',
        }}
      />

      {/* Skip */}
      <div className="relative flex justify-end px-5" style={{ paddingTop: 'max(14px, var(--gitofy-top-bar))' }}>
        <button
          type="button"
          onClick={finish}
          className="text-xs font-bold px-3 py-1.5 rounded-full cursor-pointer active:scale-95 transition-transform"
          style={{ color: colors.onSurfaceVariant }}
        >
          Skip
        </button>
      </div>

      {/* Pages track */}
      <div className="relative flex-1 overflow-hidden flex items-center">
        <div
          className="flex w-full"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${drag}px), 0, 0)`,
            transition: drag === 0 ? 'transform 560ms cubic-bezier(.16,.84,.24,1)' : 'none',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
          }}
        >
          {pages.map((page, i) => {
            const offset = i - index;
            const active = offset === 0;
            return (
              <div
                key={page.key}
                className="w-full flex-shrink-0 px-8 flex flex-col items-center text-center gap-6"
                style={{
                  // Soft cross-fade + slide so changing pages feels premium and never flashes.
                  opacity: active ? 1 : 0,
                  transform: active ? 'none' : `translate3d(0, ${offset > 0 ? 26 : -26}px, 0) scale(.94)`,
                  transition: 'opacity 440ms cubic-bezier(.2,0,0,1), transform 620ms cubic-bezier(.16,.84,.24,1)',
                  willChange: 'opacity, transform',
                  backfaceVisibility: 'hidden',
                  pointerEvents: active ? 'auto' : 'none',
                }}
              >
                <div
                  className="w-28 h-28 rounded-[2rem] flex items-center justify-center"
                  style={{
                    backgroundColor: `${page.accent}1f`,
                    border: `1.5px solid ${page.accent}55`,
                    color: page.accent,
                    boxShadow: `0 20px 44px -20px ${page.accent}`,
                  }}
                >
                  <span className="onboarding-icon" style={{ width: 52, height: 52, display: 'flex' }}>{page.icon}</span>
                </div>

                <div className="flex flex-col gap-2.5 max-w-sm">
                  <h2 className="text-2xl font-black tracking-tight">{page.title}</h2>
                  <p className="text-sm leading-relaxed" style={{ color: colors.onSurfaceVariant }}>{page.body}</p>
                </div>

                {/* Feature bullets — every page gets the same rich layout as the first. */}
                <div className="w-full max-w-xs flex flex-col gap-2">
                  {page.bullets.map((b) => (
                    <div
                      key={b}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border text-left"
                      style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
                    >
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${page.accent}22`, color: page.accent }}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <span className="text-xs font-semibold">{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots */}
      <div className="gitofy-onboard-rise-1 relative flex items-center justify-center gap-2 py-5">
        {pages.map((page, i) => (
          <button
            key={page.key}
            type="button"
            aria-label={`Go to page ${i + 1}`}
            onClick={() => goTo(i)}
            className="rounded-full cursor-pointer"
            style={{
              width: i === index ? 22 : 7,
              height: 7,
              backgroundColor: i === index ? colors.primary : colors.outlineVariant,
              transition: 'width 420ms cubic-bezier(.34,1.56,.64,1), background-color 300ms ease',
            }}
          />
        ))}
      </div>

      {/* Actions */}
      <div
        className="gitofy-onboard-rise-2 relative px-6 flex flex-col gap-2.5"
        style={{ paddingBottom: 'max(22px, env(safe-area-inset-bottom))' }}
      >
        <M3Button
          variant="filled"
          shape="capsule"
          size="large"
          className="w-full font-bold"
          onClick={() => (isLast ? finish() : goTo(index + 1))}
        >
          {isLast ? 'Get Started' : 'Continue'}
        </M3Button>
        {!isLast && (
          <button
            type="button"
            onClick={finish}
            className="text-xs font-semibold py-1.5 cursor-pointer"
            style={{ color: colors.onSurfaceVariant }}
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
};
