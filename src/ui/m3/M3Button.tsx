import React from 'react';
import { useTheme } from '../ThemeContext';

export interface M3ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated' | 'destructive-filled' | 'destructive-tonal';
  shape?: 'capsule' | 'rounded' | 'square';
  size?: 'compact' | 'medium' | 'large';
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  loading?: boolean;
}

export const M3Button: React.FC<M3ButtonProps> = ({ variant='filled', size='medium', icon, trailingIcon, loading=false, children, className='', disabled, onClick, ...rest }) => {
  const { colors, triggerHaptic } = useTheme();
  const destructive = variant.startsWith('destructive');
  const actual = variant === 'destructive-filled' ? 'filled' : variant === 'destructive-tonal' ? 'tonal' : variant;
  const sizeClass = size === 'large' ? 'gitofy-m3-button-large' : size === 'compact' ? 'gitofy-m3-button-compact' : '';
  const cssVars = {
    '--md-sys-color-primary': destructive ? colors.error : colors.primary,
    '--md-sys-color-on-primary': destructive ? colors.onError : colors.onPrimary,
    '--md-sys-color-primary-container': destructive ? colors.errorContainer : colors.primaryContainer,
    '--md-sys-color-on-primary-container': destructive ? colors.onErrorContainer : colors.onPrimaryContainer,
  } as React.CSSProperties;
  const props = { disabled: disabled || loading, onClick: (e: React.MouseEvent<HTMLElement>) => { if (!disabled && !loading) { triggerHaptic('tick'); onClick?.(e as React.MouseEvent<HTMLButtonElement>); } }, style: cssVars, className: `gitofy-m3-button ${sizeClass} ${className}`, ...rest } as any;
  const content = <>{icon}<span>{loading ? 'Loading…' : children}</span>{trailingIcon}</>;
  if (actual === 'outlined') return <md-outlined-button {...props}>{content}</md-outlined-button>;
  if (actual === 'text') return <md-text-button {...props}>{content}</md-text-button>;
  if (actual === 'tonal') return <md-filled-tonal-button {...props}>{content}</md-filled-tonal-button>;
  if (actual === 'elevated') return <md-elevated-button {...props}>{content}</md-elevated-button>;
  return <md-filled-button {...props}>{content}</md-filled-button>;
};
