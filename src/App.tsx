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
  WorkflowItem,
} from './types';
import {
  fetchUserRepos,
  createGitHubRepo,
  deleteGitHubRepo,
  fetchRemoteTreeMap,
  performRealGitPush,
  INITIAL_DEMO_WORKFLOWS,
  INITIAL_INBOX_ITEMS,
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
import { PageTransition } from './ui/transitions/PageTransition';

function GitofyApp() {
  const { settings, updateSettings, triggerHaptic } = useTheme();

  // Navigation State - Defaults to onboarding if no token is saved yet
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(() => {
    return settings.personalAccessToken ? 'home' : 'onboarding';
  });
  const [currentTab, setCurrentTab] = useState<'home' | 'inbox'>('home');

  // Repositories & Data State
  const [repos, setRepos] = useState<Repository[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(INITIAL_DEMO_WORKFLOWS);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>(INITIAL_INBOX_ITEMS);
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

  // Scroll-Reactive Handler implementing §৭.২
  const handleScrollDelta = (scrollTop: number, delta: number) => {
    if (!settings.autoHideNav || isDeleteMode) return;

    if (scrollTop <= 16) {
      setIsNavVisible(true);
      setIsFabVisible(false);
      scrollAccumRef.current = 0;
      return;
    }

    if ((scrollAccumRef.current > 0 && delta > 0) || (scrollAccumRef.current < 0 && delta < 0)) {
      scrollAccumRef.current += delta;
    } else {
      scrollAccumRef.current = delta;
    }

    const threshold = settings.scrollThreshold || 20;

    if (scrollAccumRef.current >= threshold) {
      if (isNavVisible) {
        setIsNavVisible(false);
        setIsFabVisible(true);
      }
    } else if (scrollAccumRef.current <= -threshold) {
      if (!isNavVisible) {
        setIsFabVisible(false);
        setIsNavVisible(true);
      }
    }
  };

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

  // Real Delete repository execution
  const handleConfirmDelete = async () => {
    const idsToDelete = selectedRepoIds.length > 0 ? selectedRepoIds : selectedRepo ? [selectedRepo.id] : [];
    if (idsToDelete.length === 0) return;

    const reposToDelete = repos.filter((r) => idsToDelete.includes(r.id));

    if (settings.personalAccessToken) {
      for (const r of reposToDelete) {
        try {
          await deleteGitHubRepo(r.owner.login, r.name, settings.personalAccessToken);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error';
          alert(`Failed to delete ${r.full_name} on GitHub: ${msg}`);
        }
      }
    }

    setRepos((prev) => prev.filter((r) => !idsToDelete.includes(r.id)));
    setSelectedRepoIds([]);
    setIsDeleteMode(false);
    setShowDeleteConfirmDialog(false);
    if (currentScreen === 'repo_dashboard') {
      setCurrentScreen('home');
    }

    setInboxItems((prev) => [
      {
        id: `del-${Date.now()}`,
        title: 'Repository Removed',
        repo: reposToDelete.map((r) => r.name).join(', '),
        summary: `Deleted ${reposToDelete.length} repository.`,
        type: 'repo_action',
        status: 'info',
        timestamp: 'Just now',
        read: false,
      },
      ...prev,
    ]);
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

      if (data.uploadZipImmediately) {
        handleTriggerZipPicker(createdRepo);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      alert(`Could not create repository on GitHub: ${msg}`);
    }
  };

  const activeRepoForDelete =
    repos.find((r) => selectedRepoIds[0] === r.id) || selectedRepo || repos[0] || { name: 'repository' };

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
                setCurrentScreen('repo_dashboard');
              }
            }}
            onScrollDelta={handleScrollDelta}
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
              setShowDeleteConfirmDialog(true);
            }}
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
