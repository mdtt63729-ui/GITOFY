import React, { useState } from 'react';
import { useTheme } from '../ThemeContext';

export interface M3ChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  showCheckmark?: boolean;
  /** When false the selected chip draws no own background, so a parent can show an
   *  animated sliding indicator behind it (used by the Home filter chips). */
  showSelectedBackground?: boolean;
  className?: string;
  count?: number;
}

export const M3Chip: React.FC<M3ChipProps> = ({
  label,
  selected = false,
  onClick,
  icon,
  showCheckmark = true,
  showSelectedBackground = true,
  className = '',
  count,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [isPressed, setIsPressed] = useState(false);

  const handleClick = () => {
    if (settings.haptics) triggerHaptic('tick');
    onClick?.();
  };

  const bg = selected && showSelectedBackground ? colors.secondaryContainer : 'transparent';
  const text = selected ? colors.onSecondaryContainer : colors.onSurfaceVariant;
  const border = selected ? 'transparent' : colors.outlineVariant;

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      style={{
        backgroundColor: bg,
        color: text,
        borderColor: border,
        borderWidth: selected ? 0 : 1,
        borderStyle: 'solid',
        transform: isPressed && !settings.reduceMotion ? 'scale(0.94)' : 'scale(1)',
        transition: 'transform 0.18s cubic-bezier(.34,1.56,.64,1), background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease',
      }}
      className={`h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none whitespace-nowrap focus:outline-none ${className}`}
    >
      {selected && showCheckmark ? (
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 animate-scale-in"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : icon ? (
        <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">{icon}</span>
      ) : null}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className="ml-1 px-1.5 py-0.2 rounded-full text-[10px]"
          style={{
            backgroundColor: selected ? colors.primary : colors.surfaceContainerHighest,
            color: selected ? colors.onPrimary : colors.onSurfaceVariant,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
};
