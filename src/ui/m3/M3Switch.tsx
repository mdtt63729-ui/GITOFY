import React, { useState } from 'react';
import { useTheme } from '../ThemeContext';

export interface M3SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  showIcons?: boolean;
  className?: string;
  ariaLabel?: string;
}

export const M3Switch: React.FC<M3SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  showIcons = true,
  className = '',
  ariaLabel,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [isPressed, setIsPressed] = useState(false);

  const handleToggle = () => {
    if (disabled) return;
    triggerHaptic('tick');
    onChange(!checked);
  };

  // Dimensions: 52px width, 32px height
  // Unselected handle: 16px, Selected handle: 24px, Pressed: 28px
  const handleSize = isPressed ? 28 : checked ? 24 : 16;
  const handleOffset = checked
    ? isPressed
      ? 52 - 28 - 2 // 22px
      : 52 - 24 - 4 // 24px
    : isPressed
    ? 2
    : 6;

  const trackBg = checked ? colors.primary : colors.surfaceContainerHighest;
  const trackBorder = checked ? 'transparent' : colors.outline;
  const handleBg = checked ? colors.onPrimary : colors.outline;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleToggle}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      className={`relative inline-flex items-center flex-shrink-0 cursor-pointer select-none rounded-full transition-colors focus:outline-none ${
        disabled ? 'opacity-38 cursor-not-allowed' : ''
      } ${className}`}
      style={{
        width: 52,
        height: 32,
        backgroundColor: trackBg,
        borderWidth: checked ? 0 : 2,
        borderColor: trackBorder,
        borderStyle: 'solid',
        transition: 'background-color 0.2s cubic-bezier(0.2, 0, 0, 1), border-color 0.2s ease',
      }}
    >
      {/* Handle */}
      <span
        className="absolute rounded-full flex items-center justify-center shadow-sm"
        style={{
          width: handleSize,
          height: handleSize,
          left: handleOffset,
          backgroundColor: handleBg,
          transition: settings.reduceMotion
            ? 'left 0.15s ease'
            : 'left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.15s ease, height 0.15s ease',
        }}
      >
        {showIcons && (
          <span
            className="transition-opacity duration-150 flex items-center justify-center"
            style={{
              color: checked ? colors.primary : colors.surfaceContainerHighest,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {checked ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </span>
        )}
      </span>
    </button>
  );
};
