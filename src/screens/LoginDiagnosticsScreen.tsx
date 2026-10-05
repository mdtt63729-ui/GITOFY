import React, { useEffect, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n/strings';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { tokenRepository } from '../auth/tokenRepository';
import { transportLabel } from '../auth/oauthHttp';
import { getFunnelSnapshot } from '../auth/diagnostics';
import { isClientConfigured } from '../auth/config';

/**
 * Login Diagnostics (§12): session health WITHOUT any token. Shows when the
 * session was last validated, the granted scopes, the remaining rate limit and
 * which storage/transport are in use.
 */
export interface LoginDiagnosticsScreenProps {
  onBack: () => void;
}

function Row({ label, value, colors }: { label: string; value: string; colors: import('../theme/tokens').M3ColorScheme }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: colors.outlineVariant }}>
      <span className="text-xs" style={{ color: colors.onSurfaceVariant }}>{label}</span>
      <span className="text-xs font-bold text-right" style={{ color: colors.onSurface }}>{value}</span>
    </div>
  );
}

export const LoginDiagnosticsScreen: React.FC<LoginDiagnosticsScreenProps> = ({ onBack }) => {
  const { colors } = useTheme();
  const t = useT();
  const { session, activeAccount, refreshSession } = useAuth();
  const [storage, setStorage] = useState('');
  const [funnel, setFunnel] = useState(getFunnelSnapshot());

  useEffect(() => {
    setStorage(tokenRepository.storageKind());
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const id = window.setInterval(() => setFunnel(getFunnelSnapshot()), 1500);
    return () => window.clearInterval(id);
  }, []);

  const lastValidated = activeAccount?.lastValidatedAt
    ? new Date(activeAccount.lastValidatedAt).toLocaleString()
    : t('diag.never');

  return (
    <div className="flex-1 flex flex-col gitofy-scroll select-none">
      <div className="sticky top-0 z-30 px-4 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f0`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <h2 className="text-base font-bold">{t('diag.title')}</h2>
      </div>

      <div className="p-5 flex flex-col gap-5 pb-28">
        <div className="p-4 rounded-3xl border" style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}>
          <Row label={t('diag.lastValidated')} value={lastValidated} colors={colors} />
          <Row label={t('diag.scopes')} value={session.scopes.length ? session.scopes.join(', ') : '—'} colors={colors} />
          <Row label={t('diag.rate')} value={session.rateLimitRemaining == null ? '—' : String(session.rateLimitRemaining)} colors={colors} />
          <Row label={t('diag.transport')} value={transportLabel()} colors={colors} />
          <Row label={t('diag.storage')} value={storage || '…'} colors={colors} />
          <Row label={t('diag.client')} value={isClientConfigured() ? t('diag.yes') : t('diag.no')} colors={colors} />
        </div>

        <div className="p-4 rounded-3xl border flex flex-col gap-2" style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Funnel</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {Object.entries(funnel.funnel).map(([k, v]) => (
              <React.Fragment key={k}>
                <span style={{ color: colors.onSurfaceVariant }}>{k}</span>
                <span className="font-bold text-right" style={{ color: colors.onSurface }}>{v}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="text-[10px] mt-1" style={{ color: colors.onSurfaceVariant }}>
            Median login: {funnel.medianLoginMs == null ? '—' : `${(funnel.medianLoginMs / 1000).toFixed(1)}s`} · Conversion: {(funnel.conversion * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
};
