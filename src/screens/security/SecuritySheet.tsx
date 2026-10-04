import React from 'react';
import { useT } from '../../i18n/strings';
import { M3Dark, M3Danger } from './palette';
import { SheetPrimaryButton, SheetSecondaryButton, SheetProgress } from './sheetUi';

/**
 * Material 3 update sheet. Matches the supplied reference look exactly (fixed
 * dark M3 palette, lavender gradient primary pill, outlined secondary pill),
 * presented as a slide-up sheet over the lower half of the screen with a dimmed,
 * blurred, non-interactive backdrop.
 */
export type SecurityMode = 'unofficial' | 'update';
export type DownloadPhase = 'idle' | 'downloading' | 'installing' | 'done' | 'error';

export interface SecuritySheetProps {
  mode: SecurityMode;
  version?: string;
  apkName?: string;
  phase: DownloadPhase;
  progress: number;
  error?: string | null;
  onDownload: () => void;
  onLater?: () => void;
  onContinue?: () => void;
}

const UpdateGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z" />
  </svg>
);

export const SecuritySheet: React.FC<SecuritySheetProps> = ({
  version,
  apkName,
  phase,
  progress,
  error,
  onDownload,
  onLater,
  onContinue,
}) => {
  const t = useT();

  const busy = phase === 'downloading' || phase === 'installing';
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const showLater = !busy && phase !== 'done';

  return (
    <div className="fixed inset-0 z-[120] flex flex-col justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
        onClick={() => {
          if (showLater) onLater?.();
        }}
      />

      <div
        className="relative w-full rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden animate-slide-up"
        style={{
          height: '58vh',
          maxHeight: '58vh',
          color: M3Dark.onSurface,
          borderTop: `1px solid ${M3Dark.surfaceVariant}`,
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(79,55,139,0.25) 0%, transparent 70%), #141218',
        }}
      >
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full" style={{ backgroundColor: M3Dark.surfaceVariant }} />
        </div>

        <div className="text-center pt-1">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: M3Dark.onSurfaceVariant, opacity: 0.8 }}>
            Update available
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center px-6 gap-1">
          <div className="gsec-icon-wrap" style={{ width: 152, height: 152 }}>
            <div className="gsec-orbit" />
            <div className="gsec-orbit secondary" />
            <div className="gsec-glow" />
            <div className="gsec-icon" style={{ backgroundColor: M3Dark.surfaceContainerHigh, color: M3Dark.primary }}>
              <span style={{ display: 'inline-flex', color: M3Dark.primary }}>
                <UpdateGlyph />
              </span>
            </div>
          </div>

          <h2 className="text-xl font-black tracking-tight mt-2" style={{ color: M3Dark.onSurface }}>
            {t('sec.update.title')}
          </h2>
          <p className="text-xs leading-relaxed max-w-[320px]" style={{ color: M3Dark.onSurfaceVariant }}>
            {t('sec.update.subtitle')}
          </p>

          {version && (
            <div
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold"
              style={{ backgroundColor: M3Dark.surfaceContainer, border: `1px solid ${M3Dark.surfaceVariant}`, color: M3Dark.onSurfaceVariant }}
            >
              <span className="gsec-chip-dot" />
              <span>{t('sec.update.chip', { version: `v${version}` })}</span>
            </div>
          )}

          {apkName && (
            <p className="text-[10px] font-mono mt-1 break-all" style={{ color: M3Dark.onSurfaceVariant }}>
              {t('sec.update.file', { name: apkName })}
            </p>
          )}

          {error && phase === 'error' && (
            <p className="text-[11px] font-bold mt-2" style={{ color: M3Danger.danger }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 flex flex-col gap-3 px-6 pt-2 pb-6">
          {busy && <SheetProgress value={pct} />}

          <SheetPrimaryButton loading={busy} disabled={busy || phase === 'done'} onClick={onDownload}>
            {t('sec.update')}
          </SheetPrimaryButton>

          {showLater && (
            <SheetSecondaryButton onClick={() => onLater?.()}>{t('sec.later')}</SheetSecondaryButton>
          )}

          {phase === 'error' && onContinue && (
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
