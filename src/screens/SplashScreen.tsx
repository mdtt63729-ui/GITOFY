import React, { useEffect } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3CircularProgress } from '../ui/m3/M3CircularProgress';

interface SplashScreenProps { onFinished: () => void; }

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinished }) => {
  const { colors, settings } = useTheme();
  useEffect(() => {
    const timer = window.setTimeout(onFinished, settings.reduceMotion ? 450 : 1250);
    return () => window.clearTimeout(timer);
  }, [onFinished, settings.reduceMotion]);

  return (
    <section className="gitofy-splash" style={{ background: colors.background, color: colors.onBackground }} aria-label="Gitofy loading">
      <div className="gitofy-splash-orb gitofy-splash-orb-a" style={{ background: colors.primaryContainer }} />
      <div className="gitofy-splash-orb gitofy-splash-orb-b" style={{ background: colors.secondaryContainer }} />
      <div className="gitofy-splash-content">
        <div className="gitofy-logo-mark" style={{ background: colors.primary, color: colors.onPrimary, boxShadow: `0 18px 45px ${colors.primary}55` }}>
          <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path d="M12 12h24v24H12z" stroke="currentColor" strokeWidth="3" rx="7" />
            <path d="M17 24h14M24 17v14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="md-typescale-headline-medium">Gitofy</h1>
        <p className="md-typescale-body-medium" style={{ color: colors.onSurfaceVariant }}>GitHub, ZIP & CI — in one Material 3 workspace</p>
        <M3CircularProgress size={28} className="mt-7" />
      </div>
      <span className="gitofy-splash-version md-typescale-label-small" style={{ color: colors.onSurfaceVariant }}>Preparing your workspace</span>
    </section>
  );
};
