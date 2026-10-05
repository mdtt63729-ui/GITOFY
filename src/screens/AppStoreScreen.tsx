import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { AppIconProgress } from '../ui/AppIconProgress';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { Repository } from '../types';
import { openExternal } from '../utils/external';
import { useApkDownload, formatSpeed } from '../hooks/useApkDownload';
import {
  searchStoreApps, myReposAsApps, enrichWithApks, getLibrary, addToLibrary,
  removeFromLibrary, getHistory, pushHistory, clearHistory, formatAppSize,
  fetchRepoScreenshots,
  type StoreApp, type LibraryApp,
} from '../utils/appStore';

interface Props {
  token: string;
  username: string;
  repos: Repository[];
  /** Asked to close — the slide-down animation plays, then App unmounts it. */
  onRequestClose: () => void;
}

type Mode = 'store' | 'library' | 'mine';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'store', label: 'Store', hint: 'Installable apps across GitHub' },
  { id: 'library', label: 'Library', hint: 'Your downloads and your repositories' },
  { id: 'mine', label: 'My repos', hint: 'Your repositories and the apps in them' },
];

/**
 * The App Store search surface.
 *
 * Three sources, one search box: GitHub at large, your own downloaded library,
 * and your own repositories (including which of them actually publish an
 * installable APK). The mode button cycles Store → Library → My repos, so from
 * the Library one tap drops you into searching your own repositories.
 */
export const AppStoreScreen: React.FC<Props> = ({ token, username, repos, onRequestClose }) => {
  const { colors, triggerHaptic } = useTheme();

  const [mode, setMode] = useState<Mode>('store');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [storeResults, setStoreResults] = useState<StoreApp[]>([]);
  const [mineResults, setMineResults] = useState<StoreApp[]>([]);
  const [library, setLibrary] = useState<LibraryApp[]>(() => getLibrary());
  const [history, setHistory] = useState<string[]>(() => getHistory());
  const [detail, setDetail] = useState<StoreApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<string[]>([]);

  const enrichToken = useRef<{ cancelled: boolean }>({ cancelled: true });
  const refreshLibrary = useCallback(() => setLibrary(getLibrary()), []);

  /** The app currently being downloaded, so a finished download can be filed. */
  const downloadingAppRef = useRef<StoreApp | null>(null);

  const recordInLibrary = useCallback((app: StoreApp, _path: string) => {
    addToLibrary({
      id: app.id,
      name: app.name,
      owner: app.owner,
      description: app.description,
      version: app.version ?? '',
      apkName: app.apkName ?? '',
      downloadedAt: Date.now(),
      htmlUrl: app.htmlUrl,
      ownerAvatar: app.ownerAvatar,
    });
    refreshLibrary();
  }, [refreshLibrary]);

  // The hook keeps this in a ref, so it never re-subscribes the listener.
  const download = useApkDownload(
    useCallback((path: string) => {
      const app = downloadingAppRef.current;
      if (app) recordInLibrary(app, path);
    }, [recordInLibrary])
  );

  /* ------------------------- search, per mode ------------------------- */

  useEffect(() => {
    const q = query.trim();
    enrichToken.current.cancelled = true;
    enrichToken.current = { cancelled: true };

    if (mode === 'library') {
      setLoading(false);
      return;
    }

    if (!q) {
      setStoreResults([]);
      setMineResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const signal = { cancelled: false };
    enrichToken.current = signal;

    const timer = window.setTimeout(async () => {
      try {
        if (mode === 'store') {
          const found = await searchStoreApps(q, token);
          if (signal.cancelled) return;
          setStoreResults(found);
          setLoading(false);
          // Check for APKs in the background so the list appears immediately.
          void enrichWithApks(found, token, (id, patch) => {
            if (signal.cancelled) return;
            setStoreResults((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
          }, 4, signal);
        } else {
          const found = myReposAsApps(repos, q);
          if (signal.cancelled) return;
          setMineResults(found);
          setLoading(false);
          // Only the first dozen — enough to be useful without hammering the API.
          void enrichWithApks(found.slice(0, 12), token, (id, patch) => {
            if (signal.cancelled) return;
            setMineResults((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
          }, 4, signal);
        }
      } catch {
        if (!signal.cancelled) { setError('Could not search right now.'); setLoading(false); }
      }
    }, 320);

    return () => { window.clearTimeout(timer); signal.cancelled = true; };
  }, [query, mode, token, repos]);

  // Load screenshots (images embedded in the repo README) for the open detail page.
  useEffect(() => {
    if (!detail) { setShots([]); return; }
    let cancelled = false;
    setShots([]);
    fetchRepoScreenshots(detail.owner, detail.name, token)
      .then((list) => { if (!cancelled) setShots(list); })
      .catch(() => { if (!cancelled) setShots([]); });
    return () => { cancelled = true; };
  }, [detail, token]);

  const libraryMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter((a) => a.name.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
  }, [library, query]);

  // Library mode also searches your OWN repositories (not just downloaded apps),
  // so selecting the book/library mode and typing finds your repos too.
  const libraryRepoMatches = useMemo(() => {
    if (mode !== 'library') return [];
    const q = query.trim();
    if (!q) return [];
    return myReposAsApps(repos, q);
  }, [mode, query, repos]);

  const results = mode === 'store' ? storeResults : mode === 'mine' ? mineResults : [];

  /* ---------------------------- actions ---------------------------- */

  const cycleMode = () => {
    triggerHaptic('tick');
    setMode((prev) => (prev === 'store' ? 'library' : prev === 'library' ? 'mine' : 'store'));
  };

  const install = (app: StoreApp) => {
    if (!app.apkUrl || !app.apkName) return;
    triggerHaptic('tick');
    if (query.trim().length > 1) pushHistory(query.trim());
    setHistory(getHistory());
    downloadingAppRef.current = app;
    download.start(app.apkUrl, app.apkName, token);
  };

  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };
  const rowStyle: React.CSSProperties = { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant };
  const current = MODES.find((m) => m.id === mode)!;
  const downloadingId = download.state.status === 'downloading' ? detail?.id : undefined;

  /* ---------------------------- detail ---------------------------- */

  const infoRow = (label: string, value: string, mono = false) => (
    <div className="flex items-start justify-between gap-4 text-xs">
      <span style={{ color: colors.onSurfaceVariant }}>{label}</span>
      <span className={`text-right font-semibold truncate ${mono ? 'font-mono' : ''}`} style={{ color: colors.onSurface, maxWidth: '62%' }}>{value}</span>
    </div>
  );

  if (detail) {
    const isDownloading = download.state.status === 'downloading';
    const progress = isDownloading ? download.state.percent / 100 : download.state.status === 'done' ? 1 : undefined;
    return (
      <div className="flex-1 min-h-0 flex flex-col gitofy-scroll select-none gitofy-app-open" style={{ backgroundColor: colors.background }}>
        {/* Top bar */}
        <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
          <M3IconButton aria-label="Back to results" onClick={() => { download.reset(); setDetail(null); }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </M3IconButton>
          <div className="text-sm font-black flex-1 truncate">{detail.name}</div>
          <M3IconButton aria-label="Open on GitHub" onClick={() => openExternal(detail.htmlUrl)}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          </M3IconButton>
        </div>

        {/* Hero: icon + identity */}
        <div className="px-5 pt-4 pb-2 flex items-center gap-4">
          <AppIconProgress
            src={detail.ownerAvatar || undefined}
            label={detail.name}
            size={86}
            progress={progress}
            caption={isDownloading ? formatSpeed(download.state.speedBps) : undefined}
          />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-black leading-tight truncate">{detail.name}</div>
            <div className="text-[11px] opacity-70 truncate">{detail.owner}</div>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] font-bold" style={{ color: colors.onSurfaceVariant }}>
              {detail.version && <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}>{detail.version}</span>}
              {detail.language && <span className="opacity-80">{detail.language}</span>}
              {detail.stars > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  {detail.stars}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Install row (Play Store style) */}
        <div className="px-5 py-2 flex items-center gap-2">
          <button
            type="button"
            disabled={!detail.apkUrl || isDownloading}
            onClick={() => install(detail)}
            className="flex-1 h-11 rounded-full text-sm font-black cursor-pointer active:scale-[0.99] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
          >
            {isDownloading ? (
              <span>{Math.round(download.state.percent)}%</span>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                {download.state.status === 'done' ? 'Download again' : 'Install'}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => openExternal(detail.htmlUrl)}
            className="h-11 px-5 rounded-full text-sm font-bold cursor-pointer active:scale-[0.99] transition-transform border"
            style={{ borderColor: colors.outlineVariant, color: colors.primary, backgroundColor: 'transparent' }}
          >
            GitHub ↗
          </button>
        </div>

        {detail.checked && !detail.installable && (
          <div className="px-5 pb-1">
            <p className="text-[11px] opacity-75">This repository does not publish an APK on its releases, so there is nothing to install.</p>
          </div>
        )}

        {isDownloading && (
          <div className="px-5 pb-2 flex flex-col gap-1.5">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
              <div className="h-full rounded-full" style={{ width: `${download.state.percent}%`, backgroundColor: colors.primary, transition: 'width 200ms linear' }} />
            </div>
            <span className="text-[10px] font-mono opacity-70">
              {formatAppSize(download.state.received)} / {formatAppSize(download.state.total)} · {formatSpeed(download.state.speedBps)}
            </span>
          </div>
        )}
        {download.state.status === 'done' && (
          <div className="px-5 pb-1"><p className="text-xs font-bold" style={{ color: colors.diffAdded }}>✓ Downloaded — the installer should be open</p></div>
        )}
        {download.state.status === 'error' && (
          <div className="px-5 pb-1"><p className="text-xs font-semibold" style={{ color: colors.error }}>{download.state.error}</p></div>
        )}

        {/* Screenshots (Play Store carousel) */}
        <div className="pt-3 pb-1">
          <span className="px-5 text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Screenshots</span>
          {shots.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto px-5 py-3 scrollbar-none" style={{ scrollSnapType: 'x mandatory' }}>
              {shots.map((src) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  loading="lazy"
                  className="h-72 rounded-2xl border object-cover flex-shrink-0"
                  style={{ borderColor: colors.outlineVariant, scrollSnapAlign: 'start', width: 152 }}
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 px-5 py-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-72 rounded-2xl border flex-shrink-0 animate-pulse" style={{ borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerHigh, width: 152 }} />
              ))}
            </div>
          )}
        </div>

        {/* About this app */}
        {detail.description && (
          <div className="px-5 pt-2 pb-1">
            <div className="p-5 rounded-3xl border" style={card}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>About this app</span>
              <p className="text-xs leading-relaxed opacity-90 mt-2">{detail.description}</p>
            </div>
          </div>
        )}

        {/* App info */}
        <div className="px-5 pt-2 pb-28">
          <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>App info</span>
            {infoRow('Version', detail.version || '—')}
            {infoRow('Size', detail.apkSize ? formatAppSize(detail.apkSize) : '—')}
            {infoRow('Language', detail.language || '—')}
            {infoRow('Visibility', detail.isPrivate ? 'Private' : 'Public')}
            {infoRow('Package', detail.apkName || '—', true)}
            {infoRow('Repository', detail.id)}
          </div>
        </div>
      </div>
    );
  }

  /* ----------------------------- list ----------------------------- */

  return (
    <div className="flex-1 min-h-0 flex flex-col select-none" style={{ backgroundColor: colors.background }}>
      {/* Search bar + mode button */}
      <div className="px-3 pt-3 pb-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: colors.surface, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Close search" onClick={onRequestClose}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>

        <div className="flex-1 flex items-center gap-2 px-3.5 h-11 rounded-full border" style={rowStyle}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ color: colors.onSurfaceVariant }}>
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'library' ? 'Search downloaded apps…' : mode === 'mine' ? 'Search your repositories…' : 'Search apps…'}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: colors.onSurface }}
          />
          {query && (
            <button type="button" className="p-0.5 cursor-pointer" style={{ color: colors.onSurfaceVariant }} onClick={() => setQuery('')} aria-label="Clear">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>

        {/* Mode button. One tap from Library lands on your own repositories. */}
        <button
          type="button"
          onClick={cycleMode}
          aria-label={`Switch search mode (now: ${current.label})`}
          className="w-11 h-11 rounded-full border flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer, borderColor: colors.outlineVariant }}
        >
          <span key={mode} className="gitofy-mode-morph flex items-center justify-center">
            {mode === 'store' && (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><line x1="3" y1="12" x2="21" y2="12" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></svg>
            )}
            {mode === 'library' && (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
            )}
            {mode === 'mine' && (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><line x1="9" y1="7" x2="16" y2="7" /></svg>
            )}
          </span>
        </button>
      </div>

      <div className="px-5 pt-2.5 pb-1 flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.primary }}>{current.label}</span>
        <span className="text-[11px] opacity-60 truncate">{current.hint}</span>
      </div>

      <div className="flex-1 gitofy-scroll px-5 py-3 pb-24 flex flex-col gap-2">
        {error && (
          <div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.onErrorContainer, borderColor: colors.error }}>{error}</div>
        )}

        {/* Empty query: history and recent downloads, exactly as the spec asks. */}
        {!query.trim() && mode !== 'library' && (
          <>
            {history.length > 0 && (
              <>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Recent searches</span>
                  <button type="button" className="text-[11px] font-bold cursor-pointer" style={{ color: colors.primary }} onClick={() => { clearHistory(); setHistory([]); }}>Clear</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map((h) => (
                    <button key={h} type="button" onClick={() => setQuery(h)}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer active:scale-95 transition-transform"
                      style={rowStyle}>
                      {h}
                    </button>
                  ))}
                </div>
              </>
            )}

            <span className="text-xs font-bold uppercase tracking-wider mt-2" style={{ color: colors.onSurfaceVariant }}>Recently downloaded</span>
            {library.length === 0 ? (
              <p className="text-xs opacity-70">Nothing downloaded yet. Search the Store to find an app.</p>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {library.slice(0, 8).map((a) => (
                  <button key={a.id} type="button" onClick={() => openExternal(a.htmlUrl)} className="flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition-transform">
                    <AppIconProgress src={a.ownerAvatar || undefined} label={a.name} size={52} />
                    <span className="text-[10px] font-semibold truncate w-full text-center">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] opacity-60 mt-3 leading-relaxed">
              {mode === 'store'
                ? 'Searching the Store looks across GitHub for repositories that publish an installable APK.'
                : 'Searching your repositories also shows which of them publish an installable APK.'}
            </p>
          </>
        )}

        {mode === 'library' && (
          <>
            {libraryRepoMatches.length > 0 && (
              <>
                <span className="text-xs font-bold uppercase tracking-wider mt-1" style={{ color: colors.onSurfaceVariant }}>Your repositories</span>
                {libraryRepoMatches.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => openExternal(app.htmlUrl)}
                    className="p-3.5 rounded-2xl border flex items-center gap-3 text-left cursor-pointer active:scale-[0.99] transition-transform"
                    style={rowStyle}
                  >
                    <AppIconProgress src={app.ownerAvatar || undefined} label={app.name} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{app.name}</div>
                      <div className="text-[10px] opacity-70 truncate">{app.owner}{app.description ? ` · ${app.description}` : ''}</div>
                    </div>
                    <svg className="w-4 h-4 flex-shrink-0 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                ))}
              </>
            )}

            {libraryMatches.length === 0 && libraryRepoMatches.length === 0 ? (
              <p className="text-xs opacity-70 py-6 text-center">{query.trim() ? 'No downloaded app or repository matches that.' : 'Your library is empty.'}</p>
            ) : (
              <>
                {libraryMatches.length > 0 && query.trim() && (
                  <span className="text-xs font-bold uppercase tracking-wider mt-1" style={{ color: colors.onSurfaceVariant }}>Downloaded</span>
                )}
                {libraryMatches.map((a) => (
                  <div key={a.id} className="p-3.5 rounded-2xl border flex items-center gap-3" style={rowStyle}>
                    <AppIconProgress src={a.ownerAvatar || undefined} label={a.name} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{a.name}</div>
                      <div className="text-[10px] opacity-70 truncate">{a.owner}{a.version ? ` · ${a.version}` : ''}</div>
                      <div className="text-[10px] opacity-50 truncate">{new Date(a.downloadedAt).toLocaleDateString()}</div>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button type="button" className="text-[11px] font-bold cursor-pointer" style={{ color: colors.primary }} onClick={() => openExternal(a.htmlUrl)}>Open</button>
                      <button type="button" className="text-[11px] font-bold cursor-pointer" style={{ color: colors.error }} onClick={() => { removeFromLibrary(a.id); refreshLibrary(); }}>Remove</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {mode !== 'library' && query.trim() && loading && <SkeletonRows count={4} height={66} />}

        {mode !== 'library' && query.trim() && !loading && results.length === 0 && (
          <p className="text-xs opacity-70 py-6 text-center">Nothing found for “{query.trim()}”.</p>
        )}

        {mode !== 'library' && query.trim() && !loading && results.map((app) => (
          <button
            key={app.id}
            type="button"
            onClick={() => { triggerHaptic('tick'); download.reset(); setDetail(app); }}
            className="p-3 rounded-2xl border flex items-center gap-3 text-left cursor-pointer active:scale-[0.99] transition-transform"
            style={rowStyle}
          >
            <AppIconProgress
              src={app.ownerAvatar || undefined}
              label={app.name}
              size={56}
              progress={downloadingId === app.id ? download.state.percent / 100 : undefined}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold truncate">{app.name}</span>
                {app.checked && app.installable && (
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }}>APK</span>
                )}
              </div>
              <div className="text-[10px] opacity-70 truncate">{app.description || app.owner}</div>
              <div className="text-[10px] opacity-55 truncate mt-0.5">
                {app.owner}
                {app.version ? ` · ${app.version}` : ''}
                {app.apkSize ? ` · ${formatAppSize(app.apkSize)}` : ''}
                {app.stars ? ` · ★ ${app.stars}` : ''}
              </div>
            </div>
            <svg className="w-4 h-4 flex-shrink-0 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ))}

        {mode !== 'library' && query.trim() && !loading && results.length > 0 && (
          <p className="text-[10px] opacity-50 text-center pt-2">Signed in as {username || 'your account'} · discovery uses GitHub search</p>
        )}
      </div>
    </div>
  );
};
