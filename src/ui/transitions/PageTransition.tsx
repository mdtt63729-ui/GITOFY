import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../ThemeContext';

/**
 * Universal full-screen page transition system.
 *
 * Every navigable page goes through this one component, so the motion is
 * identical everywhere instead of each screen inventing its own animation.
 *
 * Forward: the new page enters from the right edge and settles into place
 *          (X +100% → 0, opacity .92 → 1, scale .98 → 1).
 * Back:    the previous page is revealed from the left (X −26% → 0) while the
 *          current one leaves toward the right.
 * Tabs:    primary tab switches (Home ⇄ Library) use a lighter cross-fade, not
 *          the horizontal push.
 *
 * Only FULL-SCREEN pages use this. Dialogs, popups, bottom sheets, menus and
 * snackbars keep their own animations and are never routed through here.
 */

/** Central configuration — every timing/offset value lives here, not per screen. */
export const PAGE_TRANSITION = {
  /** Default duration for a full-screen page change. */
  duration: 300,
  /** Premium ease-out: fast start, smooth deceleration, soft settle. No overshoot. */
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Where the incoming page starts on a forward push. */
  enterFrom: '100%',
  /** Where the previous page is revealed from on a back press. */
  backFrom: '-26%',
  incomingScale: 0.98,
  backScale: 0.99,
  /** Subtle supporting fade only — the slide stays the primary motion. */
  fadeFrom: 0.92,
  /** Tab switches: lighter, faster cross-fade. */
  tabDuration: 200,
  tabEasing: 'cubic-bezier(0.2, 0, 0, 1)',
  tabFadeFrom: 0.86,
  /** Reduced motion: a short fade with almost no travel. */
  reducedDuration: 140,
  reducedFadeFrom: 0.94,
} as const;

export type NavDirection = 'forward' | 'back' | 'tab';

export interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  viewKey?: string;
  direction?: NavDirection;
  /** Also play the entrance when this transition first mounts (used for the
   *  hand-off from the login screen into the app). */
  animateOnMount?: boolean;
}

export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  className = '',
  viewKey,
  direction = 'forward',
  animateOnMount = false,
}) => {
  const { colors, settings } = useTheme();
  const reduce = settings.reduceMotion;

  // When the view key changes, drop back to the "entering" state during render
  // itself — so the very first paint of the new page is already off-screen and
  // the final position is never flashed.
  const [seenKey, setSeenKey] = useState(viewKey);
  const [settled, setSettled] = useState(!animateOnMount);
  if (seenKey !== viewKey) {
    setSeenKey(viewKey);
    setSettled(false);
  }

  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    if (settled) return;
    // One frame paints the start position, the next animates to the end.
    const raf1 = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => setSettled(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [settled, viewKey]);

  const isTab = direction === 'tab';
  const duration = reduce
    ? PAGE_TRANSITION.reducedDuration
    : isTab
    ? PAGE_TRANSITION.tabDuration
    : PAGE_TRANSITION.duration;
  const easing = isTab ? PAGE_TRANSITION.tabEasing : PAGE_TRANSITION.easing;

  let transform = 'none';
  let opacity = 1;
  if (!settled) {
    if (reduce) {
      opacity = PAGE_TRANSITION.reducedFadeFrom;
    } else if (isTab) {
      opacity = PAGE_TRANSITION.tabFadeFrom;
    } else if (direction === 'back') {
      transform = `translateX(${PAGE_TRANSITION.backFrom}) scale(${PAGE_TRANSITION.backScale})`;
      opacity = PAGE_TRANSITION.fadeFrom;
    } else {
      transform = `translateX(${PAGE_TRANSITION.enterFrom}) scale(${PAGE_TRANSITION.incomingScale})`;
      opacity = PAGE_TRANSITION.fadeFrom;
    }
  }

  return (
    <div
      key={viewKey}
      className={`relative w-full h-full flex-1 flex flex-col overflow-hidden ${className}`}
      style={{
        // The canvas behind every page matches the theme, so a page sliding in
        // never reveals a white or black frame.
        backgroundColor: settings.uiMode === 'nxt' ? 'transparent' : colors.surface,
        opacity,
        transform,
        transitionProperty: 'transform, opacity',
        transitionDuration: `${duration}ms`,
        transitionTimingFunction: easing,
        willChange: 'transform, opacity',
        backfaceVisibility: 'hidden',
        // Block taps while the page is still moving, so a double tap can never
        // push two screens.
        pointerEvents: settled ? 'auto' : 'none',
      }}
    >
      {children}
    </div>
  );
};
