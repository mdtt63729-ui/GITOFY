import React, { useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3Switch } from '../ui/m3/M3Switch';
import { M3Slider } from '../ui/m3/M3Slider';
import { M3TextField } from '../ui/m3/M3TextField';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { validateGitHubToken } from '../git/githubApi';

export interface SettingsScreenProps {
  onBack: () => void;
  onTokenUpdated?: () => void;
  onOpenGallery?: () => void;
  onOpenMotionLab?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onBack,
  onTokenUpdated,
  onOpenGallery,
  onOpenMotionLab,
}) => {
  const { colors, settings, updateSettings, triggerHaptic } = useTheme();
  const [tokenInput, setTokenInput] = useState(settings.personalAccessToken);
  const [isValidating, setIsValidating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; error: boolean } | null>(null);

  const handleValidateAndSaveToken = async () => {
    if (!tokenInput.trim()) {
      updateSettings({
        personalAccessToken: '',
        githubUsername: '',
        avatarUrl: '',
      });
      setStatusMessage({ text: 'Token cleared.', error: false });
      onTokenUpdated?.();
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
      onTokenUpdated?.();
    } else {
      triggerHaptic('error');
      setStatusMessage({ text: res.error || 'Authentication failed', error: true });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto overscroll-contain select-none">
      {/* Top Bar */}
      <div
        className="sticky top-0 z-30 px-4 py-3 backdrop-blur-md border-b flex items-center justify-between"
        style={{
          backgroundColor: `${colors.surface}f0`,
          borderColor: colors.outlineVariant,
        }}
      >
        <div className="flex items-center gap-2">
          <M3IconButton aria-label="Back" onClick={onBack}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </M3IconButton>
          <h2 className="text-base font-bold">Settings & Customization</h2>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-6 pb-28">
        {/* GitHub Account & PAT */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3.5"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
              GitHub Authentication
            </span>
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                backgroundColor: settings.personalAccessToken ? colors.diffAddedContainer : colors.surfaceContainerHighest,
                color: settings.personalAccessToken ? colors.diffAdded : colors.onSurfaceVariant,
              }}
            >
              {settings.personalAccessToken ? `● Connected (@${settings.githubUsername})` : 'Not Connected'}
            </span>
          </div>

          <p className="text-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
            Enter your GitHub Personal Access Token (classic or fine-grained with <code className="font-mono bg-black/10 px-1 rounded">repo</code> and <code className="font-mono bg-black/10 px-1 rounded">workflow</code> scopes) to enable real pushes, repository creation, and deletes.
          </p>

          <M3TextField
            label="Personal Access Token (PAT)"
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          />

          <div className="flex items-center justify-between gap-2">
            <M3Button
              variant="filled"
              shape="capsule"
              size="compact"
              loading={isValidating}
              onClick={handleValidateAndSaveToken}
            >
              Verify & Save Token
            </M3Button>

            <a
              href="https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo,notifications&description=Gitofy"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold px-2 py-1 rounded hover:underline"
              style={{ color: colors.primary }}
            >
              Generate Token ↗
            </a>
          </div>

          {statusMessage && (
            <p
              className="text-xs font-bold animate-fade-in"
              style={{ color: statusMessage.error ? colors.error : colors.diffAdded }}
            >
              {statusMessage.error ? '✕ ' : '✓ '}
              {statusMessage.text}
            </p>
          )}
        </div>

        {/* Theme Studio & Material 3 Palettes */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-4"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            Appearance & Tonal Palettes
          </span>

          {/* Theme Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Theme Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {(['dark', 'light', 'system'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateSettings({ themeMode: mode })}
                  className={`py-2 px-3 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                    settings.themeMode === mode ? 'ring-2' : ''
                  }`}
                  style={{
                    backgroundColor:
                      settings.themeMode === mode ? colors.primary : colors.surfaceContainerLowest,
                    color: settings.themeMode === mode ? colors.onPrimary : colors.onSurface,
                    borderColor: colors.outlineVariant,
                  }}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palettes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">M3 Accent Palette</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'emerald', label: 'Emerald' },
                { id: 'indigo', label: 'Indigo' },
                { id: 'violet', label: 'Violet' },
                { id: 'crimson', label: 'Crimson' },
                { id: 'cyan', label: 'Cyan' },
              ].map((pal) => (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => updateSettings({ palette: pal.id as any })}
                  className={`py-2 px-2.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                    settings.palette === pal.id ? 'ring-2' : ''
                  }`}
                  style={{
                    backgroundColor:
                      settings.palette === pal.id ? colors.primary : colors.surfaceContainerLowest,
                    color: settings.palette === pal.id ? colors.onPrimary : colors.onSurface,
                    borderColor: colors.outlineVariant,
                  }}
                >
                  {pal.label}
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
                  className={`py-2 px-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer capitalize ${
                    settings.uiDensity === density ? 'ring-2' : ''
                  }`}
                  style={{
                    backgroundColor:
                      settings.uiDensity === density ? colors.primary : colors.surfaceContainerLowest,
                    color: settings.uiDensity === density ? colors.onPrimary : colors.onSurface,
                    borderColor: colors.outlineVariant,
                  }}
                >
                  {density}
                </button>
              ))}
            </div>
          </div>

          {/* Corner Radius Slider */}
          <M3Slider
            label="Component Corner Radius"
            min={8}
            max={28}
            value={settings.cornerRadius}
            unit="dp"
            onChange={(val) => updateSettings({ cornerRadius: val })}
          />
        </div>

        {/* Git & Push Configurations */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3.5"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            Git & Push Defaults
          </span>

          {/* Default Branch */}
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

          {/* Default Visibility */}
          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Default New Repo Visibility</p>
              <p className="text-[10px] opacity-70">Initial privacy for newly created repos</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateSettings({ defaultVisibility: 'private' })}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  settings.defaultVisibility === 'private' ? 'ring-2' : ''
                }`}
                style={{
                  backgroundColor: settings.defaultVisibility === 'private' ? colors.primary : 'transparent',
                  color: settings.defaultVisibility === 'private' ? colors.onPrimary : colors.onSurface,
                  borderColor: colors.outlineVariant,
                }}
              >
                Private
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ defaultVisibility: 'public' })}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  settings.defaultVisibility === 'public' ? 'ring-2' : ''
                }`}
                style={{
                  backgroundColor: settings.defaultVisibility === 'public' ? colors.primary : 'transparent',
                  color: settings.defaultVisibility === 'public' ? colors.onPrimary : colors.onSurface,
                  borderColor: colors.outlineVariant,
                }}
              >
                Public
              </button>
            </div>
          </div>

          {/* Strip Root Folder */}
          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Strip Archive Root Folder</p>
              <p className="text-[10px] opacity-70">
                Flattens single top-level directory in ZIP archives automatically
              </p>
            </div>
            <M3Switch
              checked={settings.stripRootFolder}
              onChange={(val) => updateSettings({ stripRootFolder: val })}
            />
          </div>

          {/* Max Concurrent Uploads */}
          <M3Slider
            label="Max Concurrent Blob Uploads"
            min={1}
            max={8}
            step={1}
            value={settings.maxConcurrentUploads}
            unit=" files"
            onChange={(val) => updateSettings({ maxConcurrentUploads: val })}
          />
        </div>

        {/* Navigation & Motion Settings */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3.5"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            Navigation & Motion
          </span>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold">Auto-Hide Floating Nav</p>
              <p className="text-[10px] opacity-70">
                Hide capsule navigation on forward scroll; bring back on back-scroll
              </p>
            </div>
            <M3Switch
              checked={settings.autoHideNav}
              onChange={(val) => updateSettings({ autoHideNav: val })}
            />
          </div>

          <M3Slider
            label="Scroll Detection Threshold"
            min={12}
            max={48}
            value={settings.scrollThreshold}
            unit="dp"
            onChange={(val) => updateSettings({ scrollThreshold: val })}
          />

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Haptic Feedback</p>
              <p className="text-[10px] opacity-70">Tactile vibration on buttons, switches, and sliders</p>
            </div>
            <M3Switch
              checked={settings.haptics}
              onChange={(val) => updateSettings({ haptics: val })}
            />
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs font-bold">Reduce Motion</p>
              <p className="text-[10px] opacity-70">Disable springs and heavy transforms</p>
            </div>
            <M3Switch
              checked={settings.reduceMotion}
              onChange={(val) => updateSettings({ reduceMotion: val })}
            />
          </div>
        </div>

        {/* Developer & Design Verification Tools (F-81, F-82) */}
        <div
          className="p-5 rounded-3xl border flex flex-col gap-3"
          style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }}
            >
              M3
            </span>
            <span className="text-xs font-bold uppercase tracking-wider">Design & Motion Verification</span>
          </div>

          <p className="text-xs leading-relaxed opacity-80" style={{ color: colors.onSurfaceVariant }}>
            Test exact Material 3 components across all states and verify spring physics with live interactors.
          </p>

          <div className="flex flex-col gap-2 pt-1">
            <M3Button
              variant="tonal"
              shape="rounded"
              size="medium"
              className="w-full justify-between"
              onClick={onOpenGallery}
            >
              <span>M3 Component Gallery (F-81)</span>
              <span>→</span>
            </M3Button>

            <M3Button
              variant="tonal"
              shape="rounded"
              size="medium"
              className="w-full justify-between"
              onClick={onOpenMotionLab}
            >
              <span>Motion Lab (F-82)</span>
              <span>→</span>
            </M3Button>
          </div>
        </div>
      </div>
    </div>
  );
};
