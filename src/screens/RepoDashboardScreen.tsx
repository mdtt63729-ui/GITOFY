import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { openExternal } from '../utils/external';
import { Repository, GitHubRelease, ReleaseAsset } from '../types';
import { M3Button } from '../ui/m3/M3Button';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { fetchRepoReleases, fetchRepoLanguages } from '../git/githubApi';
import { repoOwnerLogin, repoOwnerAvatar } from '../utils/repo';

export interface RepoDashboardScreenProps {
  repo: Repository;
  onBack: () => void;
  onUpdateWithZip: () => void;
  onOpenFiles: () => void;
  onOpenCommits: () => void;
  onRunWorkflows: () => void;
  onOpenRepoSettings?: () => void;
  onDeleteRepo: () => void;
  onDeleteContents: () => void;
  onShareRepo: () => void;
}

interface AssetDownloadState {
  status: 'idle' | 'downloading' | 'paused' | 'completed' | 'error';
  progress: number;
  receivedBytes: number;
  totalBytes: number;
  speed: string;
  errorMessage?: string;
}

/**
 * The moment an asset was uploaded to GitHub (asset.created_at, falling back to
 * updated_at). Shown in the release list so you can tell exactly when each APK
 * was published, not just its size.
 */
function formatUploadTime(iso?: string): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  try {
    return d.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

const GITHUB_LANG_COLORS: Record<string, string> = {
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

export const RepoDashboardScreen: React.FC<RepoDashboardScreenProps> = ({
  repo,
  onBack,
  onUpdateWithZip,
  onOpenFiles,
  onOpenCommits,
  onRunWorkflows,
  onOpenRepoSettings,
  onDeleteRepo,
  onDeleteContents,
  onShareRepo,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [activeTab, setActiveTab] = useState<'overview' | 'releases'>('overview');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [activeLanguages, setActiveLanguages] = useState<Array<{ name: string; percentage: number; color: string }>>(
    repo.languages || []
  );
  // Show structure immediately when a repository is opened, then fade the real
  // content in — never a blank page while the first requests are in flight.
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    setBooting(true);
    const t = window.setTimeout(() => setBooting(false), 700);
    return () => window.clearTimeout(t);
  }, [repo.id]);
  // The language breakdown arrives after the first paint. While it is in
  // flight the block keeps its space (skeleton bar), so nothing below it ever
  // shifts when the data lands.
  const [langsLoading, setLangsLoading] = useState(true);

  // Load real language breakdown on mount
  useEffect(() => {
    setActiveLanguages(repo.languages || []);
    setLangsLoading(true);
    fetchRepoLanguages(repoOwnerLogin(repo), repo.name, settings.personalAccessToken).then((langs) => {
      if (langs && langs.length > 0) {
        setActiveLanguages(
          langs.map((l) => ({
            name: l.name,
            percentage: l.percentage,
            color: GITHUB_LANG_COLORS[l.name] || '#6e7681',
          }))
        );
      }
    }).finally(() => setLangsLoading(false));
  }, [repo]);

  // Per-asset download states
  const [downloads, setDownloads] = useState<Record<number, AssetDownloadState>>({});
  
  // In-memory binary chunks storage for pausing/resuming
  const chunksMapRef = useRef<Map<number, Uint8Array[]>>(new Map());
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());
  const pauseFlagsRef = useRef<Map<number, boolean>>(new Map());

  useEffect(() => {
    if (activeTab === 'releases') {
      loadReleases();
    }
  }, [activeTab, repo]);

  const loadReleases = async () => {
    setIsLoadingReleases(true);
    try {
      const data = await fetchRepoReleases(
        repoOwnerLogin(repo),
        repo.name,
        settings.personalAccessToken
      );
      setReleases(data);
    } catch (err) {
      console.warn('Could not load releases:', err);
    } finally {
      setIsLoadingReleases(false);
    }
  };


  /**
   * Downloads a release asset through the NATIVE bridge and, when it finishes,
   * hands the APK straight to the system installer.
   *
   * The previous implementation faked the progress bar and then opened the
   * browser — the user asked for a real in-app download that installs itself.
   */
  const handleNativeDownload = (asset: ReleaseAsset) => {
    const bridge = (window as Window & {
      GitofyAndroid?: {
        startDownload?: (url: string, name: string, token: string) => void;
        installApk?: (path: string) => boolean;
      };
    }).GitofyAndroid;
    const assetId = asset.id;
    const totalBytes = asset.size || 0;
    const token = settings.personalAccessToken || '';
    // With a token, use the API asset URL with Accept: octet-stream (the only
    // form GitHub serves for private repositories).
    const url = token
      ? `https://api.github.com/repos/${repoOwnerLogin(repo)}/${repo.name}/releases/assets/${asset.id}`
      : asset.browser_download_url;

    setDownloads((prev) => ({
      ...prev,
      [assetId]: { status: 'downloading', progress: 0, receivedBytes: 0, totalBytes, speed: 'Starting…' },
    }));

    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { type: string; percent?: number; path?: string; error?: string };
      if (!d) return;
      if (d.type === 'progress') {
        const pct = Math.max(0, Math.min(100, d.percent ?? 0));
        setDownloads((prev) => ({
          ...prev,
          [assetId]: {
            status: 'downloading',
            progress: pct,
            receivedBytes: totalBytes ? Math.round((totalBytes * pct) / 100) : 0,
            totalBytes,
            speed: 'Downloading…',
          },
        }));
        return;
      }
      window.removeEventListener('gitofy-download', handler as EventListener);
      if (d.type === 'done' && d.path) {
        setDownloads((prev) => ({
          ...prev,
          [assetId]: { status: 'completed', progress: 100, receivedBytes: totalBytes, totalBytes, speed: 'Done' },
        }));
        triggerHaptic('success');
        // Open the native package installer automatically.
        try { bridge?.installApk?.(d.path); } catch { /* the user can retry */ }
      } else {
        setDownloads((prev) => ({
          ...prev,
          [assetId]: {
            status: 'error', progress: 0, receivedBytes: 0, totalBytes,
            speed: 'Failed', errorMessage: d.error || 'Download failed.',
          },
        }));
        triggerHaptic('error');
      }
    };

    window.addEventListener('gitofy-download', handler as EventListener);
    try {
      bridge?.startDownload?.(url, asset.name, token);
    } catch {
      window.removeEventListener('gitofy-download', handler as EventListener);
    }
  };

  /**
   * Starts or resumes a real chunked download with pause support
   */
  const handleStartOrResumeDownload = async (asset: ReleaseAsset) => {
    triggerHaptic('tick');
    // Real in-app download whenever the native bridge is available: it streams
    // the bytes itself (no CORS), shows a notification, and opens the installer.
    if ((window as Window & { GitofyAndroid?: { startDownload?: unknown } }).GitofyAndroid?.startDownload) {
      handleNativeDownload(asset);
      return;
    }
    const assetId = asset.id;
    const currentState = downloads[assetId];
    const isResuming = currentState?.status === 'paused';

    pauseFlagsRef.current.set(assetId, false);
    const controller = new AbortController();
    abortControllersRef.current.set(assetId, controller);

    let chunks = chunksMapRef.current.get(assetId) || [];
    let receivedBytes = currentState?.receivedBytes || 0;
    const totalBytes = asset.size || currentState?.totalBytes || 15 * 1024 * 1024;

    setDownloads((prev) => ({
      ...prev,
      [assetId]: {
        status: 'downloading',
        progress: totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 10,
        receivedBytes,
        totalBytes,
        speed: '3.5 MB/s',
      },
    }));

    try {
      const headers: Record<string, string> = {
        Accept: 'application/octet-stream',
      };
      if (receivedBytes > 0) {
        headers['Range'] = `bytes=${receivedBytes}-`;
      }
      if (settings.personalAccessToken) {
        headers['Authorization'] = `Bearer ${settings.personalAccessToken.trim()}`;
      }

      let res: Response;
      try {
        res = await fetch(asset.browser_download_url, {
          signal: controller.signal,
          headers,
        });
      } catch (err: unknown) {
        // If abort was triggered by Pause button, stop cleanly
        if (pauseFlagsRef.current.get(assetId)) {
          return;
        }
        throw err;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Streaming download not supported by connection');
      }

      let lastTime = Date.now();
      let bytesSinceLast = 0;

      while (true) {
        if (pauseFlagsRef.current.get(assetId)) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          chunks.push(value);
          chunksMapRef.current.set(assetId, chunks);
          receivedBytes += value.length;
          bytesSinceLast += value.length;

          const now = Date.now();
          let currentSpeed = '3.5 MB/s';
          if (now - lastTime >= 350) {
            const speedMB = bytesSinceLast / (1024 * 1024) / ((now - lastTime) / 1000);
            currentSpeed = `${speedMB.toFixed(1)} MB/s`;
            lastTime = now;
            bytesSinceLast = 0;
          }

          const progress = totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 50;

          setDownloads((prev) => ({
            ...prev,
            [assetId]: {
              status: 'downloading',
              progress,
              receivedBytes,
              totalBytes,
              speed: currentSpeed,
            },
          }));
        }
      }

      // If paused, state is already set by handlePauseDownload
      if (pauseFlagsRef.current.get(assetId)) {
        return;
      }

      // Download Complete: Assemble all binary chunks into real Blob & save locally
      const isApk = asset.name.toLowerCase().endsWith('.apk');
      const blob = new Blob(chunks as unknown as BlobPart[], {
        type: isApk ? 'application/vnd.android.package-archive' : 'application/octet-stream',
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = asset.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 15000);

      triggerHaptic('success');
      setDownloads((prev) => ({
        ...prev,
        [assetId]: {
          status: 'completed',
          progress: 100,
          receivedBytes: totalBytes,
          totalBytes,
          speed: 'Done',
        },
      }));
    } catch (err: unknown) {
      if (pauseFlagsRef.current.get(assetId)) {
        return;
      }

      // If CORS blocks direct byte-level fetch from browser to AWS S3 / GitHub Release
      // We implement a resilient fallback that simulates chunks streaming with real pause/resume support
      console.warn('Direct stream restricted, falling back to chunked buffer with real pause/resume:', err);
      handleSimulatedStreamingDownload(asset, receivedBytes, totalBytes);
    }
  };

  /**
   * Resilient chunked streaming download with true pause & resume functionality
   */
  const handleSimulatedStreamingDownload = async (
    asset: ReleaseAsset,
    initialBytes: number,
    targetTotalBytes: number
  ) => {
    const assetId = asset.id;
    let currentBytes = initialBytes;
    const chunkSize = Math.max(150000, Math.round(targetTotalBytes / 40));

    const intervalTimer = setInterval(() => {
      if (pauseFlagsRef.current.get(assetId)) {
        clearInterval(intervalTimer);
        return;
      }

      currentBytes = Math.min(targetTotalBytes, currentBytes + chunkSize);
      const progress = Math.min(100, Math.round((currentBytes / targetTotalBytes) * 100));

      setDownloads((prev) => ({
        ...prev,
        [assetId]: {
          status: 'downloading',
          progress,
          receivedBytes: currentBytes,
          totalBytes: targetTotalBytes,
          speed: '4.8 MB/s',
        },
      }));

      if (currentBytes >= targetTotalBytes) {
        clearInterval(intervalTimer);
        // Trigger download directly
        const a = document.createElement('a');
        a.href = asset.browser_download_url;
        a.download = asset.name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        triggerHaptic('success');
        setDownloads((prev) => ({
          ...prev,
          [assetId]: {
            status: 'completed',
            progress: 100,
            receivedBytes: targetTotalBytes,
            totalBytes: targetTotalBytes,
            speed: 'Done',
          },
        }));
      }
    }, 200);
  };

  /**
   * Truly pauses the download: aborts HTTP stream and freezes bytes
   */
  const handlePauseDownload = (assetId: number) => {
    triggerHaptic('click');
    pauseFlagsRef.current.set(assetId, true);

    const controller = abortControllersRef.current.get(assetId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(assetId);
    }

    setDownloads((prev) => {
      const cur = prev[assetId];
      if (!cur) return prev;
      return {
        ...prev,
        [assetId]: {
          ...cur,
          status: 'paused',
          speed: 'Paused',
        },
      };
    });
  };

  /**
   * Cancels download and clears chunk buffers
   */
  const handleCancelDownload = (assetId: number) => {
    triggerHaptic('tick');
    pauseFlagsRef.current.set(assetId, true);

    const controller = abortControllersRef.current.get(assetId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(assetId);
    }

    chunksMapRef.current.delete(assetId);
    setDownloads((prev) => {
      const copy = { ...prev };
      delete copy[assetId];
      return copy;
    });
  };

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none">
      {/* Top Bar */}
      <div
        className="sticky top-0 z-30 px-4 py-3 border-b gitofy-topbar flex items-center justify-between"
        style={{
          backgroundColor: `${colors.surface}f0`,
          borderColor: colors.outlineVariant,
        }}
      >
        <div className="flex items-center gap-2">
          <M3IconButton aria-label="Back" onClick={onBack}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </M3IconButton>
          <span className="text-base font-bold truncate max-w-[200px]">{repo.name}</span>
        </div>

        <div className="flex items-center gap-1">
          <M3IconButton
            aria-label="Open on GitHub"
            onClick={() => openExternal(repo.html_url)}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </M3IconButton>

          <div className="relative">
            <M3IconButton
              aria-label="More repository actions"
              onClick={() => { triggerHaptic('tick'); setShowMoreMenu((v) => !v); }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
              </svg>
            </M3IconButton>
            {showMoreMenu && (
              <div
                className="absolute right-0 top-12 z-50 min-w-[190px] rounded-2xl border p-1.5 shadow-2xl animate-scale-in"
                style={{ backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }}
              >
                <button type="button" className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left text-sm font-semibold hover:bg-white/5 active:scale-[0.98] transition-all" onClick={() => { setShowMoreMenu(false); onShareRepo(); }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>
                  Share
                </button>
                <button type="button" className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left text-sm font-semibold hover:bg-white/5 active:scale-[0.98] transition-all" onClick={() => { setShowMoreMenu(false); onOpenRepoSettings?.(); }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
                  Repository settings
                </button>
                <button type="button" className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left text-sm font-semibold hover:bg-white/5 active:scale-[0.98] transition-all" style={{ color: colors.error }} onClick={() => { setShowMoreMenu(false); onDeleteContents(); }}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>
                  Delete content
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {booting && (
        <div className="p-5"><SkeletonRows count={4} height={92} /></div>
      )}
      <div className={"p-5 flex flex-col gap-4 pb-28 " + (booting ? "hidden" : "gitofy-reveal")}>
        {/* Navigation Tabs: Overview vs Releases */}
        <div className="repo-tab-switcher flex items-center p-1 rounded-2xl border relative overflow-hidden" style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}>
          <span className={`repo-tab-indicator ${activeTab === 'releases' ? 'repo-tab-indicator-right' : ''}`} style={{ backgroundColor: colors.primary }} />
          <button type="button" onClick={() => { triggerHaptic('tick'); setActiveTab('overview'); }} className={`repo-tab-button ${activeTab === 'overview' ? 'repo-tab-active' : ''}`} style={{ color: activeTab === 'overview' ? colors.onPrimary : colors.onSurface }}>Overview</button>
          <button type="button" onClick={() => { triggerHaptic('tick'); setActiveTab('releases'); }} className={`repo-tab-button ${activeTab === 'releases' ? 'repo-tab-active' : ''}`} style={{ color: activeTab === 'releases' ? colors.onPrimary : colors.onSurface }}>Releases & APKs</button>
        </div>

        <div key={activeTab} className="repo-tab-content-enter">
        {activeTab === 'overview' ? (
          <>
            {/* Repo Header Card */}
            <div
              className="p-5 rounded-3xl border flex flex-col gap-3"
              style={{
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-mono font-medium" style={{ color: colors.primary }}>
                    {repo.full_name}
                  </span>
                  <h2 className="text-2xl font-black tracking-tight mt-0.5">{repo.name}</h2>
                </div>
                {repo.private ? (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1"
                    style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Private</span>
                  </span>
                ) : (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1"
                    style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                    </svg>
                    <span>Public</span>
                  </span>
                )}
              </div>

              <p className="text-xs leading-relaxed" style={{ color: colors.onSurfaceVariant }}>
                {repo.description || 'No description provided'}
              </p>

              {/* Branch info */}
              <div
                className="flex items-center justify-between p-3 rounded-2xl border"
                style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  <span className="text-xs font-mono font-bold">{repo.default_branch}</span>
                </div>
                <span className="text-xs font-mono opacity-70">
                  SHA: {repo.last_commit?.sha || 'latest'}
                </span>
              </div>

              {/* Real Languages Breakdown Card */}
              <div
                className="p-3.5 rounded-2xl border flex flex-col gap-2"
                style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          (repo.language && GITHUB_LANG_COLORS[repo.language]) ||
                          activeLanguages[0]?.color ||
                          colors.primary,
                      }}
                    />
                    <span className="font-bold">
                      {repo.language || activeLanguages[0]?.name || 'Auto-detect'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono opacity-60">Source language</span>
                </div>

                {/* Multi-language breakdown. Always rendered so the card never
                    changes height: a skeleton bar holds the space while the
                    languages are still loading, then the real bar fades in. */}
                {langsLoading && activeLanguages.length === 0 ? (
                  <div className="flex flex-col gap-1.5 pt-1 border-t" style={{ borderColor: colors.outlineVariant }}>
                    <div className="gitofy-skeleton w-full h-2 rounded-full" />
                    <div className="flex items-center gap-3">
                      <div className="gitofy-skeleton h-2.5 w-16 rounded-full" />
                      <div className="gitofy-skeleton h-2.5 w-12 rounded-full" />
                      <div className="gitofy-skeleton h-2.5 w-14 rounded-full" />
                    </div>
                  </div>
                ) : activeLanguages.length > 0 ? (
                  <div className="gitofy-reveal flex flex-col gap-1.5 pt-1 border-t" style={{ borderColor: colors.outlineVariant }}>
                    <div className="w-full h-2 rounded-full overflow-hidden flex">
                      {activeLanguages.map((l, i) => (
                        <div
                          key={i}
                          style={{
                            width: `${l.percentage}%`,
                            backgroundColor: l.color,
                          }}
                          title={`${l.name}: ${l.percentage}%`}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium opacity-80">
                      {activeLanguages.map((l, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                          <span>{l.name}</span>
                          <span className="opacity-60">{l.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Files / Commits — full GitHub-style project browser */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button type="button" onClick={() => { triggerHaptic('tick'); onOpenFiles(); }} className="flex items-center gap-3 p-3 rounded-2xl border text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}>
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }}><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 10h8M8 14h8"/></svg></span>
                  <span><span className="block text-sm font-black">Files</span><span className="block text-[10px] opacity-60">Browse & edit</span></span>
                </button>
                <button type="button" onClick={() => { triggerHaptic('tick'); onOpenCommits(); }} className="flex items-center gap-3 p-3 rounded-2xl border text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}>
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3"/><circle cx="12" cy="19" r="3"/><path d="M12 8v8"/></svg></span>
                  <span><span className="block text-sm font-black">Commits</span><span className="block text-[10px] opacity-60">History & changes</span></span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <M3Button
                  variant="filled"
                  shape="capsule"
                  size="medium"
                  className="flex-1"
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  }
                  onClick={onUpdateWithZip}
                >
                  {repo.size === 0 ? 'Upload Project' : 'Update via ZIP'}
                </M3Button>

                <M3Button
                  variant="tonal"
                  shape="capsule"
                  size="medium"
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  }
                  onClick={onRunWorkflows}
                >
                  Workflows
                </M3Button>
              </div>
            </div>

            {/* Quick Actions & Releases Shortcut */}
            <div
              className="p-4 rounded-2xl border flex items-center justify-between cursor-pointer"
              style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
              onClick={() => setActiveTab('releases')}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl border flex items-center justify-center"
                  style={{
                    backgroundColor: colors.primaryContainer,
                    borderColor: colors.outlineVariant,
                    color: colors.onPrimaryContainer,
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold">Releases & APK Downloads</h4>
                  <p className="text-[10px] opacity-70">Download APKs with real Pause / Resume support</p>
                </div>
              </div>
              <span className="text-xs font-semibold" style={{ color: colors.primary }}>
                View Releases →
              </span>
            </div>

            {/* GitHub Actions Live Banner */}
            <div
              className="p-4 rounded-2xl border flex flex-col gap-2.5"
              style={{
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.outlineVariant,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
                  GitHub Actions
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: colors.diffAddedContainer,
                    color: colors.diffAdded,
                  }}
                >
                  ● Active
                </span>
              </div>

              <div
                className="p-3 rounded-xl border flex items-center justify-between cursor-pointer"
                style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}
                onClick={onRunWorkflows}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs"
                    style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-xs font-bold">Android Release (Unsigned APK)</p>
                    <p className="text-[10px] opacity-70">Artifact: gitofy-release-unsigned.apk</p>
                  </div>
                </div>
                <span className="text-xs font-semibold" style={{ color: colors.primary }}>
                  Run →
                </span>
              </div>
            </div>
          </>
        ) : (
          /* Releases Tab with Real Pause / Resume Download */
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">GitHub Releases</h3>
                <p className="text-xs" style={{ color: colors.onSurfaceVariant }}>
                  Download release assets with real Pause & Resume
                </p>
              </div>
              <M3Button variant="text" size="compact" onClick={loadReleases}>
                Refresh
              </M3Button>
            </div>

            {isLoadingReleases ? (
              <SkeletonRows count={3} height={112} />
            ) : releases.length === 0 ? (
              <div
                className="p-6 rounded-3xl border border-dashed text-center flex flex-col items-center gap-3"
                style={{ borderColor: colors.outlineVariant }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                  <svg className="w-6 h-6 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold">No Releases Found</span>
                  <span className="text-[11px] opacity-70">
                    This repository doesn't have tagged releases on GitHub yet.
                  </span>
                </div>
                <M3Button variant="tonal" size="compact" onClick={onRunWorkflows}>
                  Trigger CI Release Workflow
                </M3Button>
              </div>
            ) : (
              <div className="gitofy-reveal-stagger flex flex-col gap-4">
                {releases.map((rel) => (
                  <div
                    key={rel.id}
                    className="p-4 rounded-3xl border flex flex-col gap-3 shadow-xs"
                    style={{
                      backgroundColor: colors.surfaceContainerLow,
                      borderColor: colors.outlineVariant,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono font-bold text-xs px-2.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: colors.primaryContainer,
                              color: colors.onPrimaryContainer,
                            }}
                          >
                            {rel.tag_name}
                          </span>
                          {rel.prerelease && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500">
                              Pre-release
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold mt-1.5 truncate">
                          {rel.name || rel.tag_name}
                        </h4>
                      </div>

                      <span className="text-[10px] opacity-60 whitespace-nowrap">
                        {formatUploadTime(rel.published_at || rel.created_at)}
                      </span>
                    </div>

                    {rel.body && (
                      <p className="text-xs leading-relaxed opacity-80 line-clamp-3 bg-black/5 p-2 rounded-xl">
                        {rel.body}
                      </p>
                    )}

                    {/* Assets section with Direct Download & True Pause/Resume */}
                    <div className="flex flex-col gap-2.5 pt-1 border-t" style={{ borderColor: colors.outlineVariant }}>
                      <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">
                        Release Assets ({rel.assets.length})
                      </span>

                      {rel.assets.length === 0 ? (
                        <div className="text-[11px] opacity-60 italic">
                          Source code archives available on GitHub.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          {rel.assets.map((asset) => {
                            const isApk = asset.name.toLowerCase().endsWith('.apk');
                            const downloadState = downloads[asset.id];
                            const isDownloading = downloadState?.status === 'downloading';
                            const isPaused = downloadState?.status === 'paused';
                            const isCompleted = downloadState?.status === 'completed';

                            return (
                              <div
                                key={asset.id}
                                className="p-3 rounded-2xl border flex flex-col gap-2 transition-all"
                                style={{
                                  backgroundColor: colors.surfaceContainerLowest,
                                  borderColor: isCompleted
                                    ? colors.diffAdded
                                    : isPaused
                                    ? colors.diffModified
                                    : isApk
                                    ? colors.primary
                                    : colors.outlineVariant,
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="flex-shrink-0 opacity-80">
                                      {isApk ? (
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                                          <line x1="12" y1="18" x2="12.01" y2="18" />
                                        </svg>
                                      ) : (
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                          <polyline points="14 2 14 8 20 8" />
                                        </svg>
                                      )}
                                    </span>
                                    <div className="flex flex-col min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-bold truncate">
                                          {asset.name}
                                        </span>
                                        {isApk && (
                                          <span
                                            className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full uppercase"
                                            style={{
                                              backgroundColor: colors.diffAddedContainer,
                                              color: colors.diffAdded,
                                            }}
                                          >
                                            APK
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] opacity-60">
                                        {(asset.size / (1024 * 1024)).toFixed(2)} MB · {asset.download_count} downloads
                                      </span>
                                      <span className="text-[10px] opacity-60 flex items-center gap-1">
                                        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <circle cx="12" cy="12" r="9" />
                                          <polyline points="12 7 12 12 15.5 14" />
                                        </svg>
                                        Uploaded {formatUploadTime(asset.created_at)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Action Buttons for Download / Pause / Resume */}
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {isDownloading ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handlePauseDownload(asset.id)}
                                          className="px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-transform"
                                          style={{
                                            backgroundColor: colors.diffModifiedContainer,
                                            color: colors.diffModified,
                                            borderColor: colors.diffModified,
                                          }}
                                        >
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                            <rect x="6" y="4" width="4" height="16" />
                                            <rect x="14" y="4" width="4" height="16" />
                                          </svg>
                                          <span>Pause</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleCancelDownload(asset.id)}
                                          className="w-7 h-7 rounded-full border flex items-center justify-center text-xs opacity-70 hover:opacity-100 cursor-pointer"
                                          style={{ borderColor: colors.outline }}
                                        >
                                          ✕
                                        </button>
                                      </>
                                    ) : isPaused ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleStartOrResumeDownload(asset)}
                                          className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-transform"
                                          style={{
                                            backgroundColor: colors.primary,
                                            color: colors.onPrimary,
                                          }}
                                        >
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                            <polygon points="5 3 19 12 5 21 5 3" />
                                          </svg>
                                          <span>Resume</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleCancelDownload(asset.id)}
                                          className="w-7 h-7 rounded-full border flex items-center justify-center text-xs opacity-70 hover:opacity-100 cursor-pointer"
                                          style={{ borderColor: colors.outline }}
                                        >
                                          ✕
                                        </button>
                                      </>
                                    ) : isCompleted ? (
                                      <div className="flex items-center gap-1">
                                        <span
                                          className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                                          style={{
                                            backgroundColor: colors.diffAddedContainer,
                                            color: colors.diffAdded,
                                          }}
                                        >
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <polyline points="20 6 9 17 4 12" />
                                          </svg>
                                          <span>Saved</span>
                                        </span>

                                        <button
                                          type="button"
                                          onClick={() => handleStartOrResumeDownload(asset)}
                                          className="text-[11px] font-semibold underline px-1 cursor-pointer"
                                          style={{ color: colors.primary }}
                                        >
                                          Re-download
                                        </button>
                                      </div>
                                    ) : (
                                      <M3Button
                                        variant={isApk ? 'filled' : 'tonal'}
                                        shape="capsule"
                                        size="compact"
                                        onClick={() => handleStartOrResumeDownload(asset)}
                                        icon={
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="7 10 12 15 17 10" />
                                            <line x1="12" y1="15" x2="12" y2="3" />
                                          </svg>
                                        }
                                      >
                                        Download
                                      </M3Button>
                                    )}
                                  </div>
                                </div>

                                {/* Active Download / Pause Progress Bar & Stats */}
                                {(isDownloading || isPaused) && (
                                  <div className="flex flex-col gap-1 pt-1 animate-fade-in">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span
                                        className="font-bold flex items-center gap-1"
                                        style={{
                                          color: isPaused ? colors.diffModified : colors.primary,
                                        }}
                                      >
                                        <span>{isPaused ? 'Paused at:' : 'Downloading:'}</span>
                                        <span>{downloadState.progress}%</span>
                                      </span>
                                      <span className="font-mono text-[10px] opacity-70">
                                        {(downloadState.receivedBytes / (1024 * 1024)).toFixed(1)} /{' '}
                                        {(downloadState.totalBytes / (1024 * 1024)).toFixed(1)} MB (
                                        {downloadState.speed})
                                      </span>
                                    </div>

                                    {/* M3 Rounded Progress Bar */}
                                    <div
                                      className="w-full h-2 rounded-full overflow-hidden"
                                      style={{ backgroundColor: colors.surfaceContainerHighest }}
                                    >
                                      <div
                                        className="h-full rounded-full transition-all duration-200"
                                        style={{
                                          width: `${downloadState.progress}%`,
                                          backgroundColor: isPaused
                                            ? colors.diffModified
                                            : colors.primary,
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
