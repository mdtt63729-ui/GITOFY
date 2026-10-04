import React, { useState, useEffect } from 'react';
import { useTheme } from '../ThemeContext';

export interface FloatingNavProps {
  currentTab: 'home' | 'inbox';
  onTabChange: (tab: 'home' | 'inbox') => void;
  visible?: boolean;
  unreadCount?: number;
}

export const FloatingNav: React.FC<FloatingNavProps> = ({
  currentTab,
  onTabChange,
  visible = true,
  unreadCount = 0,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();

  // Two-edge spring indicator state (§৬.৩)
  // When switching tabs, the leading edge springs first (liquid stretch), then the trailing edge follows
  const [leadingTab, setLeadingTab] = useState<'home' | 'inbox'>(currentTab);
  const [trailingTab, setTrailingTab] = useState<'home' | 'inbox'>(currentTab);

  useEffect(() => {
    setLeadingTab(currentTab);
    const timer = setTimeout(() => {
      setTrailingTab(currentTab);
    }, 90);
    return () => clearTimeout(timer);
  }, [currentTab]);

  const handleSelect = (tab: 'home' | 'inbox') => {
    if (tab === currentTab) return;
    triggerHaptic('tick');
    onTabChange(tab);
  };

  const isHome = currentTab === 'home';
  const isStretched = leadingTab !== trailingTab;

  return (
    <div
      className={`fixed left-0 right-0 z-30 flex justify-center pointer-events-none transition-all ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-24'
      }`}
      style={{
        bottom: '16px',
        transitionDuration: visible ? '360ms' : '220ms',
        // Section 4.5 & 6.1: bounce.nav spring when returning, accelerated drop when hiding
        transitionTimingFunction: visible
          ? 'cubic-bezier(0.34, 1.35, 0.64, 1)'
          : 'cubic-bezier(0.4, 0, 1, 1)',
      }}
    >
      <nav
        role="navigation"
        aria-label="Main Navigation"
        className="pointer-events-auto relative flex items-center p-1.5 rounded-full border select-none"
        style={{
          height: '64px',
          minWidth: '240px',
          maxWidth: '280px',
          backgroundColor: colors.surfaceContainer,
          borderColor: colors.outlineVariant,
          boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.22)',
          transition: 'background-color 200ms ease, border-color 200ms ease',
        }}
      >
        {/* Liquid-Stretch Indicator (§৬.৩ Two-Edge Spring) */}
        <div
          className="absolute top-2 bottom-2 rounded-full pointer-events-none transition-all"
          style={{
            backgroundColor: colors.secondaryContainer,
            left: isHome
              ? '6px'
              : isStretched
              ? 'calc(38% + 4px)'
              : 'calc(50% + 2px)',
            width: isStretched ? 'calc(58% - 8px)' : 'calc(50% - 8px)',
            transitionDuration: settings.reduceMotion ? '120ms' : '260ms',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
          }}
        />

        {/* Tab 1: Home */}
        <button
          type="button"
          onClick={() => handleSelect('home')}
          className="relative z-10 flex-1 h-full flex items-center justify-center gap-2 rounded-full cursor-pointer px-4 focus:outline-none transition-transform active:scale-96"
          style={{
            color: isHome ? colors.onSecondaryContainer : colors.onSurfaceVariant,
          }}
        >
          <svg
            className="w-6 h-6 transition-all duration-200"
            viewBox="0 0 24 24"
            fill={isHome ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: isHome ? 'scale(1.08)' : 'scale(1.0)',
              opacity: isHome ? 1 : 0.72,
            }}
          >
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span
            className="text-sm font-bold transition-all duration-200 overflow-hidden whitespace-nowrap"
            style={{
              maxWidth: isHome ? '80px' : '0px',
              opacity: isHome ? 1 : 0,
            }}
          >
            Home
          </span>
        </button>

        {/* Tab 2: Inbox */}
        <button
          type="button"
          onClick={() => handleSelect('inbox')}
          className="relative z-10 flex-1 h-full flex items-center justify-center gap-2 rounded-full cursor-pointer px-4 focus:outline-none transition-transform active:scale-96"
          style={{
            color: !isHome ? colors.onSecondaryContainer : colors.onSurfaceVariant,
          }}
        >
          <div className="relative">
            <svg
              className="w-6 h-6 transition-all duration-200"
              viewBox="0 0 24 24"
              fill={!isHome ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: !isHome ? 'scale(1.08)' : 'scale(1.0)',
                opacity: !isHome ? 1 : 0.72,
              }}
            >
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>

            {/* Notification Badge */}
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-xs animate-scale-in"
                style={{ backgroundColor: colors.error }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>

          <span
            className="text-sm font-bold transition-all duration-200 overflow-hidden whitespace-nowrap"
            style={{
              maxWidth: !isHome ? '80px' : '0px',
              opacity: !isHome ? 1 : 0,
            }}
          >
            Inbox
          </span>
        </button>
      </nav>
    </div>
  );
};
