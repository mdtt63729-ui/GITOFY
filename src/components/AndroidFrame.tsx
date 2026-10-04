import React from 'react';
import { useTheme } from '../ui/ThemeContext';

export interface AndroidFrameProps {
  children: React.ReactNode;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({ children }) => {
  const { colors } = useTheme();

  return (
    <div
      className="w-full min-h-[100dvh] h-[100dvh] flex justify-center overflow-hidden"
      style={{
        backgroundColor: colors.surfaceContainerLowest,
      }}
    >
      {/* Full screen mobile container without fake bezels or fake status bars */}
      <main
        className="w-full sm:max-w-[480px] h-[100dvh] flex flex-col relative overflow-hidden select-none"
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
