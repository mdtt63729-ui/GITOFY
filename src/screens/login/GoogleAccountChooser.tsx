import React from 'react';
import { useTheme } from '../../ui/ThemeContext';
import { useT } from '../../i18n/strings';
import { M3BottomSheet } from '../../ui/m3/M3BottomSheet';
import type { GitHubAccount } from '../../auth/types';

/**
 * In-app "Choose an account" chooser shown when the user taps
 * "Log in with Google" (which performs the GitHub OAuth device flow under the
 * hood). It never leaves the app: picking a previously signed-in account
 * restores that session instantly, while "Use another account" starts a fresh
 * GitHub login.
 */
export interface GoogleAccountChooserProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: GitHubAccount[];
  onPick: (account: GitHubAccount) => void;
  onUseAnother: () => void;
}

export const GoogleAccountChooser: React.FC<GoogleAccountChooserProps> = ({
  isOpen,
  onClose,
  accounts,
  onPick,
  onUseAnother,
}) => {
  const { colors, triggerHaptic } = useTheme();
  const t = useT();

  return (
    <M3BottomSheet isOpen={isOpen} onClose={onClose} title={t('chooser.title')} subtitle={t('chooser.subtitle')}>
      <div className="flex flex-col gap-2 pt-1">
        {accounts.length > 0 && (
          <p className="text-[10px] px-1" style={{ color: colors.onSurfaceVariant }}>
            {t('chooser.hint')}
          </p>
        )}

        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              triggerHaptic('tick');
              onPick(a);
            }}
            className="flex items-center gap-3 p-3 rounded-2xl border text-left cursor-pointer active:scale-[0.99] transition-transform"
            style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
          >
            {a.avatarUrl ? (
              <img
                src={a.avatarUrl}
                alt={a.login}
                className="w-10 h-10 rounded-full object-cover border"
                style={{ borderColor: colors.outlineVariant }}
              />
            ) : (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-black"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
              >
                {a.login.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black truncate" style={{ color: colors.onSurface }}>
                {a.name || `@${a.login}`}
              </div>
              <div className="text-[10px] truncate" style={{ color: colors.onSurfaceVariant }}>
                @{a.login}
              </div>
            </div>
            <span className="opacity-35">›</span>
          </button>
        ))}

        {/* Use another account — starts a fresh GitHub device-flow login */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('click');
            onUseAnother();
          }}
          className="flex items-center gap-3 p-3 rounded-2xl border text-left cursor-pointer active:scale-[0.99] transition-transform"
          style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold" style={{ color: colors.onSurface }}>
              {t('chooser.useAnother')}
            </div>
          </div>
        </button>
      </div>
    </M3BottomSheet>
  );
};
