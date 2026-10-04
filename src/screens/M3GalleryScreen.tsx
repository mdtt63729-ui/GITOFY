import React, { useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3Switch } from '../ui/m3/M3Switch';
import { M3Checkbox } from '../ui/m3/M3Checkbox';
import { M3Chip } from '../ui/m3/M3Chip';
import { M3CircularProgress } from '../ui/m3/M3CircularProgress';
import { M3LinearProgress } from '../ui/m3/M3LinearProgress';
import { M3TextField } from '../ui/m3/M3TextField';
import { M3Slider } from '../ui/m3/M3Slider';
import { M3Dialog } from '../ui/m3/M3Dialog';

export interface M3GalleryScreenProps {
  onBack: () => void;
}

export const M3GalleryScreen: React.FC<M3GalleryScreenProps> = ({ onBack }) => {
  const { colors, settings, updateSettings, triggerHaptic } = useTheme();

  // Component demo state
  const [switchState1, setSwitchState1] = useState(true);
  const [switchState2, setSwitchState2] = useState(false);
  const [check1, setCheck1] = useState(true);
  const [check2, setCheck2] = useState(false);
  const [sliderVal, setSliderVal] = useState(64);
  const [selectedChip, setSelectedChip] = useState('android');
  const [textInput, setTextInput] = useState('Gitofy Ultra-Fast');
  const [showDemoDialog, setShowDemoDialog] = useState(false);

  return (
    <div
      className="flex-1 flex flex-col overflow-y-auto overscroll-contain select-none"
      style={{ backgroundColor: colors.surface, color: colors.onSurface }}
    >
      {/* Top App Bar */}
      <div
        className="sticky top-0 z-30 px-4 py-3 border-b flex items-center justify-between backdrop-blur-md"
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
          <div>
            <h1 className="text-base font-bold">M3 Component Gallery</h1>
            <p className="text-[10px] font-mono opacity-70">Design System Verification (F-81)</p>
          </div>
        </div>

        {/* Theme mode quick toggle */}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tick');
            updateSettings({ themeMode: settings.themeMode === 'dark' ? 'light' : 'dark' });
          }}
          className="px-2.5 py-1 rounded-full text-xs font-mono font-bold border cursor-pointer"
          style={{
            backgroundColor: colors.surfaceContainerHighest,
            borderColor: colors.outlineVariant,
            color: colors.primary,
          }}
        >
          {settings.themeMode === 'dark' ? 'Dark' : 'Light'}
        </button>
      </div>

      <div className="p-5 flex flex-col gap-6 pb-28">
        {/* Palette Switcher */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold font-mono uppercase opacity-70">Material 3 Color Palettes</h2>
          <div className="flex flex-wrap gap-2">
            {(['pink', 'emerald', 'indigo', 'violet', 'crimson', 'cyan'] as const).map((pal) => (
              <button
                key={pal}
                type="button"
                onClick={() => {
                  triggerHaptic('tick');
                  updateSettings({ palette: pal });
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize border cursor-pointer transition-all ${
                  settings.palette === pal ? 'ring-2 ring-offset-1 font-bold' : 'opacity-70'
                }`}
                style={{
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                  color: settings.palette === pal ? colors.primary : colors.onSurface,
                }}
              >
                {pal} {pal === 'pink' ? '(Default)' : ''}
              </button>
            ))}
          </div>
        </section>

        {/* Buttons Section (§৫.২) */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold font-mono uppercase opacity-70">M3 Buttons (§৫.২)</h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <M3Button variant="filled">Filled Button</M3Button>
            <M3Button variant="tonal">Filled Tonal</M3Button>
            <M3Button variant="elevated">Elevated</M3Button>
            <M3Button variant="outlined">Outlined</M3Button>
            <M3Button variant="text">Text Button</M3Button>
            <M3Button variant="destructive-filled">Destructive</M3Button>
            <M3Button variant="filled" loading={true}>Loading</M3Button>
            <M3Button variant="filled" disabled={true}>Disabled</M3Button>
          </div>
        </section>

        {/* Icon Buttons (§৫.৩) */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold font-mono uppercase opacity-70">M3 Icon Buttons (§৫.৩)</h2>
          <div className="flex items-center gap-3">
            <M3IconButton aria-label="Standard icon button">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </M3IconButton>

            <M3IconButton variant="filled" aria-label="Filled icon button">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </M3IconButton>

            <M3IconButton variant="tonal" aria-label="Tonal icon button">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </M3IconButton>

            <M3IconButton variant="outlined" aria-label="Outlined icon button">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </M3IconButton>
          </div>
        </section>

        {/* Switches (§৫.১) */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold font-mono uppercase opacity-70">M3 Switches (§৫.১)</h2>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <M3Switch checked={switchState1} onChange={setSwitchState1} />
              <span className="text-xs font-mono">{switchState1 ? 'Selected (ON)' : 'Unselected'}</span>
            </div>
            <div className="flex items-center gap-3">
              <M3Switch checked={switchState2} onChange={setSwitchState2} />
              <span className="text-xs font-mono">{switchState2 ? 'Selected' : 'Unselected (OFF)'}</span>
            </div>
            <div className="flex items-center gap-2 opacity-50">
              <M3Switch checked={false} onChange={() => {}} disabled />
              <span className="text-[11px] font-mono">Disabled</span>
            </div>
          </div>
        </section>

        {/* Checkboxes & Radios (§৫.৫) */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold font-mono uppercase opacity-70">Checkboxes & Radios (§৫.৫)</h2>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <M3Checkbox checked={check1} onChange={setCheck1} label="Strip Root Folder" />
            </div>
            <div className="flex items-center gap-2">
              <M3Checkbox checked={check2} onChange={setCheck2} label="Auto-Trigger CI" />
            </div>
          </div>
        </section>

        {/* Chips (§৫.৫) */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold font-mono uppercase opacity-70">M3 Filter Chips (§৫.৫)</h2>
          <div className="flex flex-wrap gap-2">
            {['android', 'kotlin', 'github-actions', 'git-smart-http', 'zero-flash'].map((chip) => (
              <M3Chip
                key={chip}
                label={chip}
                selected={selectedChip === chip}
                onClick={() => setSelectedChip(chip)}
              />
            ))}
          </div>
        </section>

        {/* Progress Indicators (§৪.৫) */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold font-mono uppercase opacity-70">Progress Indicators (Circular & Linear)</h2>
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-1.5">
              <M3CircularProgress determinate value={68} size={48} strokeWidth={4.5} />
              <span className="text-[10px] font-mono">Determinate 68%</span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <M3CircularProgress size={48} strokeWidth={4.5} />
              <span className="text-[10px] font-mono">Indeterminate Arc</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <span className="text-[10px] font-mono opacity-80">Linear Progress: 64%</span>
            <M3LinearProgress determinate value={64} height={5} />
          </div>
        </section>

        {/* Slider (§৫.৫) */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold font-mono uppercase opacity-70">M3 Slider</h2>
            <span className="text-xs font-mono font-bold" style={{ color: colors.primary }}>
              {sliderVal}%
            </span>
          </div>
          <M3Slider value={sliderVal} onChange={setSliderVal} min={0} max={100} />
        </section>

        {/* Text Field (§৫.৫) */}
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold font-mono uppercase opacity-70">M3 Outlined Text Field</h2>
          <M3TextField
            label="Commit Message / Repository Title"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
          />
        </section>

        {/* Dialog Demo */}
        <section className="flex flex-col gap-2 pt-2">
          <M3Button variant="tonal" onClick={() => setShowDemoDialog(true)}>
            Open Material 3 Confirmation Dialog
          </M3Button>
        </section>
      </div>

      <M3Dialog
        isOpen={showDemoDialog}
        onClose={() => setShowDemoDialog(false)}
        title="Discard changes?"
        description="Your pending changes will be lost. This action is confirmed according to Material 3 dialog specifications."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        isDestructive={true}
        onConfirm={() => setShowDemoDialog(false)}
      />
    </div>
  );
};
