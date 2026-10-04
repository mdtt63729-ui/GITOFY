import React from 'react';
import { useTheme } from '../../ui/ThemeContext';
import { useT } from '../../i18n/strings';
import { M3BottomSheet } from '../../ui/m3/M3BottomSheet';
import type { GitHubAccount } from '../../auth/types';

export interface GoogleAccount {
  name: string;
  label: string;
}

/**
 * In-app "Choose an account" chooser, shown when the user taps "Log in with
 * Google". It lists the Google accounts present on the device (so the sheet is
 * populated like Google's own picker), any previously signed-in GitHub accounts,
 * and a "Use another account" row that starts a fresh GitHub login.
 *
 * Note: a Google account cannot itself authorise GitHub from a third-party app —
 * GitHub's own "Sign in with Google" runs on GitHub's page. Picking an account
 * therefore continues into the GitHub sign-in, which opens in the browser.
 */
export interface GoogleAccountChooserProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: GitHubAccount[];
  googleAccounts?: GoogleAccount[];
  onPick: (account: GitHubAccount) => void;
  onPickGoogle?: (account: GoogleAccount) => void;
  onUseAnother: () => void;
}

const GoogleMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export const GoogleAccountChooser: React.FC<GoogleAccountChooserProps> = ({
  isOpen,
  onClose,
  accounts,
  googleAccounts = [],
  onPick,
  onPickGoogle,
  onUseAnother,
}) => {
  const { colors, triggerHaptic } = useTheme();
  const t = useT();

  return (
    <M3BottomSheet isOpen={isOpen} onClose={onClose} title={t('chooser.title')} subtitle={t('chooser.subtitle')}>
      <div className="flex flex-col gap-2 pt-1">
        {/* Google accounts on this device — shown like Google's own picker */}
        {googleAccounts.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-1 pb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
                Google accounts on this device
              </span>
            </div>
            {googleAccounts.map((g) => (
              <button
                key={g.name}
                type="button"
                onClick={() => {
                  triggerHaptic('tick');
                  onPickGoogle?.(g);
                }}
                className="flex items-center gap-3 p-3 rounded-2xl border text-left cursor-pointer active:scale-[0.99] transition-transform"
                style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
              >
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center border"
                  style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurfaceVariant }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate" style={{ color: colors.onSurface }}>{g.label}</div>
                  <div className="text-[10px] truncate" style={{ color: colors.onSurfaceVariant }}>{g.name}</div>
                </div>
                <span className="opacity-35">›</span>
              </button>
            ))}
          </>
        )}

        {/* Previously signed-in GitHub accounts */}
        {accounts.length > 0 && (
          <p className="text-[10px] px-1 pt-1" style={{ color: colors.onSurfaceVariant }}>
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

        {/* Use another account — starts a fresh GitHub login */}
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
