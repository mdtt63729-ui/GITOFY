import React, { useState } from 'react';
import { M3Button } from '../../ui/m3/M3Button';
import { QrCode } from './QRCode';
import type { M3ColorScheme } from '../../theme/tokens';

/**
 * Login State 3 — the device-code screen (§5.4). Big monospace code in boxes
 * with a stagger fade-in, Copy (icon morph + haptic + snackbar), Open GitHub,
 * an expandable QR section, a countdown ring that warms toward `error` in the
 * last 30s, a pulsing status line, and an always-present Cancel.
 */
export interface DeviceCodeViewProps {
  userCode: string;
  verificationUri: string;
  remaining: number;
  totalSeconds: number;
  isResumed: boolean;
  offline: boolean;
  colors: M3ColorScheme;
  reduceMotion: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onCopy: () => void;
  onOpen: () => void;
  onCancel: () => void;
  onWrongAccount: () => void;
  copied: boolean;
}

export const DeviceCodeView: React.FC<DeviceCodeViewProps> = ({
  userCode,
  verificationUri,
  remaining,
  totalSeconds,
  isResumed,
  offline,
  colors,
  reduceMotion,
  t,
  onCopy,
  onOpen,
  onCancel,
  onWrongAccount,
  copied,
}) => {
  const [qrOpen, setQrOpen] = useState(false);
  const chars = userCode.split('');
  const frac = totalSeconds > 0 ? Math.max(0, Math.min(1, remaining / totalSeconds)) : 0;
  const urgent = remaining <= 30;
  const ringSize = 132;
  const stroke = 8;
  const r = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * frac;
  const ringColor = urgent ? colors.error : colors.primary;

  const spoken = chars
    .map((c) => (c === '-' ? 'dash' : c))
    .join(', ');

  return (
    <div className="flex-1 flex flex-col justify-between p-6 select-none gitofy-scroll animate-fade-in">
      <div className="flex flex-col gap-5 pt-4">
        <div className="flex flex-col items-center text-center gap-1.5">
          <h2 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>
            {t('login.codeTitle')}
          </h2>
          <p className="text-xs max-w-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
            {t('login.codeHint')}
          </p>
        </div>

        {/* Countdown ring wrapping the code */}
        <div className="flex justify-center">
          <div className="relative" style={{ width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} aria-hidden="true">
              <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke={colors.outlineVariant} strokeWidth={stroke} />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={r}
                fill="none"
                stroke={ringColor}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                style={{ transition: 'stroke-dasharray 900ms linear, stroke 400ms ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black" style={{ color: ringColor }}>
                {Math.max(0, Math.floor(remaining / 60))}:{String(Math.max(0, remaining % 60)).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: colors.onSurfaceVariant }}>
                {t('login.expiresIn')}
              </span>
            </div>
          </div>
        </div>

        {/* Code boxes with stagger fade-in */}
        <div
          className="flex justify-center gap-1.5 flex-wrap"
          role="text"
          aria-label={`${t('login.codeTitle')}: ${spoken}`}
        >
          {chars.map((c, i) => (
            <span
              key={`${c}-${i}`}
              className={`w-10 h-13 py-3 rounded-xl flex items-center justify-center text-xl font-black font-mono ${
                reduceMotion ? '' : 'animate-code-char'
              }`}
              style={{
                backgroundColor: colors.surfaceContainerHigh,
                color: colors.onSurface,
                border: `1px solid ${colors.outlineVariant}`,
                minWidth: 40,
                animationDelay: reduceMotion ? undefined : `${i * 45}ms`,
              }}
            >
              {c === '-' ? '–' : c}
            </span>
          ))}
        </div>

        {/* Security notice (§10.2, appendix গ) */}
        <div
          className="p-3.5 rounded-2xl border flex gap-2.5 items-start"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke={colors.error} strokeWidth="2">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <p className="text-[11px] leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
            {t('login.securityNotice')}
          </p>
        </div>

        {/* Copy + Open actions */}
        <div className="flex gap-2">
          <M3Button variant="tonal" shape="capsule" size="medium" className="flex-1 font-bold" onClick={onCopy}>
            {copied ? (
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12l4 4L19 6" />
                </svg>
                {t('login.copied')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="12" height="12" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
                {t('login.copy')}
              </span>
            )}
          </M3Button>
          <M3Button variant="filled" shape="capsule" size="medium" className="flex-1 font-bold" onClick={onOpen}>
            {t('login.open')}
          </M3Button>
        </div>

        {/* QR expandable */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }}
        >
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold cursor-pointer"
            style={{ color: colors.onSurface }}
            onClick={() => setQrOpen((v) => !v)}
            aria-expanded={qrOpen}
          >
            <span>{t('login.qrSection')}</span>
            <span style={{ transform: qrOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>⌄</span>
          </button>
          {qrOpen && (
            <div className="px-4 pb-4 flex flex-col items-center gap-2 animate-fade-in">
              <QrCode value={verificationUri} size={168} alt={t('login.qrHint')} />
              <p className="text-[10px] text-center" style={{ color: colors.onSurfaceVariant }}>
                {t('login.qrHint')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Status line + Cancel */}
      <div className="flex flex-col gap-3 pt-6">
        <div
          className="flex items-center justify-center gap-2 text-xs font-semibold"
          style={{ color: offline ? colors.error : colors.onSurfaceVariant }}
          role="status"
          aria-live="polite"
        >
          <span
            className={reduceMotion ? '' : 'animate-pulse-dot'}
            style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: offline ? colors.error : colors.primary, display: 'inline-block' }}
          />
          {offline ? t('login.offline') : isResumed ? t('login.resumed') : t('login.waiting')}
        </div>
        <button
          type="button"
          onClick={onWrongAccount}
          className="text-[11px] font-semibold hover:underline cursor-pointer"
          style={{ color: colors.primary }}
        >
          {t('login.wrongAccount')}
        </button>
        <M3Button variant="text" shape="capsule" size="medium" className="w-full font-bold" onClick={onCancel}>
          {t('login.cancel')}
        </M3Button>
      </div>
    </div>
  );
};
