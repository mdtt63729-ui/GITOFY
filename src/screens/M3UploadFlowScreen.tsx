import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { Repository, DiffSummary, UploadState } from '../types';
import { processZipFile, computeSmartDiff, ExtractedFile } from '../git/diffEngine';
import { fetchRemoteTreeMap } from '../git/githubApi';
import { gitUploadEngine, EngineResult } from '../git/gitUploadEngine';
import { M3CircularProgress } from '../ui/m3/M3CircularProgress';
import { M3LinearProgress } from '../ui/m3/M3LinearProgress';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3Dialog } from '../ui/m3/M3Dialog';
import { M3Chip } from '../ui/m3/M3Chip';
import { repoOwnerLogin, repoOwnerAvatar } from '../utils/repo';

export type FlowStage = 'calculating' | 'diff_review' | 'uploading' | 'success' | 'error';

const phaseLabels: Record<string, string> = {
  validating: 'Validating project…', extracting: 'Extracting project…', indexing: 'Indexing files…',
  hashing: 'Checking file changes…', diffing: 'Comparing changes…', git_prep: 'Preparing Git…',
  uploading: 'Uploading changes…', committing: 'Creating commit…', pushing: 'Pushing to GitHub…',
  verifying: 'Verifying repository…', completed: 'Upload complete', paused: 'Upload paused',
  error: 'Upload interrupted', cancelled: 'Upload cancelled',
};

export interface M3UploadFlowScreenProps {
  repo: Repository;
  zipFile: File;
  onSuccess: (sha: string, result?: EngineResult) => void;
  onCancel: () => void;
  onRunWorkflows: () => void;
}

export const M3UploadFlowScreen: React.FC<M3UploadFlowScreenProps> = ({
  repo,
  zipFile,
  onSuccess,
  onCancel,
  onRunWorkflows,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();

  // Primary Flow Stage Machine
  const [stage, setStage] = useState<FlowStage>('calculating');

  // Calculating Stage State
  const [calculatingStatus, setCalculatingStatus] = useState('Reading archive structure...');
  const [displayFilesCount, setDisplayFilesCount] = useState(0);
  const [displaySizeMb, setDisplaySizeMb] = useState('0.0');
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [diffSummary, setDiffSummary] = useState<DiffSummary | null>(null);

  // Review Stage State
  const [diffFilter, setDiffFilter] = useState<'all' | 'added' | 'modified' | 'deleted'>('all');
  const [commitMessage, setCommitMessage] = useState(
    `Update ${repo.name} via Gitofy`
  );

  // Uploading Stage State
  const [uploadProgress, setUploadProgress] = useState(5);
  const [uploadPhase, setUploadPhase] = useState('uploading');
  const [previousUploadFile, setPreviousUploadFile] = useState('Preparing Git working tree...');
  const uploadFileRef = useRef('Preparing Git working tree...');
  const [uploadFileRevision, setUploadFileRevision] = useState(0);
  const [currentFileText, setCurrentFileText] = useState('Initializing Ultra-Fast Git Engine...');
  const [completedFiles, setCompletedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(zipFile.size);
  const [speedText, setSpeedText] = useState('Calculating...');
  const [etaText, setEtaText] = useState('Estimating...');
  const [engineType, setEngineType] = useState<'native_git_cli' | 'adaptive_smart_diff'>('native_git_cli');
  const [phaseTimes, setPhaseTimes] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Success Stage State
  const [commitSha, setCommitSha] = useState('');
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null);
  const [copiedSha, setCopiedSha] = useState(false);

  // Throttled speed & ETA updates
  const lastSpeedUpdateRef = useRef(0);

  // Map the live analysis status to a step in the pipeline (for the stepper).
  const calcSteps = ['Reading archive', 'Extracting files', 'Indexing & hashing', 'Comparing with GitHub', 'Ready'];
  const calcStepIndex = useMemo(() => {
    const s = calculatingStatus.toLowerCase();
    if (s.includes('complete') || s.includes('done')) return 4;
    if (s.includes('analy') || s.includes('diff') || s.includes('remote') || s.includes('compar')) return 3;
    if (s.includes('hash') || s.includes('index')) return 2;
    if (s.includes('extract')) return 1;
    return 0;
  }, [calculatingStatus]);

  // -------------------------------------------------------------
  // STAGE 1: ASYNCHRONOUS CALCULATING & SMART DIFF
  // -------------------------------------------------------------
  useEffect(() => {
    let isCancelled = false;

    const runCalculation = async () => {
      try {
        setCalculatingStatus('Reading project entries...');
        await new Promise((r) => setTimeout(r, 60));

        // Non-blocking extraction
        setCalculatingStatus('Extracting files...');
        const local = await processZipFile(zipFile, settings.stripRootFolder);
        if (isCancelled) return;

        setCalculatingStatus('Indexing and hashing files...');
        setExtractedFiles(local);
        const totalSize = local.reduce((sum, f) => sum + f.size, 0);

        // Smooth requestAnimationFrame counter
        const targetCount = local.length;
        const targetMb = (totalSize / (1024 * 1024)).toFixed(1);
        const duration = 400;
        const startTime = performance.now();

        const countUp = (time: number) => {
          const elapsed = time - startTime;
          const prog = Math.min(1, elapsed / duration);
          const currentCount = Math.round(targetCount * prog);
          const currentMb = ((parseFloat(targetMb) * prog)).toFixed(1);

          setDisplayFilesCount(currentCount);
          setDisplaySizeMb(currentMb);

          if (prog < 1 && !isCancelled) {
            requestAnimationFrame(countUp);
          }
        };
        requestAnimationFrame(countUp);

        setCalculatingStatus('Analyzing Smart Diff against remote repository...');
        let remoteTreeMap: Record<string, { sha: string; size?: number }> = {};
        if (settings.personalAccessToken) {
          remoteTreeMap = await fetchRemoteTreeMap(
            repoOwnerLogin(repo),
            repo.name,
            repo.default_branch || settings.defaultBranch || 'main',
            settings.personalAccessToken
          );
        }

        const diff = computeSmartDiff(local, remoteTreeMap, settings.deleteRemoteOnly);
        if (isCancelled) return;

        setDiffSummary(diff);
        setCommitMessage(
          `Update ${repo.name} (+${diff.added} Added, ~${diff.modified} Modified)`
        );

        setCalculatingStatus('Project analysis complete');
        await new Promise((r) => setTimeout(r, 180));

        // Smooth morph to Review Stage
        triggerHaptic('tick');
        setStage('diff_review');
      } catch (err: unknown) {
        if (isCancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to analyze project ZIP file.'
        );
        setStage('error');
      }
    };

    runCalculation();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Check engine capabilities
  useEffect(() => {
    gitUploadEngine.checkNativeEngineAvailable().then(({ available }) => {
      setEngineType(available ? 'native_git_cli' : 'adaptive_smart_diff');
    });
  }, []);

  // -------------------------------------------------------------
  // STAGE 2 -> STAGE 3: START UPLOAD PIPELINE
  // -------------------------------------------------------------
  const handleStartUpload = async () => {
    triggerHaptic('tick');
    setStage('uploading');
    setUploadProgress(10);
    setCurrentFileText('Preparing Git working tree...');

    try {
      const result = await gitUploadEngine.executeUpload(zipFile, {
        repoOwner: repoOwnerLogin(repo),
        repoName: repo.name,
        branch: repo.default_branch || settings.defaultBranch || 'main',
        commitMessage,
        token: settings.personalAccessToken || '',
        stripRootFolder: settings.stripRootFolder,
        onProgress: (state: UploadState) => {
          setUploadProgress(state.progress);
          setUploadPhase(state.phase);
          if (state.currentFile && state.currentFile !== uploadFileRef.current) {
            setPreviousUploadFile(uploadFileRef.current);
            uploadFileRef.current = state.currentFile;
            setUploadFileRevision((v) => v + 1);
          }
          setCurrentFileText(state.currentFile);
          setCompletedFiles(state.completedFiles);
          if (state.totalFiles) setTotalFiles(state.totalFiles);
          if (state.uploadedBytes) setUploadedBytes(state.uploadedBytes);
          if (state.totalBytes) setTotalBytes(state.totalBytes);

          // Throttle speed and ETA updates to 250ms to avoid layout thrashing
          const now = Date.now();
          if (now - lastSpeedUpdateRef.current > 250) {
            lastSpeedUpdateRef.current = now;
            if (state.speed) setSpeedText(state.speed);
            if (state.eta) setEtaText(state.eta);
          }

          if (state.phaseTimes) {
            setPhaseTimes(state.phaseTimes as Record<string, number>);
          }
        },
      });

      if (result.success) {
        setCommitSha(result.sha);
        setEngineResult(result);
        triggerHaptic('success');

        // Smooth transition to Success Stage
        setTimeout(() => {
          setStage('success');
          onSuccess(result.sha, result);
        }, 300);
      }
    } catch (err: unknown) {
      triggerHaptic('error');
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setErrorMessage(msg);
      setStage('error');
    }
  };

  const handleConfirmCancel = async () => {
    setShowCancelDialog(false);
    triggerHaptic('click');
    await gitUploadEngine.cancel();
    onCancel();
  };

  const copyShaToClipboard = () => {
    triggerHaptic('tick');
    if (navigator?.clipboard && commitSha) {
      navigator.clipboard.writeText(commitSha);
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 2000);
    }
  };

  // -------------------------------------------------------------
  // RENDER: CONTINUOUS ZERO-FLASH SINGLE CONTAINER
  // -------------------------------------------------------------
  return (
    <div
      className="relative flex-1 flex flex-col justify-between p-6 select-none overflow-y-auto"
      style={{
        backgroundColor: colors.surface,
        color: colors.onSurface,
      }}
    >
      {/* --------------------------------------------------------- */}
      {/* STAGE 1: CALCULATING SCREEN                               */}
      {/* --------------------------------------------------------- */}
      {stage === 'calculating' && (
        <div className="flex-1 flex flex-col justify-between py-6">
          {/* Title */}
          <div className="calc-in text-center flex flex-col items-center gap-1.5 pt-4" style={{ animationDelay: '0ms' }}>
            <span className="text-xs font-mono font-medium" style={{ color: colors.primary }}>
              {repo.full_name || repo.name}
            </span>
            <h2 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>
              Calculating
            </h2>
            <p className="text-xs opacity-70" style={{ color: colors.onSurfaceVariant }}>
              Analyzing your project and preparing changes
            </p>
          </div>

          {/* Hero: pulsing M3 progress ring */}
          <div className="flex flex-col items-center gap-6 my-auto w-full">
            <div className="calc-in relative flex items-center justify-center" style={{ animationDelay: '70ms' }}>
              <span className="calc-halo" style={{ backgroundColor: colors.primaryContainer }} />
              <span className="calc-halo calc-halo-2" style={{ backgroundColor: colors.primaryContainer }} />
              <M3CircularProgress
                size={104}
                strokeWidth={7}
                color={colors.primary}
                trackColor={colors.surfaceContainerHighest}
              />
              <span
                className="absolute w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: colors.surfaceContainerLow, color: colors.primary }}
              >
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </span>
            </div>

            {/* Live status pill */}
            <p
              className="calc-in text-xs font-mono font-medium px-3.5 py-1.5 rounded-full border"
              style={{
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
                color: colors.onSurface,
                animationDelay: '140ms',
              }}
            >
              {calculatingStatus}
            </p>

            {/* Pipeline stepper */}
            <div
              className="calc-in w-full max-w-xs flex flex-col gap-1"
              style={{ animationDelay: '210ms' }}
            >
              {calcSteps.map((label, i) => {
                const done = i < calcStepIndex;
                const active = i === calcStepIndex;
                const tint = done || active ? colors.primary : colors.outlineVariant;
                return (
                  <div key={label} className="flex items-center gap-2.5 px-1 py-1">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${active ? 'calc-step-active' : ''}`}
                      style={{
                        backgroundColor: done ? colors.primary : active ? `${colors.primary}22` : 'transparent',
                        border: `1.5px solid ${tint}`,
                        color: done ? colors.onPrimary : colors.primary,
                        transition: 'background-color 300ms ease, border-color 300ms ease',
                      }}
                    >
                      {done ? (
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : active ? (
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.primary }} />
                      ) : null}
                    </span>
                    <span
                      className="text-[11px] font-semibold"
                      style={{
                        color: active ? colors.onSurface : colors.onSurfaceVariant,
                        opacity: done || active ? 1 : 0.55,
                        transition: 'color 300ms ease, opacity 300ms ease',
                      }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Indeterminate progress bar */}
            <div className="calc-in w-full max-w-xs" style={{ animationDelay: '260ms' }}>
              <M3LinearProgress />
            </div>

            {/* Stat cards */}
            <div className="calc-in w-full max-w-xs grid grid-cols-2 gap-2.5" style={{ animationDelay: '320ms' }}>
              <div
                className="p-3 rounded-2xl border flex flex-col items-center justify-center text-center"
                style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
              >
                <span className="text-xl font-black font-mono" style={{ color: colors.primary }}>
                  {displayFilesCount}
                </span>
                <span className="text-[11px] font-medium opacity-70">Files detected</span>
              </div>
              <div
                className="p-3 rounded-2xl border flex flex-col items-center justify-center text-center"
                style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
              >
                <span className="text-xl font-black font-mono" style={{ color: colors.primary }}>
                  {displaySizeMb} MB
                </span>
                <span className="text-[11px] font-medium opacity-70">Total size</span>
              </div>
            </div>
          </div>

          {/* Bottom Cancel */}
          <div className="calc-in w-full max-w-xs mx-auto" style={{ animationDelay: '380ms' }}>
            <M3Button variant="tonal" shape="capsule" size="medium" className="w-full" onClick={onCancel}>
              Cancel
            </M3Button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* STAGE 2: SMART DIFF REVIEW (SMOOTH MORPH)                 */}
      {/* --------------------------------------------------------- */}
      {stage === 'diff_review' && diffSummary && (
        <div className="flex-1 flex flex-col justify-between py-2 animate-page-enter">
          {/* Top Bar */}
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: colors.outlineVariant }}>
            <div className="flex items-center gap-2">
              <M3IconButton aria-label="Cancel" onClick={onCancel}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </M3IconButton>
              <div>
                <h2 className="text-base font-bold">Smart Diff Summary</h2>
                <p className="text-[10px] font-mono opacity-70">{repo.name}</p>
              </div>
            </div>
            <span
              className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: colors.diffAddedContainer,
                color: colors.diffAdded,
              }}
            >
              {diffSummary.added + diffSummary.modified} changes
            </span>
          </div>

          {/* Metric Cards */}
          <div className="py-4 flex flex-col gap-4">
            <div className="grid grid-cols-4 gap-2">
              <div
                className="p-2.5 rounded-2xl flex flex-col items-center justify-center text-center border"
                style={{
                  backgroundColor: colors.diffAddedContainer,
                  borderColor: colors.diffAdded,
                  color: colors.diffAdded,
                }}
              >
                <span className="text-base font-black font-mono">+{diffSummary.added}</span>
                <span className="text-[10px] font-bold">New</span>
              </div>

              <div
                className="p-2.5 rounded-2xl flex flex-col items-center justify-center text-center border"
                style={{
                  backgroundColor: colors.diffModifiedContainer,
                  borderColor: colors.diffModified,
                  color: colors.diffModified,
                }}
              >
                <span className="text-base font-black font-mono">~{diffSummary.modified}</span>
                <span className="text-[10px] font-bold">Mod</span>
              </div>

              <div
                className="p-2.5 rounded-2xl flex flex-col items-center justify-center text-center border"
                style={{
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurfaceVariant,
                }}
              >
                <span className="text-base font-black font-mono">{diffSummary.unchanged}</span>
                <span className="text-[10px] font-bold">Same</span>
              </div>

              <div
                className="p-2.5 rounded-2xl flex flex-col items-center justify-center text-center border"
                style={{
                  backgroundColor: colors.diffDeletedContainer,
                  borderColor: colors.diffDeleted,
                  color: colors.diffDeleted,
                }}
              >
                <span className="text-base font-black font-mono">-{diffSummary.deleted}</span>
                <span className="text-[10px] font-bold">Del</span>
              </div>
            </div>

            {/* Commit Message Box */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold" style={{ color: colors.onSurfaceVariant }}>
                Commit Message
              </label>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                rows={2}
                className="w-full p-3 rounded-2xl border text-xs font-medium outline-none resize-none transition-all"
                style={{
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outline,
                  color: colors.onSurface,
                }}
              />
            </div>
          </div>

          {/* Sticky Push Button */}
          <div className="pt-2">
            <M3Button
              variant="filled"
              shape="capsule"
              size="large"
              className="w-full font-bold shadow-lg"
              onClick={handleStartUpload}
            >
              Push Changes to GitHub →
            </M3Button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* STAGE 3: REDESIGNED UPLOADING SCREEN (SECTION 20)         */}
      {/* --------------------------------------------------------- */}
      {stage === 'uploading' && (
        <div className="upload-reference-screen">
          <header className="upload-ref-topbar">
            <button className="upload-ref-iconbtn" aria-label="Go back" onClick={() => setShowCancelDialog(true)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="upload-ref-title">Uploading</div>
          </header>

          <main className="upload-ref-content">
            <div className="upload-ref-main">
              <div className="upload-ref-icon">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04ZM19 18H6C3.79 18 2 16.21 2 14C2 11.95 3.53 10.24 5.56 10.03L6.63 9.92L7.13 8.97C8.08 7.14 9.94 6 12 6C14.62 6 16.88 7.86 17.39 10.43L17.69 11.93L19.22 12.04C20.78 12.14 22 13.45 22 15C22 16.65 20.65 18 19 18ZM13.45 11H10.55V14H8L12 18L16 14H13.45V11Z" />
                </svg>
              </div>

              <div className="upload-ref-status">
                <div className="upload-ref-caption">{phaseLabels[uploadPhase] || 'Uploading changes…'}</div>
                <div className="upload-ref-track">
                  <div className="upload-ref-fill" style={{ width: `${Math.max(0, Math.min(100, Math.round(uploadProgress)))}%` }}>
                    <span className="upload-ref-percent">{Math.round(uploadProgress)}%</span>
                  </div>
                </div>

                <div className="upload-ref-file" key={uploadFileRevision}>
                  <div className="upload-ref-file-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="upload-ref-file-copy">
                    <div className="upload-ref-file-label">Changing file · {engineType === 'native_git_cli' ? 'Git Smart HTTP' : 'Smart Diff'}</div>
                    <div className="upload-ref-file-name upload-ref-file-change" title={currentFileText}>{currentFileText}</div>
                    {previousUploadFile !== currentFileText && (
                      <div className="upload-ref-file-label" style={{ marginTop: 3 }}>previous: {previousUploadFile}</div>
                    )}
                  </div>
                </div>

                <div className="upload-ref-metrics">
                  <span>{completedFiles} / {totalFiles || extractedFiles.length || 1} files</span>
                  <span>•</span>
                  <span>{(uploadedBytes / (1024 * 1024)).toFixed(1)} / {(totalBytes / (1024 * 1024)).toFixed(1)} MB</span>
                </div>

                <div className="upload-ref-metrics">
                  <span>{speedText}</span>
                  {etaText && etaText !== '0s' && <><span>•</span><span>ETA {etaText}</span></>}
                </div>
              </div>
            </div>
          </main>

          <footer className="upload-ref-bottom">
            <button className="upload-ref-button" onClick={() => setShowCancelDialog(true)}>Cancel upload</button>
          </footer>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* STAGE 4: REDESIGNED SUCCESS SCREEN (SECTION 41-42)        */}
      {/* --------------------------------------------------------- */}
      {stage === 'success' && (
        <div className="flex-1 flex flex-col items-center justify-between py-6 animate-scale-in">
          {/* Animated Stroke-Draw Checkmark Icon */}
          <div className="w-full text-center flex flex-col items-center gap-3 pt-4">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg border-2 animate-bounce-once"
              style={{
                backgroundColor: colors.diffAddedContainer,
                borderColor: colors.diffAdded,
                color: colors.diffAdded,
              }}
            >
              <svg
                className="w-10 h-10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-center gap-1.5">
                <h2 className="text-2xl font-black tracking-tight" style={{ color: colors.onSurface }}>
                  Upload Complete
                </h2>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{
                    backgroundColor: colors.diffAddedContainer,
                    color: colors.diffAdded,
                  }}
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>100% Verified</span>
                </span>
              </div>
              <p className="text-xs max-w-xs opacity-80" style={{ color: colors.onSurfaceVariant }}>
                {zipFile.name} was successfully committed and pushed to GitHub.
              </p>
            </div>
          </div>

          {/* Details Summary Card */}
          <div
            className="w-full max-w-sm p-4 rounded-3xl border flex flex-col gap-3 my-auto shadow-xs"
            style={{
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            }}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Repository</span>
              <span className="font-bold font-mono truncate max-w-[180px]">{repo.full_name || repo.name}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Branch</span>
              <span className="font-mono font-semibold">{repo.default_branch || 'main'}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Commit SHA</span>
              <button
                type="button"
                onClick={copyShaToClipboard}
                className="font-mono font-bold text-xs px-2.5 py-1 rounded-xl border flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                style={{
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                  color: colors.primary,
                }}
              >
                <span>{commitSha || 'latest'}</span>
                {copiedSha ? (
                  <span className="text-[10px] text-emerald-500 font-sans">Copied!</span>
                ) : (
                  <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Files Uploaded</span>
              <span className="font-mono font-semibold">
                {extractedFiles.length} files
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Data Size</span>
              <span className="font-mono font-semibold">
                {(zipFile.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>

            {engineResult?.speed && (
              <div className="flex items-center justify-between text-xs">
                <span className="opacity-70">Network Speed</span>
                <span className="font-mono font-semibold">{engineResult.speed}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="w-full max-w-sm flex flex-col gap-2.5">
            <M3Button
              variant="filled"
              shape="capsule"
              size="large"
              className="w-full font-bold shadow-lg"
              onClick={onRunWorkflows}
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              }
            >
              Run CI Workflows / Build APK
            </M3Button>

            <M3Button
              variant="tonal"
              shape="capsule"
              size="large"
              className="w-full font-bold"
              onClick={onCancel}
            >
              Done
            </M3Button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* STAGE 5: ERROR SCREEN                                     */}
      {/* --------------------------------------------------------- */}
      {stage === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-between py-6 animate-scale-in">
          <div className="w-full text-center flex flex-col items-center gap-3 pt-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg border"
              style={{
                backgroundColor: colors.errorContainer,
                borderColor: colors.error,
                color: colors.onErrorContainer,
              }}
            >
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-black" style={{ color: colors.error }}>
                Upload Interrupted
              </h2>
              <p className="text-xs max-w-xs font-mono opacity-80" style={{ color: colors.onSurfaceVariant }}>
                {errorMessage || 'Unknown error occurred'}
              </p>
              <span className="text-[10px] opacity-60 mt-1">Your local ZIP file is safe.</span>
            </div>
          </div>

          <div className="w-full max-w-sm flex flex-col gap-2.5">
            <M3Button
              variant="filled"
              shape="capsule"
              size="large"
              className="w-full font-bold shadow-md"
              onClick={handleStartUpload}
            >
              Retry Upload
            </M3Button>

            <M3Button
              variant="tonal"
              shape="capsule"
              size="large"
              className="w-full"
              onClick={onCancel}
            >
              Cancel
            </M3Button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- */}
      {/* CONFIRMATION DIALOG (SECTION 29)                          */}
      {/* --------------------------------------------------------- */}
      <M3Dialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        title="Cancel upload?"
        description="Your current upload progress will be stopped and any temporary files will be cleaned up safely."
        confirmLabel="Cancel Upload"
        cancelLabel="Continue Upload"
        isDestructive={true}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
};
