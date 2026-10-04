import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ThemeProvider, useTheme } from './ui/ThemeContext';
import { AndroidFrame } from './components/AndroidFrame';
import { FloatingNav } from './ui/m3/FloatingNav';
import { FabMenu } from './ui/m3/FabMenu';
import { M3Dialog } from './ui/m3/M3Dialog';
import {
  Repository,
  DiffSummary,
  AppScreen,
  InboxItem,
} from './types';
import {
  fetchUserRepos,
  createGitHubRepo,
  deleteGitHubRepo,
  clearGitHubRepoContents,
  fetchRemoteTreeMap,
  performRealGitPush,
  fetchUserActivityInbox,
} from './git/githubApi';
import { processZipFile, computeSmartDiff, ExtractedFile } from './git/diffEngine';
import { EngineResult } from './git/gitUploadEngine';

// Screens
import { OnboardingScreen } from './screens/OnboardingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { InboxScreen } from './screens/InboxScreen';
import { RepoDashboardScreen } from './screens/RepoDashboardScreen';
import { ZipAnalysisScreen } from './screens/ZipAnalysisScreen';
import { UploadScreen } from './screens/UploadScreen';
import { ResultScreen } from './screens/ResultScreen';
import { WorkflowsScreen } from './screens/WorkflowsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CreateRepoSheet } from './screens/CreateRepoSheet';
import { RepoPickerSheet } from './screens/RepoPickerSheet';
import { M3UploadFlowScreen } from './screens/M3UploadFlowScreen';
import { M3GalleryScreen } from './screens/M3GalleryScreen';
import { MotionLabScreen } from './screens/MotionLabScreen';
import { RepoActionResultScreen, RepoActionKind } from './screens/RepoActionResultScreen';
import { SplashScreen } from './screens/SplashScreen';
import { PageTransition } from './ui/transitions/PageTransition';

function GitofyApp() {
  const { settings, updateSettings, triggerHaptic, colors } = useTheme();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1150);
    return () => window.clearTimeout(timer);
  }, []);

  // Navigation State - Defaults to onboarding if no token is saved yet
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(() => {
    return settings.personalAccessToken ? 'home' : 'onboarding';
  });
  const [currentTab, setCurrentTab] = useState<'home' | 'inbox'>('home');

  // Repositories & Data State
  const [repos, setRepos] = useState<Repository[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const backPressRef = useRef(0);
  const backResetTimerRef = useRef<number | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  // Scroll-Reactive UI Engine State (§৭)
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [isFabVisible, setIsFabVisible] = useState(false);
  const scrollAccumRef = useRef(0);

  // Delete Mode State (§৮.৪.২)
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedRepoIds, setSelectedRepoIds] = useState<number[]>([]);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [repoActionKind, setRepoActionKind] = useState<RepoActionKind>('deleting');
  const [repoActionCompleted, setRepoActionCompleted] = useState(false);
  const [repoActionError, setRepoActionError] = useState<string | null>(null);
  const [repoActionRepo, setRepoActionRepo] = useState<Repository | null>(null);
  const [repoActionContentOnly, setRepoActionContentOnly] = useState(false);

  // Bottom Sheets
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isPickerSheetOpen, setIsPickerSheetOpen] = useState(false);

  // ZIP & Smart Diff State
  const [activeZipFile, setActiveZipFile] = useState<File | null>(null);
  const [extractedLocalFiles, setExtractedLocalFiles] = useState<ExtractedFile[]>([]);
  const [activeDiffSummary, setActiveDiffSummary] = useState<DiffSummary | null>(null);
  const [activeCommitMessage, setActiveCommitMessage] = useState('');
  const [lastUploadedSha, setLastUploadedSha] = useState('latest');
  const [lastEngineResult, setLastEngineResult] = useState<EngineResult | null>(null);

  // Hidden file input for real ZIP selection
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingTargetRepoRef = useRef<Repository | null>(null);

  // Load real GitHub repositories
  const loadRepositories = useCallback(async () => {
    if (!settings.personalAccessToken) {
      setRepos([]);
      return;
    }

    setIsLoadingRepos(true);
    try {
      const realRepos = await fetchUserRepos(settings.personalAccessToken);
      setRepos(realRepos);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load';
      console.warn('Could not load repos from GitHub:', msg);
    } finally {
      setIsLoadingRepos(false);
    }
  }, [settings.personalAccessToken]);

  useEffect(() => {
    if (settings.personalAccessToken) {
      loadRepositories();
    }
  }, [loadRepositories, settings.personalAccessToken]);

  // Scroll-Reactive Handler: keep high-frequency scroll work outside React state.
  const handleScrollDelta = useCallback((scrollTop: number, delta: number) => {
    if (!settings.autoHideNav || isDeleteMode) return;

    if (scrollTop <= 16) {
      scrollAccumRef.current = 0;
      if (!isNavVisible) {
        setIsNavVisible(true);
        setIsFabVisible(false);
      }
      return;
    }

    if ((scrollAccumRef.current > 0 && delta > 0) || (scrollAccumRef.current < 0 && delta < 0)) {
      scrollAccumRef.current += delta;
    } else {
      scrollAccumRef.current = delta;
    }

    const threshold = settings.scrollThreshold || 20;
    if (scrollAccumRef.current >= threshold && isNavVisible) {
      setIsNavVisible(false);
      setIsFabVisible(true);
      scrollAccumRef.current = 0;
    } else if (scrollAccumRef.current <= -threshold && !isNavVisible) {
      setIsFabVisible(false);
      setIsNavVisible(true);
      scrollAccumRef.current = 0;
    }
  }, [settings.autoHideNav, settings.scrollThreshold, isDeleteMode, isNavVisible]);

  // Real GitHub inbox + Actions activity, refreshed periodically while the app is open.
  const refreshInbox = useCallback(async () => {
    if (!settings.personalAccessToken) {
      setInboxItems([]);
      return;
    }
    try {
      const liveItems = await fetchUserActivityInbox(repos, settings.personalAccessToken);
      setInboxItems((prev) => liveItems.map((item) => {
        const existing = prev.find((p) => p.id === item.id);
        return existing ? { ...item, read: existing.read } : item;
      }));
    } catch (err) {
      console.warn('Could not refresh GitHub inbox:', err);
    }
  }, [repos, settings.personalAccessToken]);

  useEffect(() => {
    if (!settings.personalAccessToken) return;
    refreshInbox();
    const timer = window.setInterval(refreshInbox, 20000);
    return () => window.clearInterval(timer);
  }, [refreshInbox, settings.personalAccessToken]);

  // Android back bridge: first back returns to Home, second back opens the M3 exit dialog.
  useEffect(() => {
    const handleAndroidBack = () => {
      if (currentScreen === 'onboarding') return;
      if (backResetTimerRef.current) window.clearTimeout(backResetTimerRef.current);
      backPressRef.current += 1;
      if (backPressRef.current >= 2) {
        backPressRef.current = 0;
        setShowExitDialog(true);
        return;
      }
      if (currentScreen !== 'home') {
        setCurrentScreen('home');
        setCurrentTab('home');
        setIsNavVisible(true);
      }
      backResetTimerRef.current = window.setTimeout(() => { backPressRef.current = 0; }, 1600);
    };
    window.addEventListener('androidback', handleAndroidBack);
    return () => window.removeEventListener('androidback', handleAndroidBack);
  }, [currentScreen]);

  // ZIP Selection & Parsing
  const handleTriggerZipPicker = (targetRepo: Repository) => {
    pendingTargetRepoRef.current = targetRepo;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActiveZipFile(file);

    const targetRepo = pendingTargetRepoRef.current || selectedRepo || repos[0];
    if (!targetRepo) {
      alert('Please select or create a target repository first.');
      return;
    }

    setSelectedRepo(targetRepo);
    setIsNavVisible(false);
    triggerHaptic('tick');
    setCurrentScreen('upload_flow');
  };

  const beginRepoAction = (kind: RepoActionKind, repo: Repository) => {
    setRepoActionKind(kind);
    setRepoActionRepo(repo);
    setRepoActionCompleted(false);
    setRepoActionError(null);
    setCurrentScreen('repo_action');
    setIsNavVisible(false);
  };

  const handleLongPressRepo = (repo: Repository) => {
    setSelectedRepo(repo);
    setSelectedRepoIds([repo.id]);
    setIsDeleteMode(false);
    setRepoActionRepo(repo);
    setCurrentScreen('delete_repo');
    setIsNavVisible(false);
    triggerHaptic('heavy');
  };

  const handleDeleteSingleRepo = async (repoOverride?: Repository) => {
    const repo = repoOverride || repoActionRepo;
    if (!repo || !settings.personalAccessToken) return;
    setRepoActionKind('deleting');
    setRepoActionCompleted(false);
    setRepoActionError(null);
    try {
      await deleteGitHubRepo(repo.owner.login, repo.name, settings.personalAccessToken);
      setRepos((prev) => prev.filter((r) => r.id !== repo.id));
      setSelectedRepo(null);
      setSelectedRepoIds([]);
      setRepoActionCompleted(true);
      setInboxItems((prev) => [{
        id: `del-${Date.now()}`, title: 'Repository Deleted', repo: repo.full_name,
        summary: `Deleted ${repo.name} from GitHub.`, type: 'repo_action', status: 'success', timestamp: 'Just now', read: false,
      }, ...prev]);
    } catch (err) {
      setRepoActionError(err instanceof Error ? err.message : 'Repository deletion failed.');
    }
  };

  const handleDeleteContents = async () => {
    const repo = selectedRepo;
    if (!repo || !settings.personalAccessToken) return;
    setRepoActionKind('deleting');
    setRepoActionContentOnly(true);
    setRepoActionRepo(repo);
    setRepoActionCompleted(false);
    setRepoActionError(null);
    setCurrentScreen('repo_action');
    setIsNavVisible(false);
    try {
      await clearGitHubRepoContents(repo.owner.login, repo.name, repo.default_branch || 'main', settings.personalAccessToken);
      setRepos((prev) => prev.map((r) => r.id === repo.id ? { ...r, last_commit: undefined, action_status: null, updated_at: new Date().toISOString() } : r));
      setRepoActionCompleted(true);
      setInboxItems((prev) => [{
        id: `clear-${Date.now()}`, title: 'Repository Content Cleared', repo: repo.full_name,
        summary: 'All tracked files, folders and workflow files were removed in one cleanup commit.', type: 'repo_action', status: 'success', timestamp: 'Just now', read: false,
      }, ...prev]);
    } catch (err) {
      setRepoActionError(err instanceof Error ? err.message : 'Could not clear repository contents.');
    }
  };

  // Real Delete repository execution — remove from UI immediately, then delete remotely in parallel.
  const handleConfirmDelete = async () => {
    const idsToDelete = selectedRepoIds.length > 0 ? selectedRepoIds : selectedRepo ? [selectedRepo.id] : [];
    if (idsToDelete.length === 0) return;

    const reposToDelete = repos.filter((r) => idsToDelete.includes(r.id));
    if (reposToDelete.length === 1) {
      setShowDeleteConfirmDialog(false);
      setRepoActionRepo(reposToDelete[0]);
      setRepoActionKind('deleting');
      setRepoActionCompleted(false);
      setRepoActionError(null);
      setCurrentScreen('repo_action');
      setIsNavVisible(false);
      await handleDeleteSingleRepo(reposToDelete[0]);
      return;
    }
    setRepos((prev) => prev.filter((r) => !idsToDelete.includes(r.id)));
    setSelectedRepoIds([]);
    setIsDeleteMode(false);
    setShowDeleteConfirmDialog(false);
    if (currentScreen === 'repo_dashboard') setCurrentScreen('home');

    if (settings.personalAccessToken) {
      const results = await Promise.allSettled(
        reposToDelete.map((r) => deleteGitHubRepo(r.owner.login, r.name, settings.personalAccessToken))
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        await loadRepositories();
        setInboxItems((prev) => [{
          id: `del-failed-${Date.now()}`,
          title: 'Repository deletion failed',
          repo: reposToDelete.map((r) => r.name).join(', '),
          summary: `${failed.length} repository deletion request(s) failed.`,
          type: 'repo_action', status: 'failure', timestamp: 'Just now', read: false,
        }, ...prev]);
        return;
      }
    }

    setInboxItems((prev) => [{
      id: `del-${Date.now()}`,
      title: 'Repository Removed',
      repo: reposToDelete.map((r) => r.name).join(', '),
      summary: `Deleted ${reposToDelete.length} repository.`,
      type: 'repo_action', status: 'info', timestamp: 'Just now', read: false,
    }, ...prev]);
  };

  // Real Create Repository execution
  const handleCreateRepo = async (data: {
    name: string;
    description: string;
    isPrivate: boolean;
    autoInit: boolean;
    uploadZipImmediately: boolean;
    language?: string;
  }) => {
    try {
      setRepoActionKind('created');
      setRepoActionContentOnly(false);
      setRepoActionCompleted(false);
      setRepoActionError(null);
      setRepoActionRepo({
        id: Date.now(), name: data.name, full_name: `${settings.githubUsername || 'user'}/${data.name}`, description: data.description,
        private: data.isPrivate, fork: false, archived: false, html_url: `https://github.com/${settings.githubUsername || 'user'}/${data.name}`,
        default_branch: settings.defaultBranch || 'main', stargazers_count: 0, forks_count: 0, language: data.language || null, updated_at: new Date().toISOString(),
        owner: { login: settings.githubUsername || 'user', avatar_url: settings.avatarUrl || '' }, action_status: null
      });
      setCurrentScreen('repo_action');
      setIsNavVisible(false);
      let createdRepo: Repository;

      if (settings.personalAccessToken) {
        createdRepo = await createGitHubRepo(data, settings.personalAccessToken);
      } else {
        createdRepo = {
          id: Date.now(),
          name: data.name,
          full_name: `${settings.githubUsername || 'user'}/${data.name}`,
          description: data.description,
          private: data.isPrivate,
          fork: false,
          archived: false,
          html_url: `https://github.com/${settings.githubUsername || 'user'}/${data.name}`,
          default_branch: settings.defaultBranch || 'main',
          stargazers_count: 0,
          forks_count: 0,
          language: data.language || null,
          updated_at: new Date().toISOString(),
          owner: {
            login: settings.githubUsername || 'user',
            avatar_url: settings.avatarUrl || '',
          },
          last_commit: {
            sha: 'initial',
            message: 'Initial commit (auto_init with README.md)',
            date: 'Just now',
          },
          action_status: null,
        };
      }

      setRepos((prev) => [createdRepo, ...prev]);
      setRepoActionRepo(createdRepo);
      setRepoActionCompleted(true);

      setInboxItems((prev) => [
        {
          id: `create-${Date.now()}`,
          title: 'Repository Created',
          repo: createdRepo.full_name,
          summary: `Created repository ${createdRepo.name} on GitHub.`,
          type: 'repo_action',
          status: 'success',
          timestamp: 'Just now',
          read: false,
        },
        ...prev,
      ]);

      // Creation completion screen intentionally routes to the new repository via Continue.
      void data.uploadZipImmediately;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      setRepoActionError(msg);
    }
  };

  const activeRepoForDelete =
    repos.find((r) => selectedRepoIds[0] === r.id) || selectedRepo || repos[0] || { name: 'repository' };

  if (showSplash) {
    return (
      <AndroidFrame>
        <SplashScreen />
      </AndroidFrame>
    );
  }

  return (
    <AndroidFrame>
      {/* Hidden File Input for Real Device ZIP Selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFilePicked}
        className="hidden"
      />

      {/* Screen Switcher with Fluid Material 3 Page Transitions */}
      <PageTransition
        viewKey={currentScreen + (currentScreen === 'home' ? currentTab : '')}
      >
        {currentScreen === 'onboarding' && (
          <OnboardingScreen
            onComplete={(pat, username, avatarUrl) => {
              updateSettings({
                personalAccessToken: pat,
                githubUsername: username,
                avatarUrl,
              });
              setCurrentScreen('home');
            }}
          />
        )}

        {currentScreen === 'home' && currentTab === 'home' && (
          <HomeScreen
            repos={repos}
            isLoading={isLoadingRepos}
            onRefresh={loadRepositories}
            onSelectRepo={(r) => {
              setSelectedRepo(r);
              setCurrentScreen('repo_dashboard');
            }}
            onLongPressRepo={handleLongPressRepo}
            onCreateRepo={() => setIsCreateSheetOpen(true)}
            onDeleteRepos={(ids) => {
              setSelectedRepoIds(ids);
              setShowDeleteConfirmDialog(true);
            }}
            onOpenSettings={() => setCurrentScreen('settings')}
            onScrollDelta={handleScrollDelta}
            isDeleteMode={isDeleteMode}
            setIsDeleteMode={setIsDeleteMode}
            selectedRepoIds={selectedRepoIds}
            setSelectedRepoIds={setSelectedRepoIds}
          />
        )}

        {currentScreen === 'home' && currentTab === 'inbox' && (
          <InboxScreen
            items={inboxItems}
            onMarkAllRead={() => {
              setInboxItems((prev) => prev.map((item) => ({ ...item, read: true })));
            }}
            onItemClick={(item) => {
              setInboxItems((prev) =>
                prev.map((i) => (i.id === item.id ? { ...i, read: true } : i))
              );
            }}
            onDeleteItem={(id) => {
              setInboxItems((prev) => prev.filter((i) => i.id !== id));
            }}
            onNavigateToRepo={(repoIdentifier) => {
              const matchedRepo = repos.find(
                (r) =>
                  r.name === repoIdentifier ||
                  r.full_name === repoIdentifier ||
                  repoIdentifier.includes(r.name) ||
                  r.full_name.includes(repoIdentifier)
              );
              if (matchedRepo) {
                setSelectedRepo(matchedRepo);
                setIsNavVisible(true);
                setCurrentScreen('repo_dashboard');
              }
            }}
            onScrollDelta={handleScrollDelta}
            onDetailVisibilityChange={(open) => {
              setIsNavVisible(!open);
              setIsFabVisible(false);
            }}
          />
        )}

        {currentScreen === 'repo_dashboard' && selectedRepo && (
          <RepoDashboardScreen
            repo={selectedRepo}
            onBack={() => setCurrentScreen('home')}
            onUpdateWithZip={() => handleTriggerZipPicker(selectedRepo)}
            onRunWorkflows={() => setCurrentScreen('workflows')}
            onDeleteRepo={() => {
              setSelectedRepoIds([selectedRepo.id]);
              setRepoActionRepo(selectedRepo);
              setShowDeleteConfirmDialog(true);
            }}
            onDeleteContents={handleDeleteContents}
            onShareRepo={() => {
              const shareText = selectedRepo.html_url;
              const bridge = (window as Window & { GitofyAndroid?: { shareText?: (title: string, text: string) => void } }).GitofyAndroid;
              if (bridge?.shareText) bridge.shareText(selectedRepo.name, shareText);
              else if (navigator.share) navigator.share({ title: selectedRepo.name, url: shareText }).catch(() => undefined);
              else navigator.clipboard?.writeText(shareText);
            }}
          />
        )}

        {currentScreen === 'delete_repo' && repoActionRepo && (
          <div className="flex-1 flex flex-col overflow-y-auto p-6 animate-fade-in">
            <div className="flex items-center gap-3 pt-2">
              <button type="button" className="w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ color: colors.onSurface, backgroundColor: colors.surfaceContainerHigh }} onClick={() => { setCurrentScreen('home'); setIsNavVisible(true); }}>
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              </button>
              <h1 className="text-xl font-black">Delete repository</h1>
            </div>
            <div className="flex-1 flex flex-col justify-center items-center text-center gap-5">
              <div className="w-28 h-28 rounded-[34px] flex items-center justify-center" style={{ backgroundColor: colors.errorContainer, color: colors.error }}><svg className="w-14 h-14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></div>
              <div><h2 className="text-2xl font-black">Delete {repoActionRepo.name}?</h2><p className="mt-2 text-sm" style={{ color: colors.onSurfaceVariant }}>This permanently deletes the GitHub repository.</p></div>
            </div>
            <M3Button variant="destructive-filled" shape="capsule" size="large" className="w-full font-bold" onClick={handleDeleteSingleRepo}>Delete repository</M3Button>
          </div>
        )}

        {currentScreen === 'repo_action' && repoActionRepo && (
          <RepoActionResultScreen
            kind={repoActionKind}
            repoName={repoActionRepo.full_name || repoActionRepo.name}
            isPrivate={repoActionRepo.private}
            completed={repoActionCompleted}
            error={repoActionError}
            contentOnly={repoActionContentOnly}
            onContinue={() => {
              setRepoActionError(null);
              setIsNavVisible(true);
              if (repoActionKind === 'created') { setSelectedRepo(repoActionRepo); setCurrentScreen('repo_dashboard'); }
              else if (repoActionContentOnly) { setSelectedRepo(repoActionRepo); setCurrentScreen('repo_dashboard'); }
              else { setSelectedRepo(null); setCurrentScreen('home'); }
            }}
            onRetry={repoActionKind === 'deleting' ? handleDeleteSingleRepo : () => { if (repoActionRepo) void handleCreateRepo({ name: repoActionRepo.name, description: repoActionRepo.description || '', isPrivate: repoActionRepo.private, autoInit: false, uploadZipImmediately: false, language: repoActionRepo.language || undefined }); }}
          />
        )}

        {currentScreen === 'zip_analysis' && selectedRepo && activeDiffSummary && (
          <ZipAnalysisScreen
            repoName={selectedRepo.name}
            diffSummary={activeDiffSummary}
            onBack={() => setCurrentScreen('repo_dashboard')}
            onProceedToUpload={(msg) => {
              setActiveCommitMessage(msg);
              setCurrentScreen('upload');
            }}
          />
        )}

        {currentScreen === 'upload' && selectedRepo && activeDiffSummary && (
          <UploadScreen
            repoName={selectedRepo.full_name || selectedRepo.name}
            branch={selectedRepo.default_branch || settings.defaultBranch || 'main'}
            commitMessage={activeCommitMessage}
            diffSummary={activeDiffSummary}
            zipFile={activeZipFile}
            onSuccess={(sha, result) => {
              setLastUploadedSha(sha);
              setLastEngineResult(result || null);
              setRepos((prev) =>
                prev.map((r) =>
                  r.id === selectedRepo.id
                    ? {
                        ...r,
                        last_commit: {
                          sha,
                          message: activeCommitMessage,
                          date: 'Just now',
                        },
                        action_status: 'running',
                      }
                    : r
                )
              );
              setInboxItems((prev) => [
                {
                  id: `push-${Date.now()}`,
                  title: 'Ultra-Fast Git Push Succeeded',
                  repo: selectedRepo.full_name,
                  summary: `Commit ${sha} pushed via Git Smart HTTP to branch ${selectedRepo.default_branch}. 100% verified.`,
                  type: 'push',
                  status: 'success',
                  timestamp: 'Just now',
                  read: false,
                  details: result?.speed ? `Speed: ${result.speed} • Files: ${result.totalFiles}` : undefined,
                },
                ...prev,
              ]);
              setCurrentScreen('result');
            }}
            onCancel={() => setCurrentScreen('zip_analysis')}
          />
        )}

        {currentScreen === 'result' && selectedRepo && activeDiffSummary && (
          <ResultScreen
            repoName={selectedRepo.full_name || selectedRepo.name}
            branch={selectedRepo.default_branch || settings.defaultBranch || 'main'}
            commitSha={lastUploadedSha}
            filesCount={
              lastEngineResult?.totalFiles ||
              activeDiffSummary.added + activeDiffSummary.modified ||
              activeDiffSummary.totalFiles
            }
            engineResult={lastEngineResult}
            onDone={() => {
              setCurrentScreen('home');
              setIsNavVisible(true);
            }}
            onRunWorkflows={() => setCurrentScreen('workflows')}
          />
        )}

        {currentScreen === 'workflows' && selectedRepo && (
          <WorkflowsScreen
            repoName={selectedRepo.full_name || selectedRepo.name}
            onBack={() => setCurrentScreen('repo_dashboard')}
          />
        )}

        {currentScreen === 'upload_flow' && selectedRepo && activeZipFile && (
          <M3UploadFlowScreen
            repo={selectedRepo}
            zipFile={activeZipFile}
            onSuccess={(sha, result) => {
              setLastUploadedSha(sha);
              setLastEngineResult(result || null);
              setRepos((prev) =>
                prev.map((r) =>
                  r.id === selectedRepo.id
                    ? {
                        ...r,
                        last_commit: {
                          sha,
                          message: `Update ${selectedRepo.name} via Gitofy`,
                          date: 'Just now',
                        },
                        action_status: 'running',
                      }
                    : r
                )
              );
              setInboxItems((prev) => [
                {
                  id: `push-${Date.now()}`,
                  title: 'Ultra-Fast Git Push Succeeded',
                  repo: selectedRepo.full_name,
                  summary: `Commit ${sha} pushed via Git Smart HTTP to branch ${selectedRepo.default_branch}. 100% verified.`,
                  type: 'push',
                  status: 'success',
                  timestamp: 'Just now',
                  read: false,
                  details: result?.speed ? `Speed: ${result.speed} • Files: ${result.totalFiles}` : undefined,
                },
                ...prev,
              ]);
            }}
            onCancel={() => {
              setCurrentScreen('repo_dashboard');
              setIsNavVisible(true);
            }}
            onRunWorkflows={() => setCurrentScreen('workflows')}
          />
        )}

        {currentScreen === 'settings' && (
          <SettingsScreen
            onBack={() => setCurrentScreen('home')}
            onTokenUpdated={loadRepositories}
            onOpenGallery={() => setCurrentScreen('m3_gallery')}
            onOpenMotionLab={() => setCurrentScreen('motion_lab')}
            onLogout={() => {
              updateSettings({ personalAccessToken: '', githubUsername: '', avatarUrl: '' });
              setRepos([]);
              setInboxItems([]);
              setSelectedRepo(null);
              setCurrentTab('home');
              setCurrentScreen('onboarding');
              setIsNavVisible(true);
            }}
          />
        )}

        {currentScreen === 'm3_gallery' && (
          <M3GalleryScreen onBack={() => setCurrentScreen('settings')} />
        )}

        {currentScreen === 'motion_lab' && (
          <MotionLabScreen onBack={() => setCurrentScreen('settings')} />
        )}
      </PageTransition>

      {/* Floating Capsule Navigation Bar (§৫.৮) - visible on Home & Inbox */}
      {currentScreen === 'home' && !isDeleteMode && (
        <FloatingNav
          currentTab={currentTab}
          onTabChange={(tab) => setCurrentTab(tab)}
          visible={isNavVisible}
          unreadCount={inboxItems.filter((i) => !i.read).length}
        />
      )}

      {/* Scroll-Reactive FAB Menu (§৫.৯ & §৭) */}
      {currentScreen === 'home' && !isDeleteMode && (
        <FabMenu
          visible={isFabVisible || repos.length <= 2}
          onCreateRepo={() => setIsCreateSheetOpen(true)}
          onDeleteRepo={() => {
            triggerHaptic('heavy');
            setIsDeleteMode(true);
          }}
          onUpdateRepo={() => setIsPickerSheetOpen(true)}
          onUploadProject={() => {
            if (repos.length > 0) {
              handleTriggerZipPicker(repos[0]);
            } else {
              setIsCreateSheetOpen(true);
            }
          }}
        />
      )}

      {/* Create Repo Bottom Sheet (§৮.৪.১) */}
      <CreateRepoSheet
        isOpen={isCreateSheetOpen}
        onClose={() => setIsCreateSheetOpen(false)}
        onCreate={handleCreateRepo}
      />

      {/* Repo Picker Bottom Sheet (§৮.৪.৩) */}
      <RepoPickerSheet
        isOpen={isPickerSheetOpen}
        onClose={() => setIsPickerSheetOpen(false)}
        repos={repos}
        onSelectRepo={(r) => handleTriggerZipPicker(r)}
      />

      <M3Dialog
        isOpen={showExitDialog}
        title="Are you really want to exit?"
        description="Your current Gitofy session will be closed."
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => {
          setShowExitDialog(false);
          const bridge = (window as Window & { GitofyAndroid?: { exitApp?: () => void } }).GitofyAndroid;
          bridge?.exitApp?.();
        }}
        onCancel={() => setShowExitDialog(false)}
      />

      {/* Double-Confirmation Delete Dialog */}
      <M3Dialog
        isOpen={showDeleteConfirmDialog}
        title={`Delete ${activeRepoForDelete.name}?`}
        description="This action cannot be undone. Code, issues, workflows, and PRs will be permanently removed. Type repository name to confirm:"
        confirmWord={activeRepoForDelete.name}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirmDialog(false)}
      />
    </AndroidFrame>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <GitofyApp />
    </ThemeProvider>
  );
}
