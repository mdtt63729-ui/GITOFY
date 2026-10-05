import React, { useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n/strings';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { FEATURE_SCOPES, SCOPE_CATALOG, type ScopeKey } from '../auth/scopes';

/**
 * Permissions screen (§4, §12). Every scope, in plain language, with what it
 * unlocks and a just-in-time "Grant permission" action for anything missing.
 */
export interface PermissionsScreenProps {
  onBack: () => void;
}

export const PermissionsScreen: React.FC<PermissionsScreenProps> = ({ onBack }) => {
  const { colors, triggerHaptic } = useTheme();
  const t = useT();
  const { grantedScopes, requestFeatureScope, activeAccount } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const scopesUnknown = activeAccount?.scopesKnown === false;

  const featureForScope = (scope: ScopeKey): string | null => {
    for (const [feature, scopes] of Object.entries(FEATURE_SCOPES)) {
      if (scopes.includes(scope)) return feature;
    }
    return null;
  };

  const grant = async (scope: ScopeKey) => {
    const feature = featureForScope(scope);
    if (!feature) return;
    setBusy(scope);
    triggerHaptic('click');
    await requestFeatureScope(feature);
    setBusy(null);
  };

  const all = Object.values(SCOPE_CATALOG);

  return (
    <div className="flex-1 flex flex-col gitofy-scroll select-none">
      <div className="sticky top-0 z-30 px-4 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f0`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div>
          <h2 className="text-base font-bold">{t('perm.title')}</h2>
          <p className="text-[10px]" style={{ color: colors.onSurfaceVariant }}>{t('perm.subtitle')}</p>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-3 pb-28">
        {scopesUnknown && (
          <div className="p-3.5 rounded-2xl border text-[11px] leading-relaxed" style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outlineVariant, color: colors.onSurfaceVariant }}>
            This account is a GitHub App. Permissions are managed in the app's settings on GitHub rather than as OAuth scopes, so individual scopes are not shown here.
          </div>
        )}
        {all.map((meta) => {
          const granted = scopesUnknown || grantedScopes.includes(meta.key);
          const feature = featureForScope(meta.key);
          return (
            <div key={meta.key} className="p-4 rounded-3xl border flex flex-col gap-2.5" style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-black" style={{ color: colors.onSurface }}>{meta.title}</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: granted ? colors.diffAddedContainer : colors.surfaceContainerHighest, color: granted ? colors.diffAdded : colors.onSurfaceVariant }}>
                  {granted ? `✓ ${t('perm.granted')}` : t('perm.notGranted')}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>{meta.reason}</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] font-bold" style={{ color: colors.onSurfaceVariant }}>{t('perm.usedFor')}:</span>
                {meta.features.map((f) => (
                  <span key={f} className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>{f}</span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <code className="text-[10px] font-mono" style={{ color: colors.onSurfaceVariant }}>{meta.key}</code>
                {!granted && feature && !scopesUnknown && (
                  <M3Button variant="tonal" shape="capsule" size="compact" loading={busy === meta.key} onClick={() => grant(meta.key)}>
                    {t('perm.add')}
                  </M3Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
