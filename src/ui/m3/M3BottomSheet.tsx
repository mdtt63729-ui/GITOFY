import React, { useEffect, useState } from 'react';
import { useTheme } from '../ThemeContext';

export interface M3BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxHeight?: string;
}

export const M3BottomSheet: React.FC<M3BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = '85vh',
}) => {
  const { colors, settings, triggerHaptic } = useTheme();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Keep the sheet mounted while it slides out, so open AND close are smooth.
  const [render, setRender] = useState(isOpen);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
      setClosing(false);
      return;
    }
    if (!render) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setRender(false);
      setClosing(false);
    }, 230);
    return () => window.clearTimeout(t);
  }, [isOpen, render]);

  if (!render) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop Scrim */}
      <div
        onClick={() => {
          if (settings.haptics) triggerHaptic('tick');
          onClose();
        }}
        className={`absolute inset-0 bg-black/50 ${closing ? 'scrim-out' : 'scrim-in'}`}
      />

      {/* Sheet Modal */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden ${closing ? 'sheet-out' : 'animate-slide-up'}`}
        style={{
          backgroundColor: colors.surfaceContainerLow,
          color: colors.onSurface,
          maxHeight,
          borderTop: `1px solid ${colors.outlineVariant}`,
        }}
      >
        {/* Drag handle */}
        <div className="w-full flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
          <div
            className="w-10 h-1 rounded-full opacity-60"
            style={{ backgroundColor: colors.outline }}
          />
        </div>

        {/* Header */}
        {(title || subtitle) && (
          <div className="px-6 py-2 border-b" style={{ borderColor: colors.outlineVariant }}>
            {title && <h2 className="text-xl font-bold tracking-tight">{title}</h2>}
            {subtitle && (
              <p className="text-xs mt-0.5" style={{ color: colors.onSurfaceVariant }}>
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Scrollable Content */}
        <div className="p-6 gitofy-scroll flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};
