import React, { useState, useId } from 'react';
import { useTheme } from '../ThemeContext';

export interface M3TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  supportingText?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  validating?: boolean;
  isValid?: boolean | null;
}

export const M3TextField: React.FC<M3TextFieldProps> = ({
  label,
  value,
  error,
  supportingText,
  leadingIcon,
  trailingIcon,
  validating = false,
  isValid = null,
  disabled,
  placeholder,
  className = '',
  onChange,
  onFocus,
  onBlur,
  ...rest
}) => {
  const { colors, settings } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const inputId = useId();

  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const isFloating = isFocused || hasValue;

  const borderColor = error
    ? colors.error
    : isFocused
    ? colors.primary
    : colors.outlineVariant;

  return (
    <div className={`relative flex flex-col mb-3 ${disabled ? 'opacity-38' : ''} ${className}`}>
      <div
        className={`relative flex items-center h-14 rounded-2xl px-4 transition-all duration-150 ${
          error && !settings.reduceMotion ? 'animate-shake' : ''
        }`}
        style={{
          borderWidth: isFocused || error ? 2 : 1,
          borderColor,
          borderStyle: 'solid',
          backgroundColor: colors.surfaceContainerLowest,
        }}
      >
        {leadingIcon && (
          <span
            className="mr-3 flex-shrink-0"
            style={{ color: error ? colors.error : isFocused ? colors.primary : colors.onSurfaceVariant }}
          >
            {leadingIcon}
          </span>
        )}

        <div className="relative flex-1 h-full flex flex-col justify-center overflow-hidden">
          {/* Label: Floating top-1.5 when focused/has value, or center when empty */}
          <label
            htmlFor={inputId}
            className="absolute pointer-events-none transition-all duration-150 select-none truncate max-w-full"
            style={{
              left: 0,
              top: isFloating ? '7px' : '50%',
              transform: isFloating ? 'translateY(0)' : 'translateY(-50%)',
              fontSize: isFloating ? '11px' : '14px',
              fontWeight: isFloating ? 600 : 500,
              color: error ? colors.error : isFocused ? colors.primary : colors.onSurfaceVariant,
            }}
          >
            {label}
          </label>

          {/* Input field: placeholder ONLY appears when floating/focused to avoid double-text overlay */}
          <input
            {...rest}
            id={inputId}
            value={value}
            disabled={disabled}
            placeholder={isFloating ? placeholder : undefined}
            onChange={onChange}
            onFocus={(e) => {
              setIsFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              onBlur?.(e);
            }}
            className="w-full bg-transparent border-none outline-none text-sm font-medium pt-4 pb-0"
            style={{
              color: colors.onSurface,
            }}
          />
        </div>

        {/* Validation / Trailing icons */}
        <div className="flex items-center ml-2 gap-1.5 flex-shrink-0">
          {validating ? (
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              style={{ color: colors.primary }}
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : isValid === true ? (
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.diffAdded}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : isValid === false || error ? (
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.error}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : trailingIcon ? (
            <span style={{ color: colors.onSurfaceVariant }}>{trailingIcon}</span>
          ) : null}
        </div>
      </div>

      {(error || supportingText) && (
        <span
          className="text-xs px-3 pt-1 transition-opacity duration-150 font-normal"
          style={{ color: error ? colors.error : colors.onSurfaceVariant }}
        >
          {error || supportingText}
        </span>
      )}
    </div>
  );
};
