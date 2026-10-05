import React from 'react';
import { useTheme } from '../ui/ThemeContext';

export interface AndroidFrameProps {
  children: React.ReactNode;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({ children }) => {
  const { colors, settings } = useTheme();
  // In NXT mode the frame is transparent so the app-wide lavender gradient
  // (set on <body>) shows through, exactly like the reference design.
  // NXT was removed — the frame is always the M3 surface.

  return (
    <div
      className="w-full min-h-[100dvh] h-[100dvh] flex justify-center overflow-hidden"
      style={{
        backgroundColor: colors.surfaceContainerLowest,
      }}
    >
      {/* Full screen mobile container without fake bezels or fake status bars */}
      <main
        className="w-full sm:max-w-[480px] h-[100dvh] min-h-0 flex flex-col relative overflow-hidden select-none"
        style={{
          backgroundColor: colors.background,
          color: colors.onBackground,
        }}
      >
        {children}
      </main>
    </div>
  );
};
