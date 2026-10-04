import React, { useEffect, useState } from 'react';
import { useTheme } from '../ThemeContext';
import { M3Button } from './M3Button';
import { M3TextField } from './M3TextField';

export interface M3DialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmWord?: string; // If provided, user must type this exact string to confirm
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  onClose?: () => void;
}

export const M3Dialog: React.FC<M3DialogProps> = ({
  isOpen,
  title,
  description,
  confirmWord,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
  onClose,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [typedInput, setTypedInput] = useState('');

  // Keep the dialog mounted briefly while it animates out, so opening AND
  // closing are both smooth (it used to vanish instantly on close).
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
    }, 210);
    return () => window.clearTimeout(t);
  }, [isOpen, render]);

  if (!render) return null;

  const handleDismiss = () => {
    triggerHaptic('tick');
    if (onCancel) onCancel();
    else if (onClose) onClose();
    setTypedInput('');
  };

  const requiresMatch = Boolean(confirmWord && confirmWord.trim().length > 0);
  const isMatch = !requiresMatch || typedInput.trim() === confirmWord?.trim();

  const handleConfirm = () => {
    if (!isMatch) return;
    if (isDestructive) {
      triggerHaptic('heavy');
    } else {
      triggerHaptic('click');
    }
    onConfirm();
    setTypedInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Scrim */}
      <div
        onClick={handleDismiss}
        className={`absolute inset-0 bg-black/55 ${closing ? 'scrim-out' : 'scrim-in'}`}
      />

      {/* Modal Dialog Card */}
      <div
        role="alertdialog"
        aria-modal="true"
        className={`relative w-full max-w-sm rounded-[28px] p-6 shadow-2xl flex flex-col gap-4 z-10 ${closing ? 'dialog-out' : 'dialog-in'}`}
        style={{
          backgroundColor: colors.surfaceContainerHigh,
          color: colors.onSurface,
          border: `1px solid ${colors.outlineVariant}`,
        }}
      >
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xl font-bold leading-tight">{title}</h3>
          <p className="text-sm leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
            {description}
          </p>
        </div>

        {requiresMatch && (
          <div className="flex flex-col gap-1 my-1">
            <span className="text-xs font-semibold" style={{ color: colors.onSurfaceVariant }}>
              Type <span className="font-mono underline text-error font-bold">{confirmWord}</span> to confirm:
            </span>
            <M3TextField
              label="Repository name"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder={confirmWord}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <M3Button variant="text" onClick={handleDismiss}>
            {cancelLabel}
          </M3Button>
          <M3Button
            variant={isDestructive ? 'destructive-filled' : 'filled'}
            disabled={!isMatch}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </M3Button>
        </div>
      </div>
    </div>
  );
};
