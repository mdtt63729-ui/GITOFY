import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { Repository } from '../types';
import { M3Button } from '../ui/m3/M3Button';
import { M3Chip } from '../ui/m3/M3Chip';
import { M3Checkbox } from '../ui/m3/M3Checkbox';
import { M3Skeleton } from '../ui/m3/M3Skeleton';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { repoOwnerLogin, repoOwnerAvatar } from '../utils/repo';

export interface HomeScreenProps {
  repos: Repository[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectRepo: (repo: Repository) => void;
  onLongPressRepo: (repo: Repository) => void;
  onCreateRepo: () => void;
  onDeleteRepos: (repoIds: number[]) => void;
  onOpenSettings: () => void;
  onOpenAccounts: () => void;
  onScrollDelta: (scrollTop: number, delta: number) => void;
  isDeleteMode: boolean;
  setIsDeleteMode: (val: boolean) => void;
  selectedRepoIds: number[];
  setSelectedRepoIds: React.Dispatch<React.SetStateAction<number[]>>;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  repos,
  isLoading,
  onRefresh,
  onSelectRepo,
  onLongPressRepo,
  onCreateRepo,
  onDeleteRepos,
  onOpenSettings,
  onOpenAccounts,
  onScrollDelta,
  isDeleteMode,
  setIsDeleteMode,
  selectedRepoIds,
  setSelectedRepoIds,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [filter, setFilter] = useState<'all' | 'private' | 'public' | 'pinned'>('all');
  // Animated sliding indicator behind the Public/Private/Pinned filter chips.
  const filterKeys = ['all', 'private', 'public', 'pinned'] as const;
  const filterChipRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [chipIndicator, setChipIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const [headerCompact, setHeaderCompact] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const revealObserverRef = useRef<IntersectionObserver | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const lastScrollTopRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<{ top: number; delta: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  // Keep the filter-chip indicator aligned with the selected chip, and re-measure
  // when the layout or the chip labels/counts change.
  const measureChipIndicator = useCallback(() => {
    const idx = filterKeys.indexOf(filter);
    const el = filterChipRefs.current[idx];
    if (el) setChipIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [filter]);

  useEffect(() => {
    const raf = requestAnimationFrame(measureChipIndicator);
    window.addEventListener('resize', measureChipIndicator);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measureChipIndicator);
    };
  }, [measureChipIndicator, repos.length]);

  // Reveal each repository box as it scrolls into view (scroll animation).
  useEffect(() => {
    const root = scrollContainerRef.current;
    const revealAll = () => {
      root?.querySelectorAll('.repo-card').forEach((el) => el.classList.add('repo-card-revealed'));
    };
    if (!root || typeof IntersectionObserver === 'undefined') {
      revealAll();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('repo-card-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { root, rootMargin: '0px 0px -28px 0px', threshold: 0.05 }
    );
    revealObserverRef.current = observer;
    root.querySelectorAll('.repo-card').forEach((el) => observer.observe(el));
    // Safety: if the observer never fires (unexpected WebView quirk) reveal every
    // card so the list can never be left blank / untappable.
    const safety = window.setTimeout(() => {
      if (!root.querySelector('.repo-card-revealed')) revealAll();
    }, 1500);
    return () => {
      observer.disconnect();
      revealObserverRef.current = null;
      window.clearTimeout(safety);
    };
  }, [filter]);

  const observeCard = useCallback((el: HTMLDivElement | null) => {
    if (el) revealObserverRef.current?.observe(el);
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const currentTop = e.currentTarget.scrollTop;
    const delta = currentTop - lastScrollTopRef.current;
    lastScrollTopRef.current = currentTop;
    pendingScrollRef.current = { top: currentTop, delta };
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const pending = pendingScrollRef.current;
      if (pending) {
        onScrollDelta(pending.top, pending.delta);
        // Collapse the large app bar while scrolling down (scroll animation).
        setHeaderCompact(pending.top > 24);
      }
    });
  }, [onScrollDelta]);

  const filteredRepos = repos.filter((r) => {
    if (filter === 'private' && !r.private) return false;
    if (filter === 'public' && r.private) return false;
    if (filter === 'pinned' && !r.pinned) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const toggleSelectRepo = (id: number) => {
    setSelectedRepoIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedRepoIds.length === filteredRepos.length) {
      setSelectedRepoIds([]);
    } else {
      setSelectedRepoIds(filteredRepos.map((r) => r.id));
    }
  };

  const langColorMap: Record<string, string> = {
    Kotlin: '#A97BFF',
    Java: '#b07219',
    Dart: '#00B4AB',
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    'C++': '#f34b7d',
    'C#': '#178600',
    C: '#555555',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Rust: '#dea584',
    Go: '#00ADD8',
    Swift: '#F05138',
    PHP: '#4F5D95',
    Ruby: '#701516',
    Shell: '#89e051',
    Vue: '#41b883',
    Markdown: '#083fa1',
  };

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="relative flex-1 flex flex-col gitofy-scroll select-none"
    >
      {/* Top App Bar */}
      <div
        className={`gitofy-appbar sticky top-0 z-30 px-5 border-b ${headerCompact ? 'gitofy-appbar-compact' : ''}`}
        style={{
          backgroundColor: `${colors.surface}f5`,
          borderColor: colors.outlineVariant,
        }}
      >
        {isDeleteMode ? (
          /* Contextual Action Bar for Delete Mode */
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <M3IconButton
                aria-label="Exit delete mode"
                onClick={() => {
                  setIsDeleteMode(false);
                  setSelectedRepoIds([]);
                }}
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </M3IconButton>
              <span className="text-base font-bold">
                {selectedRepoIds.length} selected
              </span>
            </div>
            <div className="flex items-center gap-1">
              <M3Button
                variant="text"
                size="compact"
                onClick={handleSelectAll}
              >
                {selectedRepoIds.length === filteredRepos.length ? 'Clear all' : 'Select all'}
              </M3Button>
            </div>
          </div>
        ) : (
          /* Standard Large App Bar */
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                  <span className="gitofy-wordmark" style={{ color: colors.primary }}>Gitofy</span>
                </h1>
                <p className="gitofy-appbar-subtitle text-xs font-medium" style={{ color: colors.onSurfaceVariant }}>
                  {settings.githubUsername ? `@${settings.githubUsername}` : 'GitHub'} · {repos.length} repositories
                </p>
              </div>

              {/* Action Icons */}
              <div className="flex items-center gap-1">
                <M3IconButton
                  aria-label="Search"
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  selected={isSearchOpen}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </M3IconButton>

                <M3IconButton
                  aria-label="Refresh"
                  onClick={onRefresh}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                </M3IconButton>

                <M3IconButton aria-label="Settings" onClick={onOpenSettings}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </M3IconButton>

                <button
                  type="button"
                  aria-label="Accounts & profile"
                  onClick={onOpenAccounts}
                  className="w-9 h-9 rounded-full overflow-hidden ml-1 border-2 cursor-pointer hover:opacity-90 active:scale-95 transition-transform flex items-center justify-center font-bold text-xs"
                  style={{
                    borderColor: colors.primary,
                    backgroundColor: colors.surfaceContainerHighest,
                    color: colors.primary,
                  }}
                >
                  {settings.avatarUrl ? (
                    <img
                      src={settings.avatarUrl}
                      alt={settings.githubUsername || 'User'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Expandable Search Input */}
            {isSearchOpen && (
              <div className="gitofy-search-in mt-2">
                <div
                  className="flex items-center h-10 px-3 rounded-full border"
                  style={{
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.outline,
                  }}
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search repositories by name or description..."
                    className="flex-1 bg-transparent border-none outline-none text-xs"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="cursor-pointer text-xs opacity-60 hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="px-5 pt-3 pb-44 flex flex-col gap-3">
        {/* GitHub PAT Setup Prompt Card if not connected */}
        {!settings.personalAccessToken && (
          <div
            className="p-5 rounded-3xl border flex flex-col gap-3 shadow-sm animate-scale-in"
            style={{
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                style={{
                  backgroundColor: colors.primaryContainer,
                  color: colors.onPrimaryContainer,
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </span>
              <div>
                <h3 className="text-sm font-bold">Connect your GitHub Account</h3>
                <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                  Enter your token to fetch your real repositories and push ZIP diffs.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <M3Button
                variant="filled"
                shape="capsule"
                size="compact"
                onClick={onOpenSettings}
              >
                Set GitHub Token (PAT)
              </M3Button>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,workflow,delete_repo&description=Gitofy-App"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold px-3 py-1.5 rounded-full hover:underline"
                style={{ color: colors.primary }}
              >
                Create token on GitHub ↗
              </a>
            </div>
          </div>
        )}

        {/* Quick Action Capsule Row */}
        {!isDeleteMode && (
          <div className="flex items-center gap-2 pt-1 pb-1">
            <M3Button
              variant="filled"
              shape="capsule"
              size="medium"
              className="flex-[1.4]"
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              }
              onClick={onCreateRepo}
            >
              Create repo
            </M3Button>

            <M3Button
              variant="destructive-tonal"
              shape="capsule"
              size="medium"
              className="flex-1"
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              }
              onClick={() => {
                triggerHaptic('heavy');
                setIsDeleteMode(true);
              }}
            >
              Delete
            </M3Button>
          </div>
        )}

        {/* Filter Chips — with an animated sliding indicator */}
        {!isDeleteMode && (
          <div className="relative flex items-center gap-1.5 overflow-x-auto py-1 pr-1 scrollbar-none">
            <span
              aria-hidden="true"
              className="filter-chip-indicator"
              style={{
                transform: `translateX(${chipIndicator.left}px)`,
                width: chipIndicator.width,
                backgroundColor: colors.secondaryContainer,
              }}
            />
            <span ref={(el) => { filterChipRefs.current[0] = el; }} className="relative z-[1] inline-flex">
              <M3Chip
                label="All"
                selected={filter === 'all'}
                showSelectedBackground={false}
                dense
                onClick={() => setFilter('all')}
                count={repos.length}
              />
            </span>
            <span ref={(el) => { filterChipRefs.current[1] = el; }} className="relative z-[1] inline-flex">
              <M3Chip
                label="Private"
                selected={filter === 'private'}
                showSelectedBackground={false}
                dense
                onClick={() => setFilter('private')}
                count={repos.filter((r) => r.private).length}
              />
            </span>
            <span ref={(el) => { filterChipRefs.current[2] = el; }} className="relative z-[1] inline-flex">
              <M3Chip
                label="Public"
                selected={filter === 'public'}
                showSelectedBackground={false}
                dense
                onClick={() => setFilter('public')}
                count={repos.filter((r) => !r.private).length}
              />
            </span>
            <span ref={(el) => { filterChipRefs.current[3] = el; }} className="relative z-[1] inline-flex">
              <M3Chip
                label="Pinned"
                selected={filter === 'pinned'}
                showSelectedBackground={false}
                dense
                onClick={() => setFilter('pinned')}
                count={repos.filter((r) => r.pinned).length}
              />
            </span>
          </div>
        )}

        {/* Repositories List */}
        {isLoading ? (
          <M3Skeleton count={4} />
        ) : filteredRepos.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center p-8 rounded-3xl border border-dashed mt-4 text-center gap-3"
            style={{ borderColor: colors.outlineVariant }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: colors.surfaceContainerHighest }}
            >
              <svg className="w-7 h-7 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <h3 className="font-bold text-base">
              {settings.personalAccessToken ? 'No repositories found' : 'No repositories yet'}
            </h3>
            <p className="text-xs max-w-xs" style={{ color: colors.onSurfaceVariant }}>
              {settings.personalAccessToken
                ? 'Try adjusting your search filter or create a new repository.'
                : 'Connect your GitHub Personal Access Token in Settings to load your repositories.'}
            </p>
            <M3Button
              variant="tonal"
              size="compact"
              onClick={settings.personalAccessToken ? onCreateRepo : onOpenSettings}
            >
              {settings.personalAccessToken ? 'Create Repository' : 'Open Settings'}
            </M3Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredRepos.map((repo) => {
              const isSelected = selectedRepoIds.includes(repo.id);

              return (
                <div
                  key={repo.id}
                  ref={observeCard}
                  onClick={() => {
                    if (longPressTriggeredRef.current) {
                      longPressTriggeredRef.current = false;
                      return;
                    }
                    if (isDeleteMode) {
                      toggleSelectRepo(repo.id);
                    } else {
                      onSelectRepo(repo);
                    }
                  }}
                  onPointerDown={() => {
                    if (isDeleteMode) return;
                    longPressTriggeredRef.current = false;
                    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = window.setTimeout(() => {
                      longPressTriggeredRef.current = true;
                      triggerHaptic('heavy');
                      onLongPressRepo(repo);
                    }, 2000);
                  }}
                  onPointerUp={() => {
                    if (longPressTimerRef.current !== null) {
                      window.clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = null;
                    }
                  }}
                  onPointerCancel={() => {
                    if (longPressTimerRef.current !== null) {
                      window.clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = null;
                    }
                  }}
                  className={`repo-card group relative p-4 rounded-2xl border cursor-pointer select-none ${
                    isSelected ? 'ring-2' : ''
                  }`}
                  style={{
                    backgroundColor: isSelected
                      ? colors.errorContainer
                      : colors.surfaceContainerLowest,
                    borderColor: isSelected ? colors.error : colors.outlineVariant,
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox in Delete Mode */}
                    {isDeleteMode && (
                      <div className="pt-0.5 animate-scale-in">
                        <M3Checkbox
                          checked={isSelected}
                          onChange={() => toggleSelectRepo(repo.id)}
                        />
                      </div>
                    )}

                    {/* Real GitHub Owner Avatar Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {repo.owner?.avatar_url ? (
                        <img
                          src={repoOwnerAvatar(repo)}
                          alt={repoOwnerLogin(repo)}
                          className="w-9 h-9 rounded-xl border object-cover shadow-xs"
                          style={{ borderColor: colors.outlineVariant }}
                        />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-xs"
                          style={{
                            backgroundColor: colors.surfaceContainerHighest,
                            borderColor: colors.outlineVariant,
                            color: colors.primary,
                          }}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Repo Details */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      {/* Row 1: Name + Visibility + Pinned */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-sm tracking-tight truncate">
                            {repo.name}
                          </span>
                          {repo.private ? (
                            <span
                              className="px-2 py-0.5 text-[10px] rounded-full font-medium flex items-center gap-1"
                              style={{
                                backgroundColor: colors.surfaceContainerHighest,
                                color: colors.onSurfaceVariant,
                              }}
                            >
                              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              <span>Private</span>
                            </span>
                          ) : (
                            <span
                              className="px-2 py-0.5 text-[10px] rounded-full font-medium flex items-center gap-1"
                              style={{
                                backgroundColor: colors.secondaryContainer,
                                color: colors.onSecondaryContainer,
                              }}
                            >
                              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="9" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <ellipse cx="12" cy="12" rx="4" ry="9" />
                              </svg>
                              <span>Public</span>
                            </span>
                          )}
                          {repo.pinned && (
                            <svg className="w-3.5 h-3.5 text-amber-500 fill-amber-500" viewBox="0 0 24 24">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          )}
                        </div>

                        {/* Actions Status Badge */}
                        {repo.action_status && (
                          <div className="flex items-center">
                            {repo.action_status === 'success' && (
                              <span
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                style={{
                                  backgroundColor: colors.diffAddedContainer,
                                  color: colors.diffAdded,
                                }}
                                title="Actions Succeeded"
                              >
                                ✓
                              </span>
                            )}
                            {repo.action_status === 'running' && (
                              <span
                                className="w-5 h-5 rounded-full flex items-center justify-center"
                                style={{
                                  backgroundColor: colors.secondaryContainer,
                                  color: colors.primary,
                                }}
                                title="Actions Running"
                              >
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              </span>
                            )}
                            {repo.action_status === 'failure' && (
                              <span
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                style={{
                                  backgroundColor: colors.errorContainer,
                                  color: colors.error,
                                }}
                                title="Actions Failed"
                              >
                                ✕
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Row 2: Description */}
                      <p
                        className="text-xs line-clamp-2 leading-relaxed"
                        style={{ color: colors.onSurfaceVariant }}
                      >
                        {repo.description || 'No description provided'}
                      </p>

                      {/* Row 3: Language + Branch + Updated */}
                      <div
                        className="flex items-center gap-3 pt-1 text-[11px] font-medium"
                        style={{ color: colors.onSurfaceVariant }}
                      >
                        {(() => {
                          const displayLang = repo.language || (repo.languages && repo.languages[0]?.name) || null;
                          if (!displayLang) return null;
                          return (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: langColorMap[displayLang] || colors.primary,
                                }}
                              />
                              <span>{displayLang}</span>
                            </div>
                          );
                        })()}
                        <span className="font-mono opacity-80">{repo.default_branch}</span>
                        {repo.stargazers_count > 0 && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3 text-amber-500 fill-amber-500" viewBox="0 0 24 24">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            <span>{repo.stargazers_count}</span>
                          </span>
                        )}
                        <span className="ml-auto opacity-70">
                          {repo.last_commit?.date || 'Recently'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Floating Bar (When Delete Mode is Active) */}
      {isDeleteMode && (
        <div className="fixed left-4 right-4 bottom-6 z-50 animate-slide-up flex justify-center">
          <M3Button
            variant="destructive-filled"
            shape="capsule"
            size="large"
            className="w-full max-w-sm shadow-2xl font-bold"
            disabled={selectedRepoIds.length === 0}
            onClick={() => onDeleteRepos(selectedRepoIds)}
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            }
          >
            Delete Selected ({selectedRepoIds.length})
          </M3Button>
        </div>
      )}
    </div>
  );
};
