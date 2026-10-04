import React, { useState, useEffect } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { WorkflowItem, WorkflowRun } from '../types';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import {
  fetchRepoWorkflows,
  fetchWorkflowRuns,
  triggerWorkflowDispatch,
  fetchRunArtifacts,
  rerunWorkflowRun,
  cancelWorkflowRun,
} from '../git/githubApi';

export interface WorkflowsScreenProps {
  repoName: string;
  onBack: () => void;
}

export const WorkflowsScreen: React.FC<WorkflowsScreenProps> = ({
  repoName,
  onBack,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowItem | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(settings.defaultBranch || 'main');
  const [artifactsMap, setArtifactsMap] = useState<Record<number, any[]>>({});
  const [loadingArtifactsRunId, setLoadingArtifactsRunId] = useState<number | null>(null);
  const [statusNotification, setStatusNotification] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);

  const parts = repoName.split('/');
  const owner = parts.length > 1 ? parts[0] : settings.githubUsername || 'user';
  const repo = parts.length > 1 ? parts[1] : repoName;

  // Load repository workflows on mount
  useEffect(() => {
    loadWorkflows();
  }, [repoName]);

  const loadWorkflows = async () => {
    setIsLoadingWorkflows(true);
    try {
      const data = await fetchRepoWorkflows(owner, repo, settings.personalAccessToken);
      setWorkflows(data);
      if (data.length > 0 && !selectedWorkflow) {
        setSelectedWorkflow(data[0]);
        loadRuns(data[0]);
      }
    } catch (err: unknown) {
      console.warn('Failed to load workflows:', err);
    } finally {
      setIsLoadingWorkflows(false);
    }
  };

  const loadRuns = async (wf: WorkflowItem) => {
    setIsLoadingRuns(true);
    try {
      const workflowKey = wf.path ? wf.path.split('/').pop() || wf.id : wf.id;
      const runsData = await fetchWorkflowRuns(
        owner,
        repo,
        workflowKey,
        settings.personalAccessToken
      );
      setRuns(runsData);
    } catch (err: unknown) {
      console.warn('Failed to load runs:', err);
    } finally {
      setIsLoadingRuns(false);
    }
  };

  const handleSelectWorkflow = (wf: WorkflowItem) => {
    triggerHaptic('tick');
    setSelectedWorkflow(wf);
    setStatusNotification(null);
    loadRuns(wf);
  };

  // Real GitHub Actions Dispatch Execution
  const handleDispatch = async (targetWf?: WorkflowItem) => {
    const wf = targetWf || selectedWorkflow || workflows[0];
    if (!wf) return;

    triggerHaptic('click');
    setIsDispatching(true);
    setStatusNotification(null);

    try {
      const workflowFile = wf.path.split('/').pop() || wf.path;
      const res = await triggerWorkflowDispatch(
        owner,
        repo,
        workflowFile,
        selectedBranch,
        settings.personalAccessToken
      );

      triggerHaptic('success');
      setStatusNotification({ text: res.message, isError: false });

      // Add immediate optimistic run to the top
      const optimisticRun: WorkflowRun = {
        id: Date.now(),
        name: wf.name,
        workflow_id: wf.id,
        head_branch: selectedBranch,
        head_sha: 'latest',
        event: 'workflow_dispatch',
        status: 'queued',
        conclusion: null,
        html_url: `https://github.com/${owner}/${repo}/actions`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        run_number: (runs[0]?.run_number || 0) + 1,
        actor: {
          login: settings.githubUsername || 'user',
          avatar_url: settings.avatarUrl || '',
        },
        head_commit: {
          id: 'manual',
          message: `Manual dispatch via Gitofy (${wf.name})`,
          timestamp: new Date().toISOString(),
        },
      };

      setRuns((prev) => [optimisticRun, ...prev]);

      // Poll after 3 seconds for GitHub runner confirmation
      setTimeout(() => {
        loadRuns(wf);
      }, 3500);
    } catch (err: unknown) {
      triggerHaptic('error');
      const msg = err instanceof Error ? err.message : 'Dispatch failed';
      setStatusNotification({ text: msg, isError: true });
    } finally {
      setIsDispatching(false);
    }
  };

  const handleLoadArtifacts = async (runId: number) => {
    triggerHaptic('tick');
    setLoadingArtifactsRunId(runId);
    try {
      const artifacts = await fetchRunArtifacts(owner, repo, runId, settings.personalAccessToken);
      setArtifactsMap((prev) => ({ ...prev, [runId]: artifacts }));
    } catch {
      // ignore
    } finally {
      setLoadingArtifactsRunId(null);
    }
  };

  const handleRerun = async (runId: number, failedOnly = false) => {
    if (!settings.personalAccessToken) return;
    triggerHaptic('click');
    const success = await rerunWorkflowRun(owner, repo, runId, settings.personalAccessToken, failedOnly);
    if (success) {
      triggerHaptic('success');
      setStatusNotification({ text: `Run #${runId} re-triggered!`, isError: false });
      if (selectedWorkflow) setTimeout(() => loadRuns(selectedWorkflow), 2000);
    }
  };

  const handleCancel = async (runId: number) => {
    if (!settings.personalAccessToken) return;
    triggerHaptic('heavy');
    const success = await cancelWorkflowRun(owner, repo, runId, settings.personalAccessToken);
    if (success) {
      triggerHaptic('tick');
      setStatusNotification({ text: `Run #${runId} cancel requested.`, isError: false });
      if (selectedWorkflow) setTimeout(() => loadRuns(selectedWorkflow), 1500);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto overscroll-contain select-none animate-fade-in">
      {/* Top App Bar */}
      <div
        className="sticky top-0 z-30 px-4 py-3 backdrop-blur-md border-b flex items-center justify-between"
        style={{
          backgroundColor: `${colors.surface}f0`,
          borderColor: colors.outlineVariant,
        }}
      >
        <div className="flex items-center gap-2">
          <M3IconButton aria-label="Back" onClick={onBack}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </M3IconButton>
          <div>
            <h2 className="text-base font-bold">GitHub Actions</h2>
            <p className="text-[10px] font-mono opacity-70 truncate max-w-[180px]">{repoName}</p>
          </div>
        </div>

        {/* Header Action: Run Workflow Button */}
        <div className="flex items-center gap-1.5">
          <M3Button
            variant="filled"
            shape="capsule"
            size="compact"
            loading={isDispatching}
            onClick={() => handleDispatch()}
            icon={
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            }
          >
            Run workflow
          </M3Button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-4 pb-28">
        {/* Status Banner */}
        {statusNotification && (
          <div
            className="p-3 rounded-2xl border text-xs font-bold flex items-center gap-2 animate-scale-in"
            style={{
              backgroundColor: statusNotification.isError
                ? colors.errorContainer
                : colors.diffAddedContainer,
              borderColor: statusNotification.isError ? colors.error : colors.diffAdded,
              color: statusNotification.isError ? colors.error : colors.diffAdded,
            }}
          >
            {statusNotification.isError ? (
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            <span className="flex-1 leading-relaxed">{statusNotification.text}</span>
          </div>
        )}

        {/* Branch Selector & Dispatch Config Header */}
        <div
          className="p-4 rounded-3xl border flex items-center justify-between gap-3"
          style={{
            backgroundColor: colors.surfaceContainerLow,
            borderColor: colors.outlineVariant,
          }}
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase opacity-70">Target Branch</span>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="text-xs font-mono font-bold bg-transparent border-none outline-none cursor-pointer p-0"
                style={{ color: colors.primary }}
              >
                <option value="main">main</option>
                <option value="master">master</option>
                <option value="develop">develop</option>
              </select>
            </div>
          </div>

          <span
            className="text-[10px] font-mono font-bold px-2 py-1 rounded-full border"
            style={{
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.outlineVariant,
              color: colors.onSurfaceVariant,
            }}
          >
            workflow_dispatch
          </span>
        </div>

        {/* Workflows Navigation Chips/Cards */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
              Repository Workflows ({workflows.length})
            </span>
            <button
              type="button"
              onClick={loadWorkflows}
              className="text-xs font-semibold hover:underline cursor-pointer"
              style={{ color: colors.primary }}
            >
              Refresh
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {workflows.map((wf) => {
              const isSelected = selectedWorkflow?.id === wf.id;

              return (
                <div
                  key={wf.id}
                  onClick={() => handleSelectWorkflow(wf)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected ? 'ring-2' : ''
                  }`}
                  style={{
                    backgroundColor: isSelected
                      ? colors.surfaceContainerHigh
                      : colors.surfaceContainerLowest,
                    borderColor: isSelected ? colors.primary : colors.outlineVariant,
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: isSelected ? colors.primaryContainer : colors.surfaceContainerHighest,
                        color: isSelected ? colors.onPrimaryContainer : colors.primary,
                        borderColor: colors.outlineVariant,
                      }}
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold truncate">{wf.name}</span>
                      <span className="text-[10px] font-mono opacity-60 truncate">{wf.path}</span>
                    </div>
                  </div>

                  {/* Individual Workflow Run Button */}
                  <M3Button
                    variant={isSelected ? 'filled' : 'tonal'}
                    shape="capsule"
                    size="compact"
                    loading={isDispatching && selectedWorkflow?.id === wf.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDispatch(wf);
                    }}
                    icon={
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    }
                  >
                    Run
                  </M3Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Workflow Runs History (Past & Present) */}
        {selectedWorkflow && (
          <div className="flex flex-col gap-2.5 pt-2">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
                  Execution Runs &middot; {selectedWorkflow.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => loadRuns(selectedWorkflow)}
                className="text-xs font-semibold hover:underline cursor-pointer"
                style={{ color: colors.primary }}
              >
                Reload Runs
              </button>
            </div>

            {isLoadingRuns ? (
              <div className="p-8 text-center text-xs opacity-70 flex flex-col items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" style={{ color: colors.primary }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Fetching real runs from GitHub Actions...</span>
              </div>
            ) : runs.length === 0 ? (
              <div
                className="p-6 rounded-3xl border border-dashed text-center flex flex-col items-center gap-2.5"
                style={{ borderColor: colors.outlineVariant }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: colors.surfaceContainerHighest }}
                >
                  <svg className="w-6 h-6 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold">No runs executed yet</span>
                  <span className="text-[11px] opacity-70">
                    Tap "Run workflow" above to trigger your first execution on GitHub.
                  </span>
                </div>
                <M3Button
                  variant="filled"
                  shape="capsule"
                  size="compact"
                  onClick={() => handleDispatch(selectedWorkflow)}
                >
                  Run this workflow now
                </M3Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {runs.map((run) => {
                  const isInProgress = run.status === 'in_progress' || run.status === 'queued';
                  const isSuccess = run.conclusion === 'success';
                  const isFailure = run.conclusion === 'failure';

                  return (
                    <div
                      key={run.id}
                      className="p-3.5 rounded-2xl border flex flex-col gap-2.5 transition-all"
                      style={{
                        backgroundColor: colors.surfaceContainerLowest,
                        borderColor: isInProgress
                          ? colors.primary
                          : isSuccess
                          ? colors.diffAdded
                          : isFailure
                          ? colors.error
                          : colors.outlineVariant,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Status Icon Indicator */}
                          <div className="flex-shrink-0">
                            {isInProgress ? (
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" style={{ color: colors.primary }}>
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : isSuccess ? (
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center font-bold"
                                style={{ backgroundColor: colors.diffAddedContainer, color: colors.diffAdded }}
                              >
                                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            ) : (
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center font-bold"
                                style={{ backgroundColor: colors.errorContainer, color: colors.error }}
                              >
                                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </div>
                            )}
                          </div>

                          <span className="text-xs font-bold truncate">
                            #{run.run_number} &middot; {run.head_commit?.message || run.name}
                          </span>
                        </div>

                        {/* Status Label */}
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
                          style={{
                            backgroundColor: isInProgress
                              ? colors.primaryContainer
                              : isSuccess
                              ? colors.diffAddedContainer
                              : colors.errorContainer,
                            color: isInProgress
                              ? colors.onPrimaryContainer
                              : isSuccess
                              ? colors.diffAdded
                              : colors.error,
                          }}
                        >
                          {isInProgress ? 'In Progress...' : isSuccess ? 'Succeeded' : 'Failed'}
                        </span>
                      </div>

                      {/* Run Details Row */}
                      <div className="flex items-center justify-between text-[10px] opacity-70 border-t pt-2" style={{ borderColor: colors.outlineVariant }}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold" style={{ color: colors.primary }}>
                            {run.head_branch}
                          </span>
                          <span>&middot;</span>
                          <span className="font-mono">{run.head_sha}</span>
                          <span>&middot;</span>
                          <span>{new Date(run.created_at).toLocaleDateString()}</span>
                        </div>

                        <a
                          href={run.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold underline hover:opacity-100"
                          style={{ color: colors.primary }}
                        >
                          Logs on GitHub ↗
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
