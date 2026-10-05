import React, { createContext, useContext, useState, useEffect } from 'react';
import {M3ColorScheme,
  GitofySettings,
  lightThemes,
  darkThemes,
  defaultSettings,
  FONT_STACKS } from '../theme/tokens';

interface ThemeContextValue {
  settings: GitofySettings;
  updateSettings: (partial: Partial<GitofySettings>) => void;
  colors: M3ColorScheme;
  isDark: boolean;
  triggerHaptic: (type?: 'tick' | 'click' | 'heavy' | 'success' | 'error') => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<GitofySettings>(() => {
    try {
      const saved = localStorage.getItem('gitofy_settings');
      if (saved) {
        // Drop any legacy plaintext token that older builds persisted.
        const parsed = JSON.parse(saved) as Partial<GitofySettings>;
        delete parsed.personalAccessToken;
        return { ...defaultSettings, ...parsed, personalAccessToken: '' };
      }
    } catch {
      // Fallback
    }
    return defaultSettings;
  });

  // Real dark mode. "system" follows the device.
  const systemDark = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
  const isDark = settings.themeMode === 'dark' || (settings.themeMode === 'system' && systemDark);

  const activeThemeDict = isDark ? darkThemes : lightThemes;
  // NXT was removed: the M3 palette is always used now.
  const colors = activeThemeDict[settings.palette] || activeThemeDict[isDark ? 'pink' : 'crimson'];

  const updateSettings = (partial: Partial<GitofySettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      try {
        // The token is a secret: it is held in memory (mirrored from the
        // encrypted SecureStore) and NEVER written to localStorage (§7.1).
        const { personalAccessToken: _token, ...persistable } = updated;
        void _token;
        localStorage.setItem('gitofy_settings', JSON.stringify(persistable));
      } catch {
        // Fallback
      }
      return updated;
    });
  };

  const triggerHaptic = (type: 'tick' | 'click' | 'heavy' | 'success' | 'error' = 'tick') => {
    if (!settings.haptics || typeof navigator === 'undefined') return;
    try {
      if ('vibrate' in navigator) {
        switch (type) {
          case 'tick':
            navigator.vibrate(10);
            break;
          case 'click':
            navigator.vibrate(18);
            break;
          case 'heavy':
            navigator.vibrate(40);
            break;
          case 'success':
            navigator.vibrate([15, 40, 20]);
            break;
          case 'error':
            navigator.vibrate([30, 50, 30, 50, 40]);
            break;
        }
      }
    } catch {
      // Ignore vibration error
    }
  };

  // Sync background and M3 color tokens to root & body
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--md-sys-color-primary', colors.primary);
    root.style.setProperty('--md-sys-color-on-primary', colors.onPrimary);
    root.style.setProperty('--md-sys-color-primary-container', colors.primaryContainer);
    root.style.setProperty('--md-sys-color-on-primary-container', colors.onPrimaryContainer);
    root.style.setProperty('--md-sys-color-secondary', colors.secondary);
    root.style.setProperty('--md-sys-color-on-secondary', colors.onSecondary);
    root.style.setProperty('--md-sys-color-secondary-container', colors.secondaryContainer);
    root.style.setProperty('--md-sys-color-on-secondary-container', colors.onSecondaryContainer);
    root.style.setProperty('--md-sys-color-surface', colors.surface);
    root.style.setProperty('--md-sys-color-on-surface', colors.onSurface);
    root.style.setProperty('--md-sys-color-surface-variant', colors.surfaceVariant);
    root.style.setProperty('--md-sys-color-on-surface-variant', colors.onSurfaceVariant);
    root.style.setProperty('--md-sys-color-surface-container', colors.surfaceContainer);
    root.style.setProperty('--md-sys-color-surface-container-high', colors.surfaceContainerHigh);
    root.style.setProperty('--md-sys-color-surface-container-highest', colors.surfaceContainerHighest);
    root.style.setProperty('--md-sys-color-outline', colors.outline);
    root.style.setProperty('--md-sys-color-outline-variant', colors.outlineVariant);
    root.style.setProperty('--md-sys-color-error', colors.error);
    root.style.setProperty('--md-sys-color-background', colors.background);
    root.style.setProperty('--gitofy-nxt-primary-gradient', 'linear-gradient(135deg, #7E49E8 0%, #A15CE1 52%, #D45FAE 100%)');
    root.style.setProperty('--gitofy-nxt-surface-gradient', 'linear-gradient(145deg, #FFFFFF 0%, #F5F6FF 58%, #ECEBFA 100%)');
    root.style.setProperty('--gitofy-nxt-background-gradient', 'linear-gradient(135deg, #D8C4F0 0%, #F3ECFF 45%, #FFFFFF 100%)');

    document.body.style.backgroundColor = colors.background;
    document.body.style.color = colors.onBackground;
    document.documentElement.dataset.uiMode = 'light';
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.body.style.backgroundImage = 'none';
    // Keep the status-bar colour in step with the theme.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.background);
  }, [colors, isDark]);

  // Apply the appearance settings that used to be stored but never used.
  useEffect(() => {
    const root = document.documentElement;
    // Typeface — real-time, no reload.
    root.style.setProperty('--gitofy-font', FONT_STACKS[settings.fontFamily] || FONT_STACKS.josefin);
    // Text size: scale the root, so every rem-based size follows.
    root.style.fontSize = `${(16 * (settings.fontScale || 1)).toFixed(2)}px`;
    // Corner radius, exposed for the card stylesheet rule.
    root.style.setProperty('--gitofy-radius', `${settings.cornerRadius ?? 16}px`);
    // Density, exposed for the spacing rules.
    root.dataset.density = settings.uiDensity || 'normal';
  }, [settings.fontFamily, settings.fontScale, settings.cornerRadius, settings.uiDensity]);

  return (
    <ThemeContext.Provider
      value={{
        settings,
        updateSettings,
        colors,
        isDark,
        triggerHaptic,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
