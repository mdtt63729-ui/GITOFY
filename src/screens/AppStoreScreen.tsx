import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { AppIconProgress } from '../ui/AppIconProgress';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { Repository } from '../types';
import { openExternal } from '../utils/external';
import { useApkDownload, formatSpeed } from '../hooks/useApkDownload';
import {
  searchStoreApps, myReposAsApps, enrichWithApks, getLibrary, addToLibrary,
  removeFromLibrary, getHistory, pushHistory, clearHistory, formatAppSize,
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
  { id: 'library', label: 'Library', hint: 'Apps you have downloaded' },
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

  const libraryMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter((a) => a.name.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
  }, [library, query]);

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

  if (detail) {
    const isDownloading = download.state.status === 'downloading';
    const progress = isDownloading ? download.state.percent / 100 : download.state.status === 'done' ? 1 : undefined;
    return (
      <div className="flex-1 flex flex-col gitofy-scroll select-none" style={{ backgroundColor: colors.background }}>
        <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
          <M3IconButton aria-label="Back to results" onClick={() => { download.reset(); setDetail(null); }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </M3IconButton>
          <div className="text-sm font-black flex-1 truncate">{detail.name}</div>
        </div>

        <div className="p-5 pb-28 flex flex-col gap-4">
          <div className="p-5 rounded-3xl border flex items-center gap-4" style={card}>
            <AppIconProgress
              src={detail.ownerAvatar || undefined}
              label={detail.name}
              size={78}
              progress={progress}
              caption={isDownloading ? formatSpeed(download.state.speedBps) : undefined}
            />
            <div className="min-w-0 flex-1">
              <div className="text-base font-black leading-tight truncate">{detail.name}</div>
              <div className="text-[11px] opacity-70 truncate">{detail.owner}</div>
              <div className="flex items-center gap-2 mt-1.5 text-[11px] font-bold" style={{ color: colors.onSurfaceVariant }}>
                {detail.version && <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}>{detail.version}</span>}
                {detail.stars > 0 && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    {detail.stars}
                  </span>
                )}
              </div>
            </div>
          </div>

          {detail.description && (
            <div className="p-5 rounded-3xl border" style={card}>
              <p className="text-xs leading-relaxed opacity-90">{detail.description}</p>
            </div>
          )}

          <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Package</span>
            {detail.checked && !detail.installable ? (
              <p className="text-xs opacity-75">This repository does not publish an APK on its releases, so there is nothing to install.</p>
            ) : detail.apkName ? (
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono truncate">{detail.apkName}</span>
                <span className="opacity-70 flex-shrink-0 ml-2">{formatAppSize(detail.apkSize ?? 0)}</span>
              </div>
            ) : (
              <p className="text-xs opacity-70">Checking the latest release…</p>
            )}

            {isDownloading && (
              <div className="flex flex-col gap-1.5">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
                  <div className="h-full rounded-full" style={{ width: `${download.state.percent}%`, backgroundColor: colors.primary, transition: 'width 200ms linear' }} />
                </div>
                <span className="text-[10px] font-mono opacity-70">
                  {formatAppSize(download.state.received)} / {formatAppSize(download.state.total)} · {formatSpeed(download.state.speedBps)}
                </span>
              </div>
            )}

            {download.state.status === 'done' && (
              <p className="text-xs font-bold" style={{ color: colors.diffAdded }}>✓ Downloaded — the installer should be open</p>
            )}
            {download.state.status === 'error' && (
              <p className="text-xs font-semibold" style={{ color: colors.error }}>{download.state.error}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <M3Button
                variant="filled" shape="capsule" size="compact"
                disabled={!detail.apkUrl || isDownloading}
                loading={isDownloading}
                onClick={() => install(detail)}
              >
                {download.state.status === 'done' ? 'Download again' : 'Install'}
              </M3Button>
              <M3Button variant="tonal" shape="capsule" size="compact" onClick={() => openExternal(detail.htmlUrl)}>On GitHub ↗</M3Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ----------------------------- list ----------------------------- */

  return (
    <div className="flex-1 flex flex-col select-none" style={{ backgroundColor: colors.background }}>
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
          libraryMatches.length === 0 ? (
            <p className="text-xs opacity-70 py-6 text-center">{query.trim() ? 'No downloaded app matches that.' : 'Your library is empty.'}</p>
          ) : (
            libraryMatches.map((a) => (
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
            ))
          )
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
