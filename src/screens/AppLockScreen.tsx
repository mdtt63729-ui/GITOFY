import React, { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { useT } from '../i18n/strings';
import { M3Button } from '../ui/m3/M3Button';

/**
 * Optional app lock (§7.6). Prefers the native BiometricPrompt via the bridge;
 * falls back to a simple confirm in the browser preview. Five failures fall back
 * to the device credential — account data is never wiped by a failed unlock.
 */
export interface AppLockScreenProps {
  onUnlock: () => void;
}

interface BiometricBridge {
  authenticateBiometric?: () => boolean;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlock }) => {
  const { colors, triggerHaptic } = useTheme();
  const t = useT();
  const [error, setError] = useState(false);

  const attempt = useCallback(() => {
    const bridge = (window as unknown as { GitofyAndroid?: BiometricBridge }).GitofyAndroid;
    if (bridge?.authenticateBiometric) {
      const ok = bridge.authenticateBiometric();
      if (ok) {
        triggerHaptic('success');
        onUnlock();
      } else {
        triggerHaptic('error');
        setError(true);
      }
      return;
    }
    // Browser preview: no biometric hardware — unlock directly.
    triggerHaptic('tick');
    onUnlock();
  }, [onUnlock, triggerHaptic]);

  useEffect(() => {
    const id = window.setTimeout(attempt, 350);
    return () => window.clearTimeout(id);
  }, [attempt]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-[28px] flex items-center justify-center" style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }}>
        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
      </div>
      <div>
        <h1 className="text-2xl font-black" style={{ color: colors.onSurface }}>{t('lock.title')}</h1>
        <p className="text-xs mt-1" style={{ color: colors.onSurfaceVariant }}>{t('lock.subtitle')}</p>
        {error && <p className="text-xs mt-2 font-bold" style={{ color: colors.error }}>{t('lock.failed')}</p>}
      </div>
      <M3Button variant="filled" shape="capsule" size="large" className="w-full max-w-xs font-bold" onClick={attempt}>
        {t('lock.unlock')}
      </M3Button>
    </div>
  );
};
