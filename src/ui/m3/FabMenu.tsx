import React, { useState, useEffect } from 'react';
import { useTheme } from '../ThemeContext';

export interface FabMenuProps {
  visible?: boolean;
  onCreateRepo: () => void;
  onDeleteRepo: () => void;
  onUpdateRepo: () => void;
  onUploadProject: () => void;
}

export const FabMenu: React.FC<FabMenuProps> = ({
  visible = true,
  onCreateRepo,
  onDeleteRepo,
  onUpdateRepo,
  onUploadProject,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  // Close menu if FAB becomes hidden via scroll
  useEffect(() => {
    if (!visible && isOpen) {
      setIsOpen(false);
    }
  }, [visible]);

  const toggleOpen = () => {
    triggerHaptic('click');
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  const handleAction = (action: () => void) => {
    triggerHaptic('tick');
    closeMenu();
    // Allow closing animation to begin before invoking action
    setTimeout(() => {
      action();
    }, 140);
  };

  // Section 5.4 Exact Pill Menu Items (Single 56dp Pill containing Icon + Label)
  // Ordered from closest to FAB (index 0) to furthest (index 3)
  const menuItems = [
    {
      id: 'upload',
      label: 'Upload project',
      icon: (
        <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      ),
      bg: colors.tertiaryContainer,
      text: colors.onTertiaryContainer,
      action: onUploadProject,
    },
    {
      id: 'update',
      label: 'Update repo',
      icon: (
        <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
      ),
      bg: colors.secondaryContainer,
      text: colors.onSecondaryContainer,
      action: onUpdateRepo,
    },
    {
      id: 'create',
      label: 'Create repo',
      icon: (
        <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      ),
      bg: colors.primaryContainer,
      text: colors.onPrimaryContainer,
      action: onCreateRepo,
    },
    {
      id: 'delete',
      label: 'Delete repo',
      icon: (
        <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      ),
      bg: colors.errorContainer,
      text: colors.onErrorContainer,
      action: onDeleteRepo,
    },
  ];

  return (
    <>
      {/* Backdrop Scrim with smooth opacity fade */}
      <div
        onClick={closeMenu}
        className={`fixed inset-0 z-40 transition-opacity select-none ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.38)',
          transitionDuration: isOpen ? '280ms' : '180ms',
        }}
      />

      {/* FAB and Items Container anchored at bottom right */}
      <div
        className={`fixed right-4 z-50 flex flex-col items-end transition-all ${
          visible || isOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-24 opacity-0 pointer-events-none'
        }`}
        style={{
          bottom: '92px',
          transitionDuration: visible || isOpen ? '340ms' : '200ms',
          // bounce.fab spring: entering with overshoot, exiting with clean acceleration
          transitionTimingFunction: visible || isOpen
            ? 'cubic-bezier(0.34, 1.45, 0.64, 1)'
            : 'cubic-bezier(0.4, 0, 1, 1)',
        }}
      >
        {/* Menu Items Stack (Section 5.4 & 6.2) */}
        <div
          className={`flex flex-col-reverse items-end gap-2.5 mb-3 pointer-events-none ${
            isOpen ? 'pointer-events-auto' : ''
          }`}
        >
          {menuItems.map((item, index) => {
            // Stagger calculation: index 0 (closest) opens first; when closing, furthest (index 3) closes first!
            const delayOpen = index * 35; // ms
            const delayClose = (menuItems.length - 1 - index) * 25; // ms
            const delay = isOpen ? delayOpen : delayClose;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleAction(item.action)}
                className="group relative flex items-center justify-end h-14 pl-4 pr-5 rounded-full shadow-lg border select-none cursor-pointer focus:outline-none transition-all active:scale-96"
                style={{
                  backgroundColor: item.bg,
                  color: item.text,
                  borderColor: colors.outlineVariant,
                  minWidth: '56px',
                  // Exact Section 6.2 motion: rise from above FAB, scale 0.6 -> 1, opacity 0 -> 1
                  opacity: isOpen ? 1 : 0,
                  transform: isOpen
                    ? 'translateY(0) scale(1)'
                    : `translateY(${(index + 1) * 36}px) scale(0.65)`,
                  transitionDuration: isOpen ? '300ms' : '180ms',
                  transitionDelay: settings.reduceMotion ? '0ms' : `${delay}ms`,
                  transitionTimingFunction: isOpen
                    ? 'cubic-bezier(0.34, 1.35, 0.64, 1)' // menu.open spring
                    : 'cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                  willChange: 'transform, opacity',
                }}
              >
                {/* State layer on hover/press */}
                <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-8 group-active:opacity-12 bg-current transition-opacity pointer-events-none" />

                <div className="flex items-center gap-3">
                  <span
                    className="text-sm font-semibold tracking-wide whitespace-nowrap transition-opacity duration-150"
                    style={{
                      opacity: isOpen ? 1 : 0,
                      transitionDelay: isOpen ? `${delay + 60}ms` : '0ms',
                    }}
                  >
                    {item.label}
                  </span>
                  {item.icon}
                </div>
              </button>
            );
          })}
        </div>

        {/* Master FAB Button (Section 5.4 & 6.2) */}
        {/* Button container stays steady (does NOT rotate); only inner icon layers cross-rotate + crossfade */}
        <button
          type="button"
          onClick={toggleOpen}
          aria-label={isOpen ? 'Close menu' : 'Open quick actions menu'}
          className="relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl border cursor-pointer select-none focus:outline-none transition-all active:scale-95"
          style={{
            backgroundColor: isOpen ? colors.primary : colors.primaryContainer,
            color: isOpen ? colors.onPrimary : colors.onPrimaryContainer,
            borderColor: colors.outlineVariant,
            borderRadius: isOpen ? '28px' : '16px', // Morphs from Large (16dp) to Full/Round (28dp)
            boxShadow: isOpen
              ? '0 6px 18px rgba(0,0,0,0.25)'
              : '0 4px 14px rgba(0,0,0,0.18)',
            transitionDuration: '240ms',
            transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          {/* Layer 1: Plus (+) Icon (Rotates 0 -> 90deg and fades out) */}
          <svg
            className="w-6 h-6 absolute transition-all"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              opacity: isOpen ? 0 : 1,
              transform: isOpen ? 'rotate(90deg) scale(0.6)' : 'rotate(0deg) scale(1)',
              transitionDuration: '220ms',
              transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
            }}
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>

          {/* Layer 2: Close (X) Icon (Rotates -90deg -> 0 and fades in) */}
          <svg
            className="w-6 h-6 absolute transition-all"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              opacity: isOpen ? 1 : 0,
              transform: isOpen ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.6)',
              transitionDuration: '220ms',
              transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
            }}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </>
  );
};
