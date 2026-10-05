import React from 'react';
import { M3LinearProgress } from '../../ui/m3/M3LinearProgress';
import { M3Dark, PRIMARY_BTN_BG, PRIMARY_BTN_FG } from './palette';

/** Primary pill button matching the reference (lavender gradient, inset shadows). */
export const SheetPrimaryButton: React.FC<{
  children: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ children, loading = false, disabled = false, onClick }) => (
  <button
    type="button"
    className="gsheet-btn"
    aria-busy={loading}
    disabled={disabled || loading}
    onClick={onClick}
    style={{
      width: '100%',
      padding: '11px 20px',
      border: 'none',
      borderRadius: 100,
      fontFamily: 'inherit',
      fontSize: '0.88rem',
      fontWeight: 500,
      letterSpacing: '.5px',
      background: PRIMARY_BTN_BG,
      color: loading ? 'transparent' : PRIMARY_BTN_FG,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled && !loading ? 0.5 : 1,
      boxShadow:
        'inset 0 1px 0 rgba(255,255,255,.7), inset 0 -2px 4px rgba(90,60,180,.25), 0 0 0 1px rgba(90,60,180,.4), 0 2px 4px rgba(0,0,0,.3), 0 8px 24px -4px rgba(208,188,255,.4)',
    }}
  >
    {loading ? <span className="gsheet-spinner" /> : children}
  </button>
);

/** Outlined pill button matching the reference (M3 outlined, primary text). */
export const SheetSecondaryButton: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({
  children,
  onClick,
}) => (
  <button
    type="button"
    className="gsheet-btn"
    onClick={onClick}
    style={{
      width: '100%',
      padding: '11px 20px',
      border: `1px solid ${M3Dark.outline}`,
      borderRadius: 100,
      fontFamily: 'inherit',
      fontSize: '0.88rem',
      fontWeight: 500,
      letterSpacing: '.5px',
      background: 'transparent',
      color: M3Dark.primary,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
    }}
  >
    {children}
  </button>
);

/** Percentage on the left, M3 determinate bar on the right, kept in sync. */
export const SheetProgress: React.FC<{
  value: number;
  color?: string;
  received?: number;
  total?: number;
  speedBps?: number;
}> = ({ value, color = M3Dark.primary, received, total, speedBps }) => {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
  const hasBytes = typeof received === 'number' && typeof total === 'number' && total > 0;
  const speed = typeof speedBps === 'number' && speedBps > 0 ? `${(speedBps / (1024 * 1024)).toFixed(1)} MB/s` : '—';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] font-bold tabular-nums" style={{ color: M3Dark.onSurfaceVariant }}>
        <span>{hasBytes ? `${mb(received as number)} / ${mb(total as number)}` : 'Downloading…'}</span>
        <span>{speed}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-black tabular-nums w-12 text-left" style={{ color }}>
          {pct}%
        </span>
        <div className="flex-1">
          <M3LinearProgress determinate value={pct} height={6} color={color} trackColor={M3Dark.surfaceVariant} />
        </div>
      </div>
    </div>
  );
};
