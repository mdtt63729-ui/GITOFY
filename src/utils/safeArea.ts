/**
 * Device-safe area.
 *
 * The app runs edge-to-edge, so on phones with a notch / punch-hole front
 * camera the WebView draws underneath it and `env(safe-area-inset-*)` reports
 * zero. The native shell measures the real display cutout + system bars and
 * hands the numbers over here, so every screen can sit clear of the camera on
 * ANY device without anything being hard-coded per phone.
 */

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface SafeAreaBridge {
  getSafeAreaInsets?: () => string;
}

function bridge(): SafeAreaBridge | undefined {
  return (window as Window & { GitofyAndroid?: SafeAreaBridge }).GitofyAndroid;
}

/** Read the native insets and publish them as CSS variables. */
export function applySafeAreaInsets(): void {
  const root = document.documentElement;
  const b = bridge();
  if (!b?.getSafeAreaInsets) return;

  try {
    const insets = JSON.parse(b.getSafeAreaInsets()) as Insets;
    if (!insets || typeof insets.top !== 'number') return;
    root.style.setProperty('--gitofy-safe-top', `${Math.max(0, Math.round(insets.top))}px`);
    root.style.setProperty('--gitofy-safe-bottom', `${Math.max(0, Math.round(insets.bottom))}px`);
    root.style.setProperty('--gitofy-safe-left', `${Math.max(0, Math.round(insets.left))}px`);
    root.style.setProperty('--gitofy-safe-right', `${Math.max(0, Math.round(insets.right))}px`);
  } catch {
    // No usable answer — the env() fallbacks in CSS take over.
  }
}

/** Apply once, then re-apply whenever the window or orientation changes. */
export function watchSafeAreaInsets(): void {
  applySafeAreaInsets();
  window.addEventListener('resize', applySafeAreaInsets);
  window.addEventListener('orientationchange', applySafeAreaInsets);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') applySafeAreaInsets();
  });
}
