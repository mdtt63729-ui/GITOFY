import React, { useState } from 'react';
import { useTheme } from '../ThemeContext';

export interface M3ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated' | 'destructive-filled' | 'destructive-tonal';
  shape?: 'capsule' | 'rounded' | 'square';
  size?: 'compact' | 'medium' | 'large';
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  loading?: boolean;
}

export const M3Button: React.FC<M3ButtonProps> = ({
  variant = 'filled',
  shape = 'capsule',
  size = 'medium',
  icon,
  trailingIcon,
  loading = false,
  children,
  className = '',
  disabled,
  onClick,
  ...rest
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [isPressed, setIsPressed] = useState(false);

  // Shape styles
  const shapeClass =
    shape === 'capsule'
      ? 'rounded-full'
      : shape === 'rounded'
      ? 'rounded-2xl'
      : 'rounded-lg';

  // Size styles
  const sizeStyles = {
    compact: 'h-8 px-3 text-xs gap-1.5',
    medium: 'h-10 px-5 text-sm font-medium gap-2',
    large: 'h-14 px-6 text-base font-semibold gap-3',
  }[size];

  // Variant color definitions based on M3 tokens
  let bg = colors.primary;
  let text = colors.onPrimary;
  let border = 'transparent';
  let shadow = 'none';

  switch (variant) {
    case 'tonal':
      bg = colors.secondaryContainer;
      text = colors.onSecondaryContainer;
      break;
    case 'elevated':
      bg = colors.surfaceContainerLow;
      text = colors.primary;
      shadow = '0 2px 4px rgba(0,0,0,0.12)';
      break;
    case 'outlined':
      bg = 'transparent';
      text = colors.primary;
      border = colors.outline;
      break;
    case 'text':
      bg = 'transparent';
      text = colors.primary;
      break;
    case 'destructive-filled':
      bg = colors.error;
      text = colors.onError;
      break;
    case 'destructive-tonal':
      bg = colors.errorContainer;
      text = colors.onErrorContainer;
      break;
    case 'filled':
    default:
      bg = colors.primary;
      text = colors.onPrimary;
      break;
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    if (settings.haptics) {
      triggerHaptic('tick');
    }
    onClick?.(e);
  };

  return (
    <button
      {...rest}
      disabled={disabled || loading}
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
        borderWidth: border !== 'transparent' ? '1px' : '0px',
        boxShadow: shadow,
        transform: isPressed && !disabled && !settings.reduceMotion ? 'scale(0.96)' : 'scale(1)',
        transition: 'transform 0.15s cubic-bezier(0.2, 0, 0, 1), background-color 0.2s ease, opacity 0.2s',
      }}
      className={`relative inline-flex items-center justify-center font-medium cursor-pointer overflow-hidden transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed select-none ${shapeClass} ${sizeStyles} ${className}`}
    >
      {/* State layer ripple effect */}
      <span
        className={`absolute inset-0 bg-current transition-opacity duration-150 pointer-events-none ${
          isPressed ? 'opacity-15' : 'hover:opacity-8 opacity-0'
        }`}
      />

      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading...</span>
        </span>
      ) : (
        <>
          {icon && <span className="flex-shrink-0 text-current">{icon}</span>}
          <span className="truncate">{children}</span>
          {trailingIcon && <span className="flex-shrink-0 text-current">{trailingIcon}</span>}
        </>
      )}
    </button>
  );
};
