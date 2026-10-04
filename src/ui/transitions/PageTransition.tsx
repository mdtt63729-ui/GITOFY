import React, { useEffect, useState } from 'react';
import { useTheme } from '../ThemeContext';

export interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  viewKey?: string;
}

export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  className = '',
  viewKey,
}) => {
  const { colors, settings } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Immediate frame mount to trigger CSS transition without blank flash
    const timer = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(timer);
  }, [viewKey]);

  return (
    <div
      key={viewKey}
      className={`relative w-full h-full flex-1 flex flex-col overflow-hidden transition-all ${className}`}
      style={{
        backgroundColor: colors.surface,
        opacity: 1,
        transform: settings.reduceMotion
          ? 'none'
          : mounted
          ? 'translateY(0) scale(1)'
          : 'translateY(2px) scale(0.998)',
        transitionProperty: 'opacity, transform',
        transitionDuration: '240ms',
        transitionTimingFunction: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
};
