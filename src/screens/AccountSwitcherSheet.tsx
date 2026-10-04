import React from 'react';
import { useTheme } from '../ui/ThemeContext';
import { useT } from '../i18n/strings';
import { M3BottomSheet } from '../ui/m3/M3BottomSheet';
import { M3Button } from '../ui/m3/M3Button';
import type { GitHubAccount } from '../auth/types';

/**
 * Account switcher (§7.5): an M3 bottom sheet listing accounts with avatar,
 * name, sign-in date and scopes; switch, add, and manage/remove.
 */
export interface AccountSwitcherSheetProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: GitHubAccount[];
  activeAccountId: number | null;
  onSwitch: (id: number) => void;
  onAdd: () => void;
  onManage: () => void;
  onRemove: (id: number) => void;
}

export const AccountSwitcherSheet: React.FC<AccountSwitcherSheetProps> = ({
  isOpen,
  onClose,
  accounts,
  activeAccountId,
  onSwitch,
  onAdd,
  onManage,
  onRemove,
}) => {
  const { colors, triggerHaptic } = useTheme();
  const t = useT();

  return (
    <M3BottomSheet isOpen={isOpen} onClose={onClose} title={t('accounts.title')} subtitle={t('accounts.switch')}>
      <div className="flex flex-col gap-2 pt-1">
        {accounts.map((a) => {
          const active = a.id === activeAccountId;
          return (
            <div
              key={a.id}
              className="flex items-center gap-3 p-3 rounded-2xl border"
              style={{ backgroundColor: active ? colors.primaryContainer : colors.surfaceContainerLow, borderColor: active ? colors.primary : colors.outlineVariant }}
            >
              <button
                type="button"
                className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                onClick={() => { triggerHaptic('tick'); onSwitch(a.id); onClose(); }}
              >
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt={a.login} className="w-11 h-11 rounded-full object-cover border" style={{ borderColor: colors.outlineVariant }} />
                ) : (
                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-black" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>{a.login.charAt(0).toUpperCase()}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black truncate" style={{ color: colors.onSurface }}>@{a.login}</div>
                  <div className="text-[10px]" style={{ color: colors.onSurfaceVariant }}>
                    {t('accounts.signedInOn')} {new Date(a.loginAt).toLocaleDateString()} · {a.tokenKind === 'pat' ? 'PAT' : 'OAuth'}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: colors.onSurfaceVariant }}>{a.scopes.join(', ') || '—'}</div>
                </div>
                {active && <span className="text-[10px] font-bold" style={{ color: colors.primary }}>● Active</span>}
              </button>
              <button
                type="button"
                aria-label={t('accounts.logoutOne')}
                className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
                style={{ color: colors.error, backgroundColor: colors.errorContainer }}
                onClick={() => { triggerHaptic('heavy'); onRemove(a.id); }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
              </button>
            </div>
          );
        })}

        <div className="flex gap-2 pt-2">
          <M3Button variant="tonal" shape="capsule" size="medium" className="flex-1 font-bold" onClick={onAdd}>
            {t('accounts.add')}
          </M3Button>
          <M3Button variant="text" shape="capsule" size="medium" className="flex-1" onClick={onManage}>
            {t('accounts.manage')}
          </M3Button>
        </div>
      </div>
    </M3BottomSheet>
  );
};
