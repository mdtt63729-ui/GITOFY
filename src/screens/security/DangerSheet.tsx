import React, { useEffect, useState } from 'react';
import { useT } from '../../i18n/strings';
import { M3Dark, M3Danger } from './palette';
import { SheetPrimaryButton, SheetProgress } from './sheetUi';
import { startDangerSound, stopDangerSound } from '../../security/dangerSound';
import type { DownloadPhase } from './SecuritySheet';

/**
 * Unofficial-app (danger) popup. Matches the supplied danger reference exactly
 * (fixed dark M3 palette with the red danger accents, expanding ripples, red
 * danger rings, breathing glow, shaking warning badge, "Security risk detected"
 * chip and a lavender "Download Official App" pill), presented as a slide-up
 * sheet over the lower half of the screen with a dimmed, blurred backdrop.
 *
 * A cinematic multi-layer warning sound starts the moment this sheet appears and
 * stops when it goes away.
 */
export interface DangerSheetProps {
  phase: DownloadPhase;
  progress: number;
  received?: number;
  total?: number;
  speedBps?: number;
  error?: string | null;
  onDownload: () => void;
  onContinue?: () => void;
}

const WarningGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
  </svg>
);

const DownloadGlyph: React.FC = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
  </svg>
);

/**
 * Force-closes the app. On device this calls the native bridge (finishAffinity),
 * so a modified build really exits; in a plain browser there is nothing to call.
 */
function forceClose(): void {
  const b = (window as unknown as { GitofyAndroid?: { exitApp?: () => void } }).GitofyAndroid;
  try { b?.exitApp?.(); } catch { /* ignore */ }
}

export const DangerSheet: React.FC<DangerSheetProps> = ({ phase, progress, received, total, speedBps, error, onDownload, onContinue }) => {
  const t = useT();

  const busy = phase === 'downloading' || phase === 'installing';
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const showContinue = phase === 'error' && !!onContinue;

  // A modified build is force-closed after a 7-second countdown — every time it
  // is opened, however many times that is.
  const [remaining, setRemaining] = useState(7);
  useEffect(() => {
    setRemaining(7);
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          forceClose();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    startDangerSound();
    const retry = () => startDangerSound();
    window.addEventListener('pointerdown', retry, { once: true });
    window.addEventListener('click', retry, { once: true });
    return () => {
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('click', retry);
      stopDangerSound();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[130] flex flex-col justify-end" role="alertdialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-fade-in"
        style={{
          backgroundColor: 'rgba(20,0,0,0.66)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
        onClick={() => {
          if (showContinue) onContinue?.();
        }}
      />

      <div
        className="relative w-full rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden animate-slide-up"
        style={{
          height: '58vh',
          maxHeight: '58vh',
          color: M3Dark.onSurface,
          borderTop: '1px solid rgba(255,84,73,0.45)',
          background:
            'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(147,0,10,0.28) 0%, transparent 70%), #141218',
        }}
      >
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full" style={{ backgroundColor: M3Danger.dangerDeep }} />
        </div>

        <div className="text-center pt-1">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: M3Dark.onSurfaceVariant, opacity: 0.8 }}>
            {t('sec.unofficial.topbar')}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center px-6 gap-1">
          <div className="gdanger-icon-wrap" style={{ width: 152, height: 152 }}>
            <div className="gdanger-ripple" />
            <div className="gdanger-ripple" />
            <div className="gdanger-ripple" />
            <div className="gdanger-ring" />
            <div className="gdanger-ring secondary" />
            <div className="gdanger-glow" />
            <div
              className="gdanger-icon"
              style={{ background: 'linear-gradient(180deg,#3A2A2A 0%,#2A1E1E 100%)', color: M3Danger.danger }}
            >
              <span style={{ display: 'inline-flex', color: M3Danger.danger, filter: 'drop-shadow(0 0 14px rgba(255,84,73,0.7))' }}>
                <WarningGlyph />
              </span>
            </div>
          </div>

          <h2 className="text-xl font-black tracking-tight mt-2" style={{ color: M3Dark.onSurface }}>
            {t('sec.unofficial.title')}
          </h2>
          <p className="text-xs leading-relaxed max-w-[330px]" style={{ color: M3Dark.onSurfaceVariant }}>
            {t('sec.unofficial.subtitle')}
          </p>

          <div
            className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold"
            style={{
              backgroundColor: 'rgba(147,0,10,0.25)',
              border: '1px solid rgba(255,84,73,0.45)',
              color: M3Danger.onDangerContainer,
            }}
          >
            <span className="gdanger-chip-dot" />
            <span>{t('sec.unofficial.badge')}</span>
          </div>

          <p className="mt-2.5 text-[12px] font-black tracking-wide" style={{ color: M3Danger.danger }}>
            {t('sec.unofficial.closing', { seconds: remaining })}
          </p>

          {error && phase === 'error' && (
            <p className="text-[11px] font-bold mt-2" style={{ color: M3Danger.danger }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 flex flex-col gap-3 px-6 pt-2 pb-6">
          {busy && <SheetProgress value={pct} color={M3Danger.danger} received={received} total={total} speedBps={speedBps} />}

          <SheetPrimaryButton loading={busy} disabled={busy || phase === 'done'} onClick={onDownload}>
            <DownloadGlyph />
            {t('sec.downloadOfficial')}
          </SheetPrimaryButton>

          {showContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="text-xs font-semibold py-1 cursor-pointer"
              style={{ color: M3Dark.primary, background: 'transparent', border: 'none' }}
            >
              {t('sec.later')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
