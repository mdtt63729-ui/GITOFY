import React from 'react';
import { useTheme } from '../ThemeContext';

export interface M3CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export const M3Checkbox: React.FC<M3CheckboxProps> = ({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  label,
  className = '',
}) => {
  const { colors, triggerHaptic } = useTheme();

  const handleToggle = () => {
    if (disabled) return;
    triggerHaptic('tick');
    onChange(!checked);
  };

  const isChecked = checked || indeterminate;

  return (
    <label
      onClick={handleToggle}
      className={`inline-flex items-center gap-3 cursor-pointer select-none py-1.5 ${
        disabled ? 'opacity-38 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div
        className="relative flex items-center justify-center rounded transition-all duration-150"
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          backgroundColor: isChecked ? colors.primary : 'transparent',
          borderWidth: isChecked ? 0 : 2,
          borderColor: isChecked ? 'transparent' : colors.outline,
          borderStyle: 'solid',
        }}
      >
        {indeterminate ? (
          <span
            className="w-2.5 h-0.5 rounded-full"
            style={{ backgroundColor: colors.onPrimary }}
          />
        ) : checked ? (
          <svg
            className="w-3.5 h-3.5 transition-transform"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.onPrimary}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </div>
      {label && <span className="text-sm font-medium leading-none">{label}</span>}
    </label>
  );
};
