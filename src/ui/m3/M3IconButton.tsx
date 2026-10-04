import React from 'react';
import { useTheme } from '../ThemeContext';
export interface M3IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'standard'|'filled'|'tonal'|'outlined'; selected?: boolean; size?: number; }
export const M3IconButton: React.FC<M3IconButtonProps> = ({variant='standard', selected=false, size=40, children, className='', disabled, onClick, ...rest}) => {
 const {colors, triggerHaptic}=useTheme();
 const props={...rest, disabled, 'aria-pressed':selected, onClick:(e:any)=>{triggerHaptic('tick');onClick?.(e)}, style:{'--md-sys-color-primary':colors.primary,'--md-sys-color-on-primary':colors.onPrimary,'--md-sys-color-surface-container-high':colors.surfaceContainerHighest,width:size,height:size} as React.CSSProperties,className:`gitofy-m3-icon-button ${className}`} as any;
 return <md-icon-button {...props}>{children}</md-icon-button>;
};
