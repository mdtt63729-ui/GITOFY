import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  M3ColorScheme,
  GitofySettings,
  lightThemes,
  darkThemes,
  defaultSettings,
} from '../theme/tokens';

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
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch {
      // Fallback
    }
    return defaultSettings;
  });

  const isDark =
    settings.themeMode === 'dark'
      ? true
      : settings.themeMode === 'light'
      ? false
      : typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true;

  const activeThemeDict = isDark ? darkThemes : lightThemes;
  const colors = activeThemeDict[settings.palette] || activeThemeDict.pink;

  const updateSettings = (partial: Partial<GitofySettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      try {
        localStorage.setItem('gitofy_settings', JSON.stringify(updated));
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

    document.body.style.backgroundColor = colors.background;
    document.body.style.color = colors.onBackground;
  }, [colors]);

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
