import React, { useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { useT } from '../i18n/strings';
import { M3Button } from '../ui/m3/M3Button';
import { M3Switch } from '../ui/m3/M3Switch';
import { M3Slider } from '../ui/m3/M3Slider';
import { M3TextField } from '../ui/m3/M3TextField';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { validateGitHubToken } from '../git/githubApi';
import { openExternal } from '../utils/external';
import { AuthConfig, isGitHubApp, isWebFlowConfigured } from '../auth/config';
import { FONT_CHOICES, FONT_LABELS, FONT_STACKS } from '../theme/tokens';
import { WEB_FLOW_RISK_NOTICE } from '../auth/webPkce';
import type { GitHubAccount } from '../auth/types';

export interface SettingsScreenProps {
  onBack: () => void;
  onTokenUpdated?: () => void;
  onOpenGitHubSettings?: () => void;
  onOpenGists?: () => void;
  onOpenSearch?: () => void;
  onOpenErrorLog?: () => void;
  onOpenPermissions?: () => void;
  onOpenDiagnostics?: () => void;
  accounts?: GitHubAccount[];
  activeAccountId?: number | null;
  onAddAccount?: () => void;
  onLogoutOne?: (id: number) => void | Promise<void>;
  onLogoutAll?: () => void | Promise<void>;
}

/** Screens that can be locked individually (ids match AppScreen). */
export const LOCKABLE_SCREENS: { id: string; label: string }[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'github_settings', label: 'GitHub account settings' },
  { id: 'repo_settings', label: 'Repository settings' },
  { id: 'branch_manager', label: 'Branches' },
  { id: 'release_creator', label: 'New release' },
  { id: 'gists', label: 'Gists' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'repo_files', label: 'Repository files' },
  { id: 'repo_commits', label: 'Repository commits' },
  { id: 'upload_flow', label: 'Upload' },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onBack,
  onTokenUpdated,
  onOpenGitHubSettings,
  onOpenGists,
  onOpenSearch,
  onOpenErrorLog,
  onOpenPermissions,
  onOpenDiagnostics,
  accounts = [],
  activeAccountId,
  onAddAccount,
  onLogoutOne,
  onLogoutAll,
}) => {
  const { colors, settings, updateSettings, triggerHaptic } = useTheme();
  const t = useT();
  const [tokenInput, setTokenInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState(settings.githubClientId || '');
  const [isValidating, setIsValidating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; error: boolean } | null>(null);

  const handleSaveClientId = () => {
    triggerHaptic('success');
    updateSettings({ githubClientId: clientIdInput.trim() });
    setStatusMessage({ text: 'Client ID saved. Reloading to apply…', error: false });
    window.setTimeout(() => window.location.reload(), 700);
  };

  const handleValidateAndSaveToken = async () => {
    if (!tokenInput.trim()) {
      setStatusMessage({ text: 'Enter a token first.', error: true });
      return;
    }
    setIsValidating(true);
    setStatusMessage(null);
    const res = await validateGitHubToken(tokenInput.trim());
    setIsValidating(false);
    if (res.success) {
      triggerHaptic('success');
      updateSettings({
        personalAccessToken: tokenInput.trim(),
        githubUsername: res.username,
        avatarUrl: res.avatarUrl,
      });
      setStatusMessage({ text: `Connected as @${res.username}!`, error: false });
      setTokenInput('');
      onTokenUpdated?.();
    } else {
      triggerHaptic('error');
      setStatusMessage({ text: res.error || 'Authentication failed', error: true });
    }
  };

  // ---- Settings backup & restore ---------------------------------------
  const settingsFileRef = useRef<HTMLInputElement | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const handleExportSettings = () => {
    try {
      // The token is a secret and is deliberately left out.
      const { personalAccessToken: _t, ...safe } = settings;
      void _t;
      const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'gitofy-settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setBackupMessage('✓ Settings exported');
      window.setTimeout(() => setBackupMessage(null), 2600);
    } catch {
      setBackupMessage('Could not export the settings.');
    }
  };

  const handleImportSettings = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<typeof settings>;
      // Never let a file overwrite the token.
      delete (parsed as { personalAccessToken?: string }).personalAccessToken;
      updateSettings(parsed);
      setBackupMessage('✓ Settings imported');
      window.setTimeout(() => setBackupMessage(null), 2600);
    } catch {
      setBackupMessage('That file could not be read.');
    }
  };

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none">
      {/* Top Bar */}
      <div
        className="sticky top-0 z-30 px-4 py-3 border-b gitofy-topbar flex items-center justify-between"
        style={{ backgroundColor: `${colors.surface}f0`, borderColor: colors.outlineVariant }}
      >
        <div className="flex items-center gap-2">
          <M3IconButton aria-label="Back" onClick={onBack}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </M3IconButton>
          <h2 className="text-base font-bold">Settings &amp; Customization</h2>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-6 pb-28">
        {/* GitHub Accounts (§7.5, §12) */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3.5"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
              {t('settings.authSection')}
            </span>
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                backgroundColor: activeAccount ? colors.diffAddedContainer : colors.surfaceContainerHighest,
                color: activeAccount ? colors.diffAdded : colors.onSurfaceVariant,
              }}
            >
              {activeAccount ? `● ${t('settings.connected')}` : t('settings.notConnected')}
            </span>
          </div>

          {accounts.length === 0 && (
            <p className="text-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
              No accounts yet. Sign in with GitHub to get started.
            </p>
          )}

          {accounts.map((a) => {
            const active = a.id === activeAccountId;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 p-3 rounded-2xl border"
                style={{
                  backgroundColor: active ? colors.primaryContainer : colors.surfaceContainerLowest,
                  borderColor: active ? colors.primary : colors.outlineVariant,
                }}
              >
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt={a.login} className="w-10 h-10 rounded-full object-cover border" style={{ borderColor: colors.outlineVariant }} />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-black" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}>
                    {a.login.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black truncate" style={{ color: colors.onSurface }}>
                    @{a.login} {active && <span className="text-[10px] font-bold" style={{ color: colors.primary }}>· active</span>}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: colors.onSurfaceVariant }}>
                    {new Date(a.loginAt).toLocaleDateString()} · {a.tokenKind === 'pat' ? 'PAT' : 'OAuth'} · {a.scopes.join(', ') || 'no scopes'}
                  </div>
                </div>
                {onLogoutOne && (
                  <button
                    type="button"
                    aria-label={t('accounts.logoutOne')}
                    className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                    style={{ color: colors.error, backgroundColor: colors.errorContainer }}
                    onClick={() => { triggerHaptic('heavy'); void onLogoutOne(a.id); }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                  </button>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-2">
            {onAddAccount && (
              <M3Button variant="tonal" shape="capsule" size="compact" onClick={onAddAccount}>
                {t('accounts.add')}
              </M3Button>
            )}
            {onOpenPermissions && (
              <M3Button variant="text" shape="capsule" size="compact" onClick={onOpenPermissions}>
                {t('perm.title')}
              </M3Button>
            )}
          </div>
        </div>

        {/* Account & security (§7.6, §12) */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3.5"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            Account &amp; Security
          </span>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">{t('settings.appLock')}</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { id: 'off' as const, label: t('settings.appLockOff') },
                { id: 'always' as const, label: t('settings.appLockAlways') },
                { id: '1m' as const, label: t('settings.appLock1m') },
                { id: '5m' as const, label: t('settings.appLock5m') },
              ]).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateSettings({ appLockMode: m.id })}
                  className={`py-2 px-1.5 rounded-2xl text-[10px] font-bold border transition-all cursor-pointer ${settings.appLockMode === m.id ? 'ring-2' : ''}`}
                  style={{
                    backgroundColor: settings.appLockMode === m.id ? colors.primary : colors.surfaceContainerLowest,
                    color: settings.appLockMode === m.id ? colors.onPrimary : colors.onSurface,
                    borderColor: colors.outlineVariant,
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 border-t pt-3">
            <div>
              <p className="text-xs font-bold">Lock specific screens</p>
              <p className="text-[10px] opacity-70 leading-relaxed">
                Ask for your fingerprint or face again when opening these. Needs a lock mode above other than Off.
              </p>
            </div>
            {LOCKABLE_SCREENS.map((sc) => {
              const on = (settings.lockedScreens ?? []).includes(sc.id);
              return (
                <div key={sc.id} className="flex items-center justify-between gap-3">
                  <span className="text-xs">{sc.label}</span>
                  <M3Switch
                    checked={on}
                    onChange={(val) =>
                      updateSettings({
                        lockedScreens: val
                          ? [...(settings.lockedScreens ?? []), sc.id]
                          : (settings.lockedScreens ?? []).filter((x) => x !== sc.id),
                      })
                    }
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">{t('settings.flagSecure')}</p>
              <p className="text-[10px] opacity-70">Blur the app preview in the Recents switcher</p>
            </div>
            <M3Switch checked={settings.flagSecure} onChange={(val) => updateSettings({ flagSecure: val })} />
          </div>

          <a
            href={isGitHubApp() ? AuthConfig.endpoints.manageInstallations : AuthConfig.endpoints.manageApps}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold py-2 px-3 rounded-xl border text-center"
            style={{ backgroundColor: colors.surfaceContainerHighest, borderColor: colors.outline, color: colors.primary }}
          >
            {t('settings.removeAccess')} ↗
          </a>

          {onOpenDiagnostics && (
            <M3Button variant="text" shape="capsule" size="compact" className="w-full justify-between" onClick={onOpenDiagnostics}>
              <span>{t('settings.diagnostics')}</span>
              <span>→</span>
            </M3Button>
          )}
        </div>

        {/* Theme Studio & Material 3 Palettes */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-4"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            Appearance &amp; Tonal Palettes
          </span>

          {/* Theme: Light / Dark / System */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Theme</label>
            <div className="grid grid-cols-3 gap-2">
              {(['light', 'dark', 'system'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { triggerHaptic('tick'); updateSettings({ themeMode: mode }); }}
                  className={`py-2 px-2.5 rounded-2xl text-xs font-bold border capitalize transition-all cursor-pointer ${settings.themeMode === mode ? 'ring-2' : ''}`}
                  style={{
                    backgroundColor: settings.themeMode === mode ? colors.primary : colors.surfaceContainerLowest,
                    color: settings.themeMode === mode ? colors.onPrimary : colors.onSurface,
                    borderColor: colors.outlineVariant,
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* M3 Color Palettes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">M3 Accent Palette</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'crimson', label: 'Crimson' },
                { id: 'pink', label: 'Pink' },
                { id: 'violet', label: 'Violet' },
                { id: 'indigo', label: 'Indigo' },
                { id: 'emerald', label: 'Emerald' },
                { id: 'cyan', label: 'Cyan' },
              ] as const).map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => updateSettings({ palette: pal.id })}
                  className={`py-2 px-2.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${settings.palette === pal.id ? 'ring-2' : ''}`}
                  style={{
                    backgroundColor: settings.palette === pal.id ? colors.primary : colors.surfaceContainerLowest,
                    color: settings.palette === pal.id ? colors.onPrimary : colors.onSurface,
                    borderColor: colors.outlineVariant,
                  }}
                >
                  {pal.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font — real-time, app-wide */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Font</label>
            <p className="text-[10px] opacity-70 leading-relaxed">
              Changes every screen instantly. Bengali text always falls back to Noto Sans Bengali.
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              {FONT_CHOICES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { triggerHaptic('tick'); updateSettings({ fontFamily: f }); }}
                  className={`px-3.5 py-2 rounded-full text-xs border transition-all cursor-pointer ${settings.fontFamily === f ? 'ring-2' : ''}`}
                  style={{
                    fontFamily: FONT_STACKS[f],
                    fontWeight: 600,
                    backgroundColor: settings.fontFamily === f ? colors.primary : colors.surfaceContainerLowest,
                    color: settings.fontFamily === f ? colors.onPrimary : colors.onSurface,
                    borderColor: colors.outlineVariant,
                  }}
                >
                  {FONT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {/* UI Density */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">UI Density</label>
            <div className="grid grid-cols-3 gap-2">
              {(['compact', 'normal', 'relaxed'] as const).map((density) => (
                <button
                  key={density}
                  type="button"
                  onClick={() => updateSettings({ uiDensity: density })}
                  className={`py-2 px-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer capitalize ${settings.uiDensity === density ? 'ring-2' : ''}`}
                  style={{
                    backgroundColor: settings.uiDensity === density ? colors.primary : colors.surfaceContainerLowest,
                    color: settings.uiDensity === density ? colors.onPrimary : colors.onSurface,
                    borderColor: colors.outlineVariant,
                  }}
                >
                  {density}
                </button>
              ))}
            </div>
          </div>

          <M3Slider
            label="Component Corner Radius"
            min={8}
            max={28}
            value={settings.cornerRadius}
            unit="dp"
            onChange={(val) => updateSettings({ cornerRadius: val })}
          />
        </div>

        {/* Live GitHub Actions */}
        <div className="p-5 rounded-3xl border flex flex-col gap-4" style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Live Runs</span>
            <span className="text-[10px] font-bold" style={{ color: colors.primary }}>{settings.instantMode ? 'Instant mode' : 'Direct mode'}</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
            GitHub Actions updates use Direct Mode by default. Instant mode is used when a compatible relay is configured; logs always stay device → GitHub.
          </p>
          <div className="flex items-center justify-between gap-2 text-xs font-semibold"><span>Instant mode</span><M3Switch ariaLabel="Instant mode" checked={settings.instantMode} onChange={(checked) => updateSettings({ instantMode: checked })} /></div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Polling aggressiveness</label>
            <div className="grid grid-cols-3 gap-2">
              {(['battery', 'balanced', 'max'] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => updateSettings({ liveRunsPolling: mode })} className="py-2 px-2 rounded-2xl text-xs font-bold border capitalize" style={{ backgroundColor: settings.liveRunsPolling === mode ? colors.primary : colors.surfaceContainerLowest, color: settings.liveRunsPolling === mode ? colors.onPrimary : colors.onSurface, borderColor: colors.outlineVariant }}>{mode}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold"><span>Auto-follow logs</span><M3Switch ariaLabel="Auto-follow logs" checked={settings.liveRunsAutoFollow} onChange={(checked) => updateSettings({ liveRunsAutoFollow: checked })} /></div>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold"><span>Wrap logs</span><M3Switch ariaLabel="Wrap logs" checked={settings.liveRunsWrap} onChange={(checked) => updateSettings({ liveRunsWrap: checked })} /></div>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold"><span>Timestamps</span><M3Switch ariaLabel="Timestamps" checked={settings.liveRunsTimestamps} onChange={(checked) => updateSettings({ liveRunsTimestamps: checked })} /></div>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold"><span>Debug lines</span><M3Switch ariaLabel="Debug lines" checked={settings.liveRunsDebugLines} onChange={(checked) => updateSettings({ liveRunsDebugLines: checked })} /></div>
          </div>
          <M3Slider label="Log font size" min={8} max={18} value={settings.liveRunsLogFontSize} unit="px" onChange={(val) => updateSettings({ liveRunsLogFontSize: val })} />
          <M3Slider label="On-device log cache" min={1} max={30} value={settings.liveRunsCacheDays} unit="days" onChange={(val) => updateSettings({ liveRunsCacheDays: val })} />
        </div>

        {/* Git & Push Configurations */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3.5"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            Git &amp; Push Defaults
          </span>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold">Default Branch</p>
              <p className="text-[10px] opacity-70">Target branch for repository commits</p>
            </div>
            <select
              value={settings.defaultBranch}
              onChange={(e) => updateSettings({ defaultBranch: e.target.value })}
              className="text-xs font-mono font-bold p-1.5 rounded-lg border bg-transparent"
              style={{ borderColor: colors.outlineVariant, color: colors.onSurface }}
            >
              <option value="main">main</option>
              <option value="master">master</option>
              <option value="develop">develop</option>
            </select>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Default New Repo Visibility</p>
              <p className="text-[10px] opacity-70">Initial privacy for newly created repos</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => updateSettings({ defaultVisibility: 'private' })} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${settings.defaultVisibility === 'private' ? 'ring-2' : ''}`} style={{ backgroundColor: settings.defaultVisibility === 'private' ? colors.primary : 'transparent', color: settings.defaultVisibility === 'private' ? colors.onPrimary : colors.onSurface, borderColor: colors.outlineVariant }}>Private</button>
              <button type="button" onClick={() => updateSettings({ defaultVisibility: 'public' })} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${settings.defaultVisibility === 'public' ? 'ring-2' : ''}`} style={{ backgroundColor: settings.defaultVisibility === 'public' ? colors.primary : 'transparent', color: settings.defaultVisibility === 'public' ? colors.onPrimary : colors.onSurface, borderColor: colors.outlineVariant }}>Public</button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Strip Archive Root Folder</p>
              <p className="text-[10px] opacity-70">Flattens single top-level directory in ZIP archives automatically</p>
            </div>
            <M3Switch checked={settings.stripRootFolder} onChange={(val) => updateSettings({ stripRootFolder: val })} />
          </div>

          <M3Slider label="Max Concurrent Blob Uploads" min={1} max={8} step={1} value={settings.maxConcurrentUploads} unit=" files" onChange={(val) => updateSettings({ maxConcurrentUploads: val })} />
        </div>

        {/* Navigation & Motion Settings */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3.5"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            Navigation &amp; Motion
          </span>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold">Auto-Hide Floating Nav</p>
              <p className="text-[10px] opacity-70">Hide capsule navigation on forward scroll; bring back on back-scroll</p>
            </div>
            <M3Switch checked={settings.autoHideNav} onChange={(val) => updateSettings({ autoHideNav: val })} />
          </div>

          <M3Slider label="Scroll Detection Threshold" min={12} max={48} value={settings.scrollThreshold} unit="dp" onChange={(val) => updateSettings({ scrollThreshold: val })} />

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Haptic Feedback</p>
              <p className="text-[10px] opacity-70">Tactile vibration on buttons, switches, and sliders</p>
            </div>
            <M3Switch checked={settings.haptics} onChange={(val) => updateSettings({ haptics: val })} />
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Reduce Motion</p>
              <p className="text-[10px] opacity-70">Disable springs and heavy transforms</p>
            </div>
            <M3Switch checked={settings.reduceMotion} onChange={(val) => updateSettings({ reduceMotion: val })} />
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Language</p>
              <p className="text-[10px] opacity-70">App language</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => updateSettings({ language: 'en' })} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${settings.language === 'en' ? 'ring-2' : ''}`} style={{ backgroundColor: settings.language === 'en' ? colors.primary : 'transparent', color: settings.language === 'en' ? colors.onPrimary : colors.onSurface, borderColor: colors.outlineVariant }}>EN</button>
              <button type="button" onClick={() => updateSettings({ language: 'bn' })} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${settings.language === 'bn' ? 'ring-2' : ''}`} style={{ backgroundColor: settings.language === 'bn' ? colors.primary : 'transparent', color: settings.language === 'bn' ? colors.onPrimary : colors.onSurface, borderColor: colors.outlineVariant }}>বাং</button>
            </div>
          </div>
        </div>

        {/* Advanced (§12) */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3.5"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            {t('settings.advanced')}
          </span>

          <div className="flex items-center justify-between">
            <div className="pr-3">
              <p className="text-xs font-bold">{t('settings.webFlow')}</p>
              <p className="text-[10px] opacity-70 leading-relaxed">
                {isWebFlowConfigured() ? WEB_FLOW_RISK_NOTICE : 'Not available — this build uses the Device Flow only (no client secret is embedded).'}
              </p>
            </div>
            {isWebFlowConfigured() ? (
              <M3Switch
                checked={settings.enableWebFlow}
                onChange={(val) => updateSettings({ enableWebFlow: val })}
              />
            ) : (
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
              >
                Not available
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs font-bold">Personal Access Token (fallback)</p>
            <M3TextField
              label="Personal Access Token (PAT)"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            />
            <div className="flex items-center justify-between gap-2">
              <M3Button variant="filled" shape="capsule" size="compact" loading={isValidating} onClick={handleValidateAndSaveToken}>
                Verify &amp; Save Token
              </M3Button>
              <button
                type="button"
                onClick={() => openExternal('https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo,notifications&description=Gitufy')}
                className="text-xs font-semibold px-2 py-1 rounded hover:underline cursor-pointer"
                style={{ color: colors.primary, background: 'transparent', border: 0 }}
              >
                Generate Token ↗
              </button>
            </div>
            {statusMessage && (
              <p className="text-xs font-bold animate-fade-in" style={{ color: statusMessage.error ? colors.error : colors.diffAdded }}>
                {statusMessage.error ? '✕ ' : '✓ '}
                {statusMessage.text}
              </p>
            )}
          </div>

          {/* GitHub OAuth client id — the login always uses this, never Google */}
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs font-bold">GitHub OAuth Client ID</p>
            <p className="text-[10px] opacity-70 leading-relaxed">
              Login uses this GitHub client id — no Google OAuth is involved anywhere.
              Leave it empty to use the built-in one, or paste your own GitHub OAuth App
              (<span className="font-mono">Ov23li…</span>) or GitHub App
              (<span className="font-mono">Iv23li…</span>) client id.
            </p>
            <M3TextField
              label="Client ID"
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              placeholder="Iv23li… or Ov23li…"
            />
            <div className="flex items-center justify-between gap-2">
              <M3Button variant="tonal" shape="capsule" size="compact" onClick={handleSaveClientId}>
                Save client ID
              </M3Button>
              <span className="text-[10px] opacity-70 truncate">
                Active: <span className="font-mono">{AuthConfig.clientId || '—'}</span>
                {AuthConfig.clientId ? ` · ${isGitHubApp() ? 'GitHub App' : 'OAuth App'}` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* GitHub account settings — everything github.com/settings lets you change */}
        {onOpenGitHubSettings && (
          <div
            className="p-5 rounded-3xl border flex flex-col gap-3"
            style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.8 18 5.1 18 5.1c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">GitHub account</span>
            </div>
            <p className="text-xs leading-relaxed opacity-80" style={{ color: colors.onSurfaceVariant }}>
              Edit your name, bio, company, location, website, social handle and hireable status — the same
              fields as github.com/settings/profile. Repository settings (visibility, features, merge options,
              archive, default branch) live on each repository's own settings page.
            </p>
            <M3Button variant="tonal" shape="rounded" size="medium" className="w-full justify-between" onClick={onOpenGitHubSettings}>
              <span>Open GitHub account settings</span>
              <span>→</span>
            </M3Button>
            {onOpenGists && (
              <M3Button variant="tonal" shape="rounded" size="medium" className="w-full justify-between" onClick={onOpenGists}>
                <span>Gists</span>
                <span>→</span>
              </M3Button>
            )}
            {onOpenSearch && (
              <M3Button variant="tonal" shape="rounded" size="medium" className="w-full justify-between" onClick={onOpenSearch}>
                <span>Search everything</span>
                <span>→</span>
              </M3Button>
            )}
            {onOpenErrorLog && (
              <M3Button variant="tonal" shape="rounded" size="medium" className="w-full justify-between" onClick={onOpenErrorLog}>
                <span>Error log</span>
                <span>→</span>
              </M3Button>
            )}
          </div>
        )}

        {/* Backup & restore */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            Backup &amp; restore
          </span>
          <p className="text-xs leading-relaxed opacity-80" style={{ color: colors.onSurfaceVariant }}>
            Save every setting to a file, or load one back. Your token is never included.
          </p>
          <div className="flex gap-2">
            <M3Button variant="tonal" shape="capsule" size="compact" className="flex-1" onClick={handleExportSettings}>
              Export settings
            </M3Button>
            <M3Button variant="tonal" shape="capsule" size="compact" className="flex-1" onClick={() => settingsFileRef.current?.click()}>
              Import settings
            </M3Button>
          </div>
          <input
            ref={settingsFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportSettings}
          />
          {backupMessage && (
            <p className="text-xs font-bold animate-fade-in" style={{ color: colors.diffAdded }}>{backupMessage}</p>
          )}
        </div>

        {/* Danger zone — log out of every account */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.error }}>Danger zone</span>
          {onLogoutAll && (
            <div className="p-4 rounded-3xl border flex flex-col gap-2" style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}>
              <M3Button variant="destructive-filled" shape="capsule" size="large" className="w-full" onClick={() => { triggerHaptic('heavy'); void onLogoutAll(); }}>
                {t('accounts.logoutAll')}
              </M3Button>
              <p className="text-[10px] opacity-70 text-center">Wipes every token, profile cache and local data from this device.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
