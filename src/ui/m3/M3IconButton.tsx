import React, { useState } from 'react';
import { useTheme } from '../ThemeContext';

export interface M3IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'standard' | 'filled' | 'tonal' | 'outlined';
  selected?: boolean;
  size?: number; // default 40dp
}

export const M3IconButton: React.FC<M3IconButtonProps> = ({
  variant = 'standard',
  selected = false,
  size = 40,
  children,
  className = '',
  disabled,
  onClick,
  ...rest
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [isPressed, setIsPressed] = useState(false);

  let bg = 'transparent';
  let text = colors.onSurfaceVariant;
  let border = 'transparent';

  switch (variant) {
    case 'filled':
      bg = selected ? colors.primary : colors.surfaceContainerHighest;
      text = selected ? colors.onPrimary : colors.primary;
      break;
    case 'tonal':
      bg = selected ? colors.secondaryContainer : colors.surfaceContainerHighest;
      text = selected ? colors.onSecondaryContainer : colors.onSurfaceVariant;
      break;
    case 'outlined':
      bg = selected ? colors.inverseSurface : 'transparent';
      text = selected ? colors.inverseOnSurface : colors.onSurfaceVariant;
      border = colors.outline;
      break;
    case 'standard':
    default:
      bg = selected ? colors.surfaceContainerHighest : 'transparent';
      text = selected ? colors.primary : colors.onSurfaceVariant;
      break;
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (settings.haptics) triggerHaptic('tick');
    onClick?.(e);
  };

  return (
    <button
      {...rest}
      data-m3="icon-button"
      disabled={disabled}
      onClick={handleClick}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        backgroundColor: bg,
        color: text,
        borderColor: border,
        borderWidth: border !== 'transparent' ? 1 : 0,
        transform: isPressed && !disabled && !settings.reduceMotion ? 'scale(0.92)' : 'scale(1)',
        transition: 'transform 0.15s cubic-bezier(0.2, 0, 0, 1), background-color 0.2s ease',
      }}
      className={`relative inline-flex items-center justify-center rounded-full cursor-pointer overflow-hidden disabled:opacity-38 disabled:cursor-not-allowed select-none focus:outline-none ${className}`}
    >
      <span
        className={`absolute inset-0 bg-current rounded-full transition-opacity duration-150 pointer-events-none ${
          isPressed ? 'opacity-15' : 'hover:opacity-8 opacity-0'
        }`}
      />
      <span className="flex items-center justify-center pointer-events-none">{children}</span>
    </button>
  );
};
