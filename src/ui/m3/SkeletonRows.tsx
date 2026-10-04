import React from 'react';

export interface SkeletonRowsProps {
  /** How many placeholder rows to draw. */
  count?: number;
  /** Height of each row in px. */
  height?: number;
  /** Extra classes for the wrapper (e.g. gap tweaks). */
  className?: string;
}

/**
 * Generic list skeleton used wherever a list of results is still loading.
 *
 * The sweep animation lives in `.gitofy-skeleton::after` and only animates
 * `transform`, so the compositor handles it and it never janks the scroll.
 */
export const SkeletonRows: React.FC<SkeletonRowsProps> = ({ count = 6, height = 56, className = '' }) => (
  <div className={`flex flex-col gap-2.5 ${className}`} aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="gitofy-skeleton" style={{ height }} />
    ))}
  </div>
);

export default SkeletonRows;
