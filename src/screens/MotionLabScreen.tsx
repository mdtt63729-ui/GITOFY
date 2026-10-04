import React, { useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3Button } from '../ui/m3/M3Button';
import { M3Switch } from '../ui/m3/M3Switch';

export interface MotionLabScreenProps {
  onBack: () => void;
}

export const MotionLabScreen: React.FC<MotionLabScreenProps> = ({ onBack }) => {
  const { colors, settings, updateSettings, triggerHaptic } = useTheme();

  const [activeSpring, setActiveSpring] = useState<'bounce.fab' | 'bounce.nav' | 'menu.open' | 'spatial.fast'>('bounce.fab');
  const [slowMotion, setSlowMotion] = useState(false);
  const [animTrigger, setAnimTrigger] = useState(0);

  const runAnimation = (spring: typeof activeSpring) => {
    triggerHaptic('tick');
    setActiveSpring(spring);
    setAnimTrigger((prev) => prev + 1);
  };

  const springConfigs = {
    'bounce.fab': {
      stiffness: 320,
      damping: 18,
      overshoot: '~16%',
      useCase: 'FAB entrance sliding from right edge with subtle overshoot and settle',
      cssTiming: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
      durationMs: slowMotion ? 1200 : 340,
    },
    'bounce.nav': {
      stiffness: 380,
      damping: 21,
      overshoot: '~12.6%',
      useCase: 'Floating Nav capsule returning from bottom, rising slightly above baseline then settling',
      cssTiming: 'cubic-bezier(0.34, 1.35, 0.64, 1)',
      durationMs: slowMotion ? 1300 : 360,
    },
    'menu.open': {
      stiffness: 500,
      damping: 31,
      overshoot: '~4.6%',
      useCase: 'Staggered FAB pill unfolding and rising smoothly from above master FAB',
      cssTiming: 'cubic-bezier(0.34, 1.3, 0.64, 1)',
      durationMs: slowMotion ? 1100 : 300,
    },
    'spatial.fast': {
      stiffness: 1400,
      damping: 67,
      overshoot: '<0.2%',
      useCase: 'Fast tactile switch thumb snap, chip expansion, micro-interactions',
      cssTiming: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
      durationMs: slowMotion ? 750 : 200,
    },
  };

  const currentConfig = springConfigs[activeSpring];

  return (
    <div
      className="flex-1 flex flex-col overflow-y-auto overscroll-contain select-none"
      style={{ backgroundColor: colors.surface, color: colors.onSurface }}
    >
      {/* Top Bar */}
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
            <h1 className="text-base font-bold">Motion Lab</h1>
            <p className="text-[10px] font-mono opacity-70">Interactive Spring Physics Tester (F-82)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono">0.25x Speed</span>
          <M3Switch checked={slowMotion} onChange={setSlowMotion} />
        </div>
      </div>

      <div className="p-5 flex flex-col gap-6 pb-28">
        {/* Interactive Play Arena */}
        <section
          className="w-full h-56 rounded-3xl border flex flex-col items-center justify-center p-4 relative overflow-hidden"
          style={{
            backgroundColor: colors.surfaceContainerLow,
            borderColor: colors.outlineVariant,
          }}
        >
          <span className="absolute top-3 left-4 text-[10px] font-mono opacity-60">
            SPRING PLAYGROUND • {activeSpring}
          </span>

          {/* Test Animated Element */}
          <div
            key={animTrigger}
            className="flex items-center justify-center px-6 py-3.5 rounded-full shadow-xl border cursor-pointer select-none"
            style={{
              backgroundColor: colors.primary,
              color: colors.onPrimary,
              borderColor: colors.outlineVariant,
              transform: animTrigger % 2 === 1 ? 'scale(1.15) translateY(-8px)' : 'scale(1) translateY(0)',
              transitionProperty: 'transform, opacity',
              transitionDuration: `${currentConfig.durationMs}ms`,
              transitionTimingFunction: currentConfig.cssTiming,
              willChange: 'transform',
            }}
          >
            <span className="text-sm font-bold font-mono tracking-wide">
              {activeSpring}
            </span>
          </div>

          <div className="absolute bottom-3 text-center">
            <span className="text-[11px] font-mono opacity-70">
              Duration: {currentConfig.durationMs}ms • Overshoot: {currentConfig.overshoot}
            </span>
          </div>
        </section>

        {/* Spring Token Triggers */}
        <section className="flex flex-col gap-2.5">
          <h2 className="text-xs font-bold font-mono uppercase opacity-70">Select Spring to Test</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {(['bounce.fab', 'bounce.nav', 'menu.open', 'spatial.fast'] as const).map((spring) => (
              <M3Button
                key={spring}
                variant={activeSpring === spring ? 'filled' : 'tonal'}
                onClick={() => runAnimation(spring)}
              >
                {spring}
              </M3Button>
            ))}
          </div>
        </section>

        {/* Physics Specs Card */}
        <section
          className="p-4 rounded-3xl border flex flex-col gap-2.5"
          style={{
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.outlineVariant,
          }}
        >
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: colors.primary }}>
            {activeSpring} Specifications
          </h3>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <span className="opacity-60 text-[10px]">STIFFNESS:</span>
              <p className="font-bold">{currentConfig.stiffness}</p>
            </div>
            <div>
              <span className="opacity-60 text-[10px]">DAMPING:</span>
              <p className="font-bold">{currentConfig.damping}</p>
            </div>
            <div>
              <span className="opacity-60 text-[10px]">OVERSHOOT:</span>
              <p className="font-bold">{currentConfig.overshoot}</p>
            </div>
            <div>
              <span className="opacity-60 text-[10px]">BEZIER EQUIVALENT:</span>
              <p className="font-bold truncate text-[11px]">{currentConfig.cssTiming}</p>
            </div>
          </div>

          <p className="text-xs opacity-75 mt-1 leading-relaxed border-t pt-2" style={{ borderColor: colors.outlineVariant }}>
            <strong>Use Case:</strong> {currentConfig.useCase}
          </p>
        </section>

        {/* Reduce Motion Global Toggle */}
        <section
          className="p-4 rounded-3xl border flex items-center justify-between"
          style={{
            backgroundColor: colors.surfaceContainerLow,
            borderColor: colors.outlineVariant,
          }}
        >
          <div>
            <h4 className="text-xs font-bold">Reduce Motion Mode</h4>
            <p className="text-[10px] opacity-70">Disables bouncy springs in favor of simple 150ms fades</p>
          </div>
          <M3Switch
            checked={settings.reduceMotion}
            onChange={(checked) => updateSettings({ reduceMotion: checked })}
          />
        </section>
      </div>
    </div>
  );
};
