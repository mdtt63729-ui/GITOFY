/**
 * Opens a URL OUTSIDE the app.
 *
 * The app runs inside a native WebView, and nothing external should ever load
 * inside it — GitHub links, token pages, releases, etc. must open in the user's
 * browser (Chrome Custom Tab) so the app never feels like a web page. We prefer
 * the native bridge (`GitofyAndroid.openCustomTab`); the browser fallback is only
 * for the dev server in a real browser.
 */
interface ExternalBridge {
  openCustomTab?: (url: string) => void;
}

export function openExternal(url: string | null | undefined): void {
  if (!url) return;
  const bridge =
    typeof window !== 'undefined'
      ? (window as unknown as { GitofyAndroid?: ExternalBridge }).GitofyAndroid
      : undefined;
  if (bridge?.openCustomTab) {
    try {
      bridge.openCustomTab(url);
      return;
    } catch {
      // fall through to the browser
    }
  }
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
}
