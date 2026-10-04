import React from 'react';
import { useTheme } from '../ThemeContext';

export interface M3SkeletonProps {
  type?: 'card' | 'line' | 'circle';
  count?: number;
}

export const M3Skeleton: React.FC<M3SkeletonProps> = ({ type = 'card', count = 1 }) => {
  const { colors } = useTheme();

  const shimmerBase = colors.surfaceContainer;
  const shimmerHighlight = colors.surfaceContainerHigh;

  if (type === 'circle') {
    return (
      <div
        className="w-10 h-10 rounded-full animate-pulse"
        style={{ backgroundColor: shimmerBase }}
      />
    );
  }

  if (type === 'line') {
    return (
      <div
        className="h-4 w-full rounded animate-pulse"
        style={{ backgroundColor: shimmerBase }}
      />
    );
  }

  // Repository card skeleton matching real card dimensions exactly
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-4 rounded-2xl border flex flex-col gap-2.5 relative overflow-hidden"
          style={{
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.outlineVariant,
          }}
        >
          {/* Shimmer sweep effect */}
          <div
            className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] pointer-events-none"
            style={{
              background: `linear-gradient(90deg, transparent, ${shimmerHighlight}, transparent)`,
            }}
          />

          {/* Row 1: Avatar + Title + Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex-shrink-0"
                style={{ backgroundColor: shimmerBase }}
              />
              <div className="flex flex-col gap-1.5">
                <div
                  className="h-4 w-32 rounded"
                  style={{ backgroundColor: shimmerBase }}
                />
                <div
                  className="h-3 w-20 rounded"
                  style={{ backgroundColor: shimmerBase }}
                />
              </div>
            </div>
            <div
              className="w-6 h-6 rounded-full"
              style={{ backgroundColor: shimmerBase }}
            />
          </div>

          {/* Row 2: Description */}
          <div
            className="h-3.5 w-11/12 rounded"
            style={{ backgroundColor: shimmerBase }}
          />

          {/* Row 3: Tags / Metadata chips */}
          <div className="flex items-center gap-3 pt-1">
            <div
              className="h-5 w-16 rounded-full"
              style={{ backgroundColor: shimmerBase }}
            />
            <div
              className="h-5 w-12 rounded-full"
              style={{ backgroundColor: shimmerBase }}
            />
            <div
              className="h-5 w-20 rounded-full"
              style={{ backgroundColor: shimmerBase }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
