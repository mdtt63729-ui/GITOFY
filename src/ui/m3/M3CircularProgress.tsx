import React, { useEffect, useState } from 'react';
import { useTheme } from '../ThemeContext';

export interface M3CircularProgressProps {
  /**
   * Whether progress is determinate.
   * If true, value (0 to 100) must be supplied.
   * If false, displays indeterminate M3 rotating arc.
   */
  determinate?: boolean;
  value?: number; // 0 to 100
  size?: number; // diameter in px (default 48)
  strokeWidth?: number; // stroke width in px (default 4.5)
  color?: string; // override color (default colors.primary)
  trackColor?: string; // override track color (default colors.surfaceContainerHighest)
  className?: string;
  showTrack?: boolean;
}

export const M3CircularProgress: React.FC<M3CircularProgressProps> = ({
  determinate = false,
  value = 0,
  size = 48,
  strokeWidth = 4.5,
  color,
  trackColor,
  className = '',
  showTrack = true,
}) => {
  const { colors, settings } = useTheme();
  const activeColor = color || colors.primary;
  const activeTrackColor = trackColor || colors.surfaceContainerHighest;

  // Smoothly interpolated value to prevent abrupt visual jumps
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (!determinate) return;
    if (settings.reduceMotion) {
      setDisplayValue(value);
      return;
    }

    let animationFrameId: number;
    const startVal = displayValue;
    const targetVal = Math.min(100, Math.max(0, value));
    const startTime = performance.now();
    const duration = 220; // ms

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      // M3 standard deceleration curve: 1 - Math.pow(1 - progress, 2)
      const eased = 1 - Math.pow(1 - progress, 2);
      const current = startVal + (targetVal - startVal) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, determinate, settings.reduceMotion]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * displayValue) / 100;

  if (determinate) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={`-rotate-90 select-none ${className}`}
        style={{ willChange: 'transform' }}
        role="progressbar"
        aria-valuenow={Math.round(displayValue)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {showTrack && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={activeTrackColor}
            strokeWidth={strokeWidth}
            className="opacity-40 transition-colors"
          />
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={activeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-75"
        />
      </svg>
    );
  }

  // Indeterminate Material 3 rotating arc
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label="Loading..."
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="animate-spin"
        style={{
          animationDuration: '1.4s',
          animationTimingFunction: 'linear',
          willChange: 'transform',
        }}
      >
        {showTrack && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={activeTrackColor}
            strokeWidth={strokeWidth}
            className="opacity-30"
          />
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={activeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference * 0.7} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
