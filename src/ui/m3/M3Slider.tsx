import React from 'react';
import { useTheme } from '../ThemeContext';

export interface M3SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
  className?: string;
}

export const M3Slider: React.FC<M3SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  className = '',
}) => {
  const { colors, triggerHaptic } = useTheme();

  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = Number(e.target.value);
    triggerHaptic('tick');
    onChange(newVal);
  };

  return (
    <div className={`flex flex-col gap-1.5 py-2 ${className}`}>
      <div className="flex items-center justify-between text-xs font-medium">
        <span style={{ color: colors.onSurface }}>{label}</span>
        <span className="font-mono font-semibold" style={{ color: colors.primary }}>
          {value}
          {unit}
        </span>
      </div>

      <div className="relative flex items-center h-8">
        {/* Track background */}
        <div
          className="absolute left-0 right-0 h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: colors.surfaceContainerHighest }}
        >
          {/* Active track */}
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${percentage}%`,
              backgroundColor: colors.primary,
            }}
          />
        </div>

        {/* Real HTML Range Input with custom appearance */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full z-10"
        />

        {/* M3 Thumb indicator */}
        <div
          className="absolute w-5 h-5 rounded-full shadow-md pointer-events-none transition-transform active:scale-125"
          style={{
            left: `calc(${percentage}% - 10px)`,
            backgroundColor: colors.primary,
            border: `2px solid ${colors.surface}`,
          }}
        />
      </div>
    </div>
  );
};
