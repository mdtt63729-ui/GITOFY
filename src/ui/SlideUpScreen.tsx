import React, { useEffect, useRef, useState } from 'react';

interface Props {
  isOpen: boolean;
  onClosed?: () => void;
  children: React.ReactNode;
  /** Higher sits above more of the app. */
  zIndex?: number;
  /** How long the surface takes to travel, in ms. */
  durationMs?: number;
}

/**
 * A full-screen surface that slides up from the bottom edge and — importantly —
 * slides back down with the same motion when it closes.
 *
 * Only `transform` and `opacity` are animated, so the whole thing runs on the
 * compositor and never re-lays-out the page underneath. It is deliberately NOT
 * routed through the app's horizontal page transition: this is a different
 * motion, and mixing the two is what makes navigation feel mushy.
 *
 * The children stay mounted for the whole exit animation (a closing screen that
 * vanishes instantly is the usual reason a "close" animation never appears), and
 * the surface stops accepting taps the moment it starts moving.
 */
export const SlideUpScreen: React.FC<Props> = ({ isOpen, onClosed, children, zIndex = 90, durationMs = 380 }) => {
  const [mounted, setMounted] = useState(isOpen);
  const [shown, setShown] = useState(false);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // One frame later, so the browser has the off-screen position to animate
      // from. Without this the surface would appear already in place.
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    if (!mounted) return;
    const t = window.setTimeout(() => {
      setMounted(false);
      closedRef.current?.();
    }, durationMs);
    return () => window.clearTimeout(t);
  }, [isOpen, durationMs, mounted]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0" style={{ zIndex, pointerEvents: shown ? 'auto' : 'none' }}>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(0,0,0,0.34)',
          opacity: shown ? 1 : 0,
          transition: `opacity ${durationMs - 80}ms ease`,
        }}
      />
      <div
        className="absolute inset-0 flex flex-col overflow-hidden"
        style={{
          transform: shown ? 'translateY(0%)' : 'translateY(100%)',
          transition: `transform ${durationMs}ms cubic-bezier(.16,1,.3,1)`,
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
};
