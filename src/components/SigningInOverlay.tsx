import React, { useEffect, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';

export interface SigningInOverlayProps {
  /** When false the overlay plays its exit animation before it is removed. */
  visible: boolean;
}

/**
 * Full-screen "signing you in" panel shown for a moment after GitHub
 * authorises the device flow. It fades/scales in smoothly, and fades out
 * smoothly so the home screen is revealed underneath rather than cutting.
 */
export const SigningInOverlay: React.FC<SigningInOverlayProps> = ({ visible }) => {
  const { colors, settings } = useTheme();
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), 320);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!mounted) return null;

  const reduce = settings.reduceMotion;

  return (
    <div
      className="fixed inset-0 z-[140] flex flex-col items-center justify-center gap-5"
      style={{
        backgroundColor: settings.uiMode === 'nxt' ? '#F8F7FF' : colors.background,
        opacity: visible ? 1 : 0,
        transform: visible || reduce ? 'none' : 'scale(1.015)',
        transition: 'opacity 320ms cubic-bezier(0.2, 0, 0, 1), transform 320ms cubic-bezier(0.2, 0, 0, 1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="gitofy-signin-mark" style={{ borderColor: colors.primary, color: colors.primary }}>
        <span className="gitofy-signin-ring" style={{ borderColor: `${colors.primary}55`, borderTopColor: colors.primary }} />
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.8 18 5.1 18 5.1c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
        </svg>
      </div>

      <div className="text-center flex flex-col gap-1">
        <p className="text-lg font-black" style={{ color: colors.onBackground }}>Signing you in…</p>
        <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>GitHub authorised — setting things up.</p>
      </div>
    </div>
  );
};
