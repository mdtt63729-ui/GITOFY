import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { UploadState, DiffSummary } from '../types';
import { gitUploadEngine, EngineResult } from '../git/gitUploadEngine';
import { M3Button } from '../ui/m3/M3Button';

export interface UploadScreenProps {
  repoName: string;
  branch: string;
  commitMessage: string;
  diffSummary: DiffSummary;
  zipFile?: File | Blob | ArrayBuffer | null;
  onSuccess: (sha: string, result?: EngineResult) => void;
  onCancel: () => void;
}

const PHASE_LABELS: Record<string, { label: string; icon: string }> = {
  validating: { label: 'Validating Archive', icon: 'shield' },
  extracting: { label: 'Extracting Files', icon: 'folder' },
  indexing: { label: 'Indexing & Scanning', icon: 'list' },
  hashing: { label: 'Computing Checksums', icon: 'hash' },
  diffing: { label: 'Smart Diff Analysis', icon: 'diff' },
  git_prep: { label: 'Preparing Git Tree', icon: 'git' },
  uploading: { label: 'Transferring Git Objects', icon: 'upload' },
  committing: { label: 'Creating Git Commit', icon: 'commit' },
  pushing: { label: 'Git Smart HTTP Push', icon: 'push' },
  verifying: { label: '100% Tree Verification', icon: 'check' },
  completed: { label: 'Push & Verification Complete', icon: 'check' },
  paused: { label: 'Upload Paused', icon: 'pause' },
  error: { label: 'Upload Interrupted', icon: 'alert' },
  cancelled: { label: 'Upload Cancelled', icon: 'cancel' },
};

export const UploadScreen: React.FC<UploadScreenProps> = ({
  repoName,
  branch,
  commitMessage,
  diffSummary,
  zipFile,
  onSuccess,
  onCancel,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [uploadState, setUploadState] = useState<UploadState>({
    phase: 'validating',
    progress: 5,
    currentFile: 'Initializing Ultra-Fast Git Engine...',
    completedFiles: 0,
    totalFiles: diffSummary.items.filter((i) => i.status !== 'unchanged').length || diffSummary.totalFiles || 1,
    uploadedBytes: 0,
    totalBytes: diffSummary.totalSize || 0,
    speed: 'Calculating...',
    eta: 'Estimating...',
    commitSha: null,
    errorMessage: null,
  });

  const [isPaused, setIsPaused] = useState(false);
  const [engineType, setEngineType] = useState<'native_git_cli' | 'adaptive_smart_diff'>('native_git_cli');
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Check engine capability
    gitUploadEngine.checkNativeEngineAvailable().then(({ available }) => {
      setEngineType(available ? 'native_git_cli' : 'adaptive_smart_diff');
    });

    startUploadPipeline();

    return () => {
      // Cleanup
    };
  }, []);

  const startUploadPipeline = async () => {
    try {
      const parts = repoName.split('/');
      const repoOwner = parts.length > 1 ? parts[0] : settings.githubUsername || 'user';
      const actualRepo = parts.length > 1 ? parts[1] : repoName;

      // If no ZIP file is supplied in memory, create a synthetic fallback Blob from diff items
      let fileToUpload = zipFile;
      if (!fileToUpload) {
        // Create minimal buffer or fallback
        fileToUpload = new Uint8Array(0).buffer;
      }

      const result = await gitUploadEngine.executeUpload(fileToUpload, {
        repoOwner,
        repoName: actualRepo,
        branch,
        commitMessage,
        token: settings.personalAccessToken || '',
        stripRootFolder: settings.stripRootFolder,
        onProgress: (state) => {
          setUploadState(state);
        },
      });

      if (result.success) {
        triggerHaptic('success');
        onSuccess(result.sha, result);
      }
    } catch (err: unknown) {
      triggerHaptic('error');
      const errorMsg = err instanceof Error ? err.message : 'Unknown upload error occurred';
      setUploadState((prev) => ({
        ...prev,
        phase: 'error',
        errorMessage: errorMsg,
      }));
    }
  };

  const handleRetry = () => {
    triggerHaptic('tick');
    setUploadState({
      phase: 'validating',
      progress: 5,
      currentFile: 'Retrying upload pipeline...',
      completedFiles: 0,
      totalFiles: diffSummary.items.filter((i) => i.status !== 'unchanged').length || diffSummary.totalFiles || 1,
      speed: 'Calculating...',
      commitSha: null,
      errorMessage: null,
    });
    startUploadPipeline();
  };

  const handleCancel = async () => {
    triggerHaptic('click');
    await gitUploadEngine.cancel();
    onCancel();
  };

  const currentPhaseInfo = PHASE_LABELS[uploadState.phase] || {
    label: uploadState.phase,
    icon: 'upload',
  };

  const isFailed = uploadState.phase === 'error';
  const isDone = uploadState.phase === 'completed';

  return (
    <div className="flex-1 flex flex-col justify-between p-6 select-none animate-fade-in">
      {/* Header Info */}
      <div className="w-full flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-mono font-medium" style={{ color: colors.primary }}>
            {repoName}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <h2 className="text-xl font-black tracking-tight">{currentPhaseInfo.label}</h2>
            <span
              className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full uppercase"
              style={{
                backgroundColor:
                  engineType === 'native_git_cli'
                    ? colors.diffAddedContainer
                    : colors.secondaryContainer,
                color:
                  engineType === 'native_git_cli'
                    ? colors.diffAdded
                    : colors.onSecondaryContainer,
              }}
            >
              {engineType === 'native_git_cli' ? 'Git Smart HTTP' : 'Smart Diff'}
            </span>
          </div>
        </div>

        <span className="font-mono text-xl font-black" style={{ color: colors.primary }}>
          {uploadState.progress}%
        </span>
      </div>

      {/* Main Progress Display */}
      <div className="w-full flex flex-col items-center gap-6 my-auto">
        {/* Animated Progress Circle / Indicator */}
        <div className="relative w-40 h-40 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background ring */}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="transparent"
              stroke={colors.surfaceContainerHighest}
              strokeWidth="8"
            />
            {/* Foreground progress ring */}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="transparent"
              stroke={isFailed ? colors.error : colors.primary}
              strokeWidth="8"
              strokeDasharray={264}
              strokeDashoffset={264 - (264 * Math.min(100, uploadState.progress)) / 100}
              strokeLinecap="round"
              className="transition-all duration-300 ease-out"
            />
          </svg>

          {/* Center Info */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3">
            {isFailed ? (
              <svg className="w-10 h-10 text-rose-500 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : isDone ? (
              <svg className="w-12 h-12 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <div className="flex flex-col items-center">
                <span className="text-2xl font-black font-mono leading-none tracking-tight">
                  {uploadState.progress}%
                </span>
                <span className="text-[11px] font-bold font-mono mt-1 opacity-70">
                  {uploadState.speed}
                </span>
                {uploadState.eta && uploadState.eta !== '0s' && (
                  <span className="text-[10px] font-mono opacity-50 mt-0.5">
                    ETA: {uploadState.eta}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Real-time Status Line */}
        <div className="w-full max-w-sm flex flex-col items-center text-center gap-1.5 px-2">
          <p
            className="text-xs font-mono font-medium truncate max-w-full"
            style={{ color: colors.onSurface }}
            title={uploadState.currentFile}
          >
            {uploadState.currentFile}
          </p>

          {/* Data & Files metrics */}
          <div className="flex items-center gap-3 text-[11px] opacity-70 font-mono">
            <span>
              Files: {uploadState.completedFiles} / {uploadState.totalFiles}
            </span>
            {uploadState.totalBytes ? (
              <>
                <span>•</span>
                <span>
                  {((uploadState.uploadedBytes || 0) / (1024 * 1024)).toFixed(1)} /{' '}
                  {(uploadState.totalBytes / (1024 * 1024)).toFixed(1)} MB
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* Phase Timeline / Timing Chips */}
        {uploadState.phaseTimes && Object.keys(uploadState.phaseTimes).length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-xs text-[10px] font-mono opacity-80">
            {uploadState.phaseTimes.validateMs !== undefined && (
              <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: colors.outlineVariant }}>
                Validate: {(uploadState.phaseTimes.validateMs / 1000).toFixed(1)}s
              </span>
            )}
            {uploadState.phaseTimes.extractMs !== undefined && (
              <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: colors.outlineVariant }}>
                Extract: {(uploadState.phaseTimes.extractMs / 1000).toFixed(1)}s
              </span>
            )}
            {uploadState.phaseTimes.diffMs !== undefined && (
              <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: colors.outlineVariant }}>
                Diff: {(uploadState.phaseTimes.diffMs / 1000).toFixed(1)}s
              </span>
            )}
            {uploadState.phaseTimes.pushMs !== undefined && (
              <span className="px-2 py-0.5 rounded-full border" style={{ borderColor: colors.outlineVariant }}>
                Push: {(uploadState.phaseTimes.pushMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}

        {/* Error Box if failed */}
        {isFailed && (
          <div
            className="w-full max-w-sm p-4 rounded-2xl border flex flex-col gap-2 text-left animate-shake"
            style={{
              backgroundColor: colors.errorContainer,
              borderColor: colors.error,
              color: colors.onErrorContainer,
            }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider">Upload Interrupted</span>
            </div>
            <p className="text-xs font-mono leading-relaxed opacity-90 break-words">
              {uploadState.errorMessage}
            </p>
            <span className="text-[10px] opacity-75">Your local ZIP file remains safe and uncorrupted.</span>
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div className="w-full flex items-center gap-3">
        {isFailed ? (
          <>
            <M3Button
              variant="filled"
              shape="capsule"
              size="large"
              className="flex-1 font-bold shadow-md"
              onClick={handleRetry}
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              }
            >
              Retry Upload
            </M3Button>
            <M3Button
              variant="tonal"
              shape="capsule"
              size="large"
              className="flex-1"
              onClick={handleCancel}
            >
              Cancel
            </M3Button>
          </>
        ) : (
          <M3Button
            variant="tonal"
            shape="capsule"
            size="large"
            className="w-full font-bold"
            onClick={handleCancel}
            icon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            }
          >
            Cancel Upload
          </M3Button>
        )}
      </div>
    </div>
  );
};
