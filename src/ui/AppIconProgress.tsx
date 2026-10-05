import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from './ThemeContext';
import { wavyArcPath, amplitudeFor } from '../utils/wave';

interface Props {
  /** App icon image. Falls back to a lettered tile when missing. */
  src?: string;
  label: string;
  size?: number;
  /** 0..1. Leave undefined for the idle icon. */
  progress?: number;
  /** Shown under the ring while downloading. */
  caption?: string;
  onClick?: () => void;
}

/**
 * An app icon with a circular download indicator around it.
 *
 * The ring is plain below 10% and above 90%, and between those it becomes a
 * genuine travelling wave: the ring's radius is displaced by a sine along its
 * length and the wave's phase advances over time. The wave amplitude ramps in
 * and out at the boundaries, so the morph to and from a plain ring is smooth
 * rather than a jump — which is exactly what the reference calls for.
 *
 * The wave is driven by requestAnimationFrame and stops the instant the
 * download does, so an idle icon costs nothing.
 */
export const AppIconProgress: React.FC<Props> = ({ src, label, size = 64, progress, caption, onClick }) => {
  const { colors } = useTheme();
  const [phase, setPhase] = useState(0);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef(0);
  const frameRef = useRef(0);

  const downloading = typeof progress === 'number' && progress > 0 && progress < 1;
  const amplitude = typeof progress === 'number' ? amplitudeFor(progress) : 0;

  useEffect(() => {
    if (!downloading || amplitude === 0) {
      // Nothing to animate — stop the loop so an idle list stays free.
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      return;
    }
    const tick = () => {
      frameRef.current += 1;
      // ~30fps is plenty for a wave and leaves the main thread alone.
      if (frameRef.current % 2 === 0) {
        phaseRef.current += 0.16;
        setPhase(phaseRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [downloading, amplitude]);

  const pct = typeof progress === 'number' ? Math.round(progress * 100) : 0;
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`relative flex-shrink-0 ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
      style={{ width: size, height: size }}
      aria-label={label}
    >
      {/* The icon itself, with a fill that rises as the download advances. */}
      <div
        className="absolute rounded-2xl overflow-hidden flex items-center justify-center"
        style={{
          inset: 6,
          backgroundColor: colors.surfaceContainerHighest,
          color: colors.primary,
          fontWeight: 800,
          fontSize: size * 0.34,
        }}
      >
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>{label.slice(0, 1).toUpperCase()}</span>
        )}
        {typeof progress === 'number' && progress > 0 && (
          <div
            className="absolute left-0 right-0 bottom-0 pointer-events-none"
            style={{
              height: `${Math.min(100, pct)}%`,
              backgroundColor: colors.primary,
              opacity: 0.28,
              transition: 'height 220ms linear',
            }}
          />
        )}
      </div>

      {/* The ring. Idle draws a faint track; downloading draws the arc. */}
      <svg viewBox="0 0 64 64" width={size} height={size} className="absolute inset-0 pointer-events-none">
        <circle cx="32" cy="32" r={26} fill="none" stroke={colors.outlineVariant} strokeWidth="2.5" />
        {typeof progress === 'number' && progress > 0 && (
          <>
            {/* A soft glow behind the arc reads as motion without extra cost. */}
            <path d={wavyArcPath(progress, phase, amplitude)} fill="none" stroke={colors.primary} strokeWidth="5" strokeLinecap="round" opacity="0.18" />
            <path d={wavyArcPath(progress, phase, amplitude)} fill="none" stroke={colors.primary} strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}
      </svg>

      {typeof progress === 'number' && progress > 0 && (
        <span
          className="absolute left-1/2 -translate-x-1/2 text-[9px] font-black tabular-nums"
          style={{ bottom: -14, color: colors.primary }}
        >
          {pct}%
        </span>
      )}

      {caption && (
        <span
          className="absolute left-1/2 -translate-x-1/2 text-[9px] font-bold whitespace-nowrap"
          style={{ bottom: typeof progress === 'number' && progress > 0 ? -26 : -14, color: colors.onSurfaceVariant }}
        >
          {caption}
        </span>
      )}
    </Wrapper>
  );
};
