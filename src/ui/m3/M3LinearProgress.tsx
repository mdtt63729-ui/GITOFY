import React, { useEffect, useState } from 'react';
import { useTheme } from '../ThemeContext';

export interface M3LinearProgressProps {
  determinate?: boolean;
  value?: number; // 0 to 100
  height?: number; // height in px (default 4)
  color?: string;
  trackColor?: string;
  className?: string;
}

export const M3LinearProgress: React.FC<M3LinearProgressProps> = ({
  determinate = false,
  value = 0,
  height = 4,
  color,
  trackColor,
  className = '',
}) => {
  const { colors, settings } = useTheme();
  const activeColor = color || colors.primary;
  const activeTrackColor = trackColor || colors.surfaceContainerHighest;

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
    const duration = 200;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
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

  if (determinate) {
    return (
      <div
        className={`w-full overflow-hidden rounded-full ${className}`}
        style={{
          height,
          backgroundColor: activeTrackColor,
        }}
        role="progressbar"
        aria-valuenow={Math.round(displayValue)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-75"
          style={{
            width: `${Math.min(100, Math.max(0, displayValue))}%`,
            backgroundColor: activeColor,
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden rounded-full relative ${className}`}
      style={{
        height,
        backgroundColor: activeTrackColor,
      }}
      role="progressbar"
      aria-label="Loading..."
    >
      <div
        className="absolute top-0 bottom-0 rounded-full animate-shimmer"
        style={{
          width: '50%',
          backgroundColor: activeColor,
          animationDuration: '1.2s',
          animationIterationCount: 'infinite',
        }}
      />
    </div>
  );
};
