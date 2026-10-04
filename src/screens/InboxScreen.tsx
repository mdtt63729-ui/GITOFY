import React, { useState, useRef, useCallback } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { InboxItem } from '../types';
import { M3Chip } from '../ui/m3/M3Chip';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3Button } from '../ui/m3/M3Button';
import { M3BottomSheet } from '../ui/m3/M3BottomSheet';

export interface InboxScreenProps {
  items: InboxItem[];
  onMarkAllRead: () => void;
  onItemClick: (item: InboxItem) => void;
  onDeleteItem?: (id: string) => void;
  onNavigateToRepo?: (repoName: string) => void;
  onScrollDelta: (scrollTop: number, delta: number) => void;
  onDetailVisibilityChange?: (open: boolean) => void;
}

export const InboxScreen: React.FC<InboxScreenProps> = ({
  items,
  onMarkAllRead,
  onItemClick,
  onDeleteItem,
  onNavigateToRepo,
  onScrollDelta,
  onDetailVisibilityChange,
}) => {
  const { colors, triggerHaptic } = useTheme();
  const [filter, setFilter] = useState<'all' | 'unread' | 'workflow' | 'push'>('all');
  const [selectedMessage, setSelectedMessage] = useState<InboxItem | null>(null);
  const lastScrollTopRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<{ top: number; delta: number } | null>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const currentTop = e.currentTarget.scrollTop;
    const delta = currentTop - lastScrollTopRef.current;
    lastScrollTopRef.current = currentTop;
    pendingScrollRef.current = { top: currentTop, delta };
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const pending = pendingScrollRef.current;
      if (pending) onScrollDelta(pending.top, pending.delta);
    });
  }, [onScrollDelta]);

  const handleItemPress = (item: InboxItem) => {
    triggerHaptic('tick');
    onItemClick(item);
    setSelectedMessage(item);
    onDetailVisibilityChange?.(true);
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'unread' && item.read) return false;
    if (filter === 'workflow' && item.type !== 'workflow') return false;
    if (filter === 'push' && item.type !== 'push') return false;
    return true;
  });

  return (
    <div
      onScroll={handleScroll}
      className="relative flex-1 flex flex-col gitofy-scroll select-none"
    >
      {/* Header */}
      <div
        className="sticky top-0 z-30 px-5 pt-3 pb-2 border-b flex items-center justify-between"
        style={{
          backgroundColor: `${colors.surface}f0`,
          borderColor: colors.outlineVariant,
        }}
      >
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>
            Inbox
          </h1>
          <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
            {items.filter((i) => !i.read).length} unread notifications
          </p>
        </div>

        <M3IconButton
          aria-label="Mark all as read"
          onClick={() => {
            triggerHaptic('tick');
            onMarkAllRead();
          }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </M3IconButton>
      </div>

      <div className="px-5 pt-3 pb-32 flex flex-col gap-3">
        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
          <M3Chip
            label="All"
            selected={filter === 'all'}
            onClick={() => setFilter('all')}
            count={items.length}
          />
          <M3Chip
            label="Unread"
            selected={filter === 'unread'}
            onClick={() => setFilter('unread')}
            count={items.filter((i) => !i.read).length}
          />
          <M3Chip
            label="Workflows & Builds"
            selected={filter === 'workflow'}
            onClick={() => setFilter('workflow')}
            count={items.filter((i) => i.type === 'workflow').length}
          />
          <M3Chip
            label="Push Events"
            selected={filter === 'push'}
            onClick={() => setFilter('push')}
            count={items.filter((i) => i.type === 'push').length}
          />
        </div>

        {/* List of items */}
        {filteredItems.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center p-8 rounded-3xl border border-dashed mt-8 text-center gap-2"
            style={{ borderColor: colors.outlineVariant }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: colors.surfaceContainerHighest }}
            >
              <svg className="w-6 h-6 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            </div>
            <h3 className="font-bold text-base">All caught up!</h3>
            <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
              No notifications match your current filter.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemPress(item)}
                className="p-3.5 rounded-2xl border transition-all cursor-pointer active:scale-[0.98]"
                style={{
                  backgroundColor: item.read
                    ? colors.surfaceContainerLowest
                    : colors.surfaceContainerHigh,
                  borderColor: !item.read ? colors.primary : colors.outlineVariant,
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Status Icon */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{
                      backgroundColor:
                        item.status === 'success'
                          ? colors.diffAddedContainer
                          : item.status === 'failure'
                          ? colors.errorContainer
                          : colors.secondaryContainer,
                      color:
                        item.status === 'success'
                          ? colors.diffAdded
                          : item.status === 'failure'
                          ? colors.error
                          : colors.onSecondaryContainer,
                    }}
                  >
                    {item.type === 'workflow' ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="19" x2="12" y2="5" />
                        <polyline points="5 12 12 5 19 12" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-sm tracking-tight truncate ${!item.read ? 'font-bold' : 'font-medium'}`}>
                          {item.title}
                        </span>
                        {!item.read && (
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: colors.primary }}
                          />
                        )}
                      </div>
                      <span className="text-[10px] opacity-70 whitespace-nowrap">{item.timestamp}</span>
                    </div>

                    <p className="text-[11px] font-mono mt-0.5 font-semibold" style={{ color: colors.primary }}>
                      {item.repo}
                    </p>

                    <p className="text-xs mt-1 leading-relaxed opacity-90 line-clamp-2" style={{ color: colors.onSurfaceVariant }}>
                      {item.summary}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message Content Details Bottom Sheet */}
      <M3BottomSheet
        isOpen={Boolean(selectedMessage)}
        onClose={() => { setSelectedMessage(null); onDetailVisibilityChange?.(false); }}
        title="Notification Details"
        subtitle={selectedMessage?.timestamp}
      >
        {selectedMessage && (
          <div className="flex flex-col gap-4">
            {/* Header Badge Row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                  style={{
                    backgroundColor:
                      selectedMessage.status === 'success'
                        ? colors.diffAddedContainer
                        : selectedMessage.status === 'failure'
                        ? colors.errorContainer
                        : colors.primaryContainer,
                    color:
                      selectedMessage.status === 'success'
                        ? colors.diffAdded
                        : selectedMessage.status === 'failure'
                        ? colors.error
                        : colors.onPrimaryContainer,
                  }}
                >
                  {selectedMessage.status === 'success' ? (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : selectedMessage.status === 'failure' ? (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  )}
                  <span>{selectedMessage.type === 'workflow' ? 'GitHub Actions' : 'Git Push'}</span>
                </span>

                <span
                  className="px-2.5 py-1 rounded-full text-xs font-mono font-bold"
                  style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurface }}
                >
                  {selectedMessage.repo}
                </span>
              </div>
            </div>

            {/* Message Title */}
            <div>
              <h2 className="text-lg font-black tracking-tight" style={{ color: colors.onSurface }}>
                {selectedMessage.title}
              </h2>
            </div>

            {/* Complete Unabbreviated Message Summary */}
            <div
              className="p-4 rounded-2xl border flex flex-col gap-2"
              style={{
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.outlineVariant,
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                Message Content
              </span>
              <p className="text-xs leading-relaxed font-sans" style={{ color: colors.onSurface }}>
                {selectedMessage.summary}
              </p>
              {selectedMessage.details && (
                <div
                  className="p-2.5 rounded-xl border text-[11px] font-mono leading-relaxed mt-1"
                  style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
                >
                  {selectedMessage.details}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-2">
              {onNavigateToRepo && (
                <M3Button
                  variant="filled"
                  shape="capsule"
                  size="large"
                  className="w-full font-bold shadow-md"
                  onClick={() => {
                    const repoTarget = selectedMessage.repo;
                    setSelectedMessage(null);
                    onNavigateToRepo(repoTarget);
                  }}
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  }
                >
                  Open {selectedMessage.repo}
                </M3Button>
              )}

              <div className="flex items-center gap-2">
                {onDeleteItem && (
                  <M3Button
                    variant="destructive-tonal"
                    shape="capsule"
                    size="medium"
                    className="flex-1"
                    onClick={() => {
                      triggerHaptic('click');
                      onDeleteItem(selectedMessage.id);
                      setSelectedMessage(null);
                    }}
                    icon={
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    }
                  >
                    Delete notification
                  </M3Button>
                )}

                <M3Button
                  variant="tonal"
                  shape="capsule"
                  size="medium"
                  className="flex-1"
                  onClick={() => setSelectedMessage(null)}
                >
                  Close
                </M3Button>
              </div>
            </div>
          </div>
        )}
      </M3BottomSheet>
    </div>
  );
};
