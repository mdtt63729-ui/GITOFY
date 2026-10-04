import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { EngineResult } from '../git/gitUploadEngine';

export interface ResultScreenProps {
  repoName: string;
  branch: string;
  commitSha: string;
  filesCount: number;
  engineResult?: EngineResult | null;
  onDone: () => void;
  onRunWorkflows: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  repoName,
  branch,
  commitSha,
  filesCount,
  engineResult,
  onDone,
  onRunWorkflows,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();

  useEffect(() => {
    triggerHaptic('success');
    if (!settings.reduceMotion) {
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: [colors.primary, colors.secondary, colors.tertiary],
        });
      } catch {
        // Fallback
      }
    }
  }, []);

  const copySha = () => {
    triggerHaptic('tick');
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(commitSha);
    }
  };

  const totalTimeSec = engineResult?.phaseTimes?.totalMs
    ? (engineResult.phaseTimes.totalMs / 1000).toFixed(1)
    : null;

  return (
    <div className="flex-1 flex flex-col items-center justify-between p-6 select-none animate-scale-in">
      <div className="w-full text-center pt-6 flex flex-col items-center gap-3">
        {/* Animated Checkmark Circle */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl mb-1 animate-bounce-once border-2"
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
          <p className="text-xs max-w-xs" style={{ color: colors.onSurfaceVariant }}>
            All files and directory structures were pushed and verified on GitHub remote.
          </p>
        </div>
      </div>

      {/* Summary Card */}
      <div
        className="w-full max-w-sm p-5 rounded-3xl border flex flex-col gap-3 my-auto shadow-xs"
        style={{
          backgroundColor: colors.surfaceContainerLow,
          borderColor: colors.outlineVariant,
        }}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="opacity-70">Repository</span>
          <span className="font-bold font-mono truncate max-w-[190px]">{repoName}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="opacity-70">Branch</span>
          <span className="font-mono font-semibold">{branch}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="opacity-70">Commit SHA</span>
          <button
            type="button"
            onClick={copySha}
            className="font-mono font-bold text-xs px-2.5 py-1 rounded-xl border flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
            style={{
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.outlineVariant,
              color: colors.primary,
            }}
          >
            <span>{commitSha}</span>
            <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="opacity-70">Files Uploaded</span>
          <span className="font-mono font-semibold">
            {filesCount} {filesCount === 1 ? 'file' : 'files'}
          </span>
        </div>

        {engineResult?.uploadedBytes && (
          <div className="flex items-center justify-between text-xs">
            <span className="opacity-70">Transferred Size</span>
            <span className="font-mono font-semibold">
              {(engineResult.uploadedBytes / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>
        )}

        {totalTimeSec && (
          <div className="flex items-center justify-between text-xs">
            <span className="opacity-70">Transfer Duration</span>
            <span className="font-mono font-semibold">
              {totalTimeSec}s {engineResult?.speed ? `(${engineResult.speed})` : ''}
            </span>
          </div>
        )}

        {/* Phase Timing Breakdown */}
        {engineResult?.phaseTimes && (
          <div className="pt-2 border-t flex flex-wrap items-center gap-1.5" style={{ borderColor: colors.outlineVariant }}>
            {engineResult.phaseTimes.extractMs !== undefined && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border opacity-80" style={{ borderColor: colors.outlineVariant }}>
                Extract: {(engineResult.phaseTimes.extractMs / 1000).toFixed(1)}s
              </span>
            )}
            {engineResult.phaseTimes.diffMs !== undefined && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border opacity-80" style={{ borderColor: colors.outlineVariant }}>
                Diff: {(engineResult.phaseTimes.diffMs / 1000).toFixed(1)}s
              </span>
            )}
            {engineResult.phaseTimes.pushMs !== undefined && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border opacity-80" style={{ borderColor: colors.outlineVariant }}>
                Push: {(engineResult.phaseTimes.pushMs / 1000).toFixed(1)}s
              </span>
            )}
            {engineResult.phaseTimes.verifyMs !== undefined && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg border opacity-80" style={{ borderColor: colors.outlineVariant }}>
                Verify: {(engineResult.phaseTimes.verifyMs / 1000).toFixed(1)}s
              </span>
            )}
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
          Run CI Actions / Build APK
        </M3Button>

        <M3Button
          variant="tonal"
          shape="capsule"
          size="large"
          className="w-full font-bold"
          onClick={onDone}
        >
          Return to Dashboard
        </M3Button>
      </div>
    </div>
  );
};
