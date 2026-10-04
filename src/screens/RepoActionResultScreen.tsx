import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';

export type RepoActionKind = 'deleting' | 'created';

interface Props {
  kind: RepoActionKind;
  repoName: string;
  isPrivate?: boolean;
  completed: boolean;
  error?: string | null;
  contentOnly?: boolean;
  onContinue: () => void;
  onRetry?: () => void;
}

export const RepoActionResultScreen: React.FC<Props> = ({
  kind,
  repoName,
  isPrivate = false,
  completed,
  error,
  contentOnly = false,
  onContinue,
  onRetry,
}) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [progress, setProgress] = useState(6);
  const [showSuccess, setShowSuccess] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(performance.now());
  const successTriggeredRef = useRef(false);
  const isDelete = kind === 'deleting';

  useEffect(() => {
    startedRef.current = performance.now();
    successTriggeredRef.current = false;

    const tick = (now: number) => {
      const elapsed = now - startedRef.current;
      // Real operation completion controls the final 100%; until then this is a
      // deliberately capped indeterminate-looking progress estimate so the UI
      // never claims completion before GitHub confirms it.
      const cap = isDelete ? 92 : 88;
      const target = completed ? 100 : error ? 100 : Math.min(cap, 6 + elapsed / (isDelete ? 46 : 38));
      setProgress((current) => current + (target - current) * 0.095);

      if (completed && target >= 99.5 && !successTriggeredRef.current) {
        successTriggeredRef.current = true;
        setProgress(100);
        window.setTimeout(() => {
          setShowSuccess(true);
          if (!settings.reduceMotion) triggerHaptic('success');
        }, 260);
        return;
      }

      if (error) {
        setProgress(100);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [completed, error, isDelete, settings.reduceMotion, triggerHaptic]);

  const percent = Math.min(100, Math.max(0, Math.round(progress)));
  const deleteTitle = contentOnly ? 'Deleting repository content' : 'Deleting your repository';
  const deleteStatus = contentOnly ? 'Deleting repository content…' : 'Deleting your repo…';
  const createStatus = 'Creating your repo…';
  const successTitle = isDelete
    ? (contentOnly ? 'Your repo contents deleted successfully' : 'Your repository successfully deleted')
    : 'Your repo created successfully';

  if (error) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-between p-6" style={{ color: colors.onSurface }}>
        <div className="w-full pt-12 text-center animate-scale-in">
          <div className="mx-auto w-36 h-36 rounded-[40px] flex items-center justify-center shadow-xl" style={{ backgroundColor: colors.errorContainer }}>
            <svg className="w-16 h-16" viewBox="0 0 24 24" fill="none" stroke={colors.onErrorContainer} strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </div>
          <h1 className="mt-8 text-[1.5rem] font-medium tracking-tight">{isDelete ? 'Deletion failed' : 'Creation failed'}</h1>
          <p className="mt-2 text-sm leading-relaxed max-w-sm mx-auto" style={{ color: colors.onSurfaceVariant }}>{error}</p>
        </div>
        <div className="w-full max-w-sm pb-4">
          <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" onClick={onRetry}>
            Try again
          </M3Button>
        </div>
      </div>
    );
  }

  if (!showSuccess) {
    return (
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        style={{
          color: colors.onSurface,
          background: isDelete
            ? `radial-gradient(ellipse 80% 60% at 50% 0%, ${colors.errorContainer}2e 0%, transparent 70%), ${colors.surface}`
            : `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(79,55,139,.25) 0%, transparent 70%), ${colors.surface}`, 
        }}
      >
        <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-[max(20px,env(safe-area-inset-top))] pb-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ color: colors.onSurface }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/><path d="M14 12h4M16 10v4"/></svg>
          </div>
          <h1 className="text-xl font-medium">{isDelete ? (contentOnly ? 'Deleting content' : 'Deleting') : 'Creating repo'}</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-hidden">
          <div className="w-full max-w-[460px] flex flex-col items-center animate-fade-in">
            <div
              className="w-[140px] h-[140px] rounded-[40px] flex items-center justify-center mb-12 relative overflow-hidden shadow-xl"
              style={{ backgroundColor: colors.surfaceContainerHigh }}
            >
              <div
                className="absolute inset-0"
                style={{ background: `radial-gradient(circle at 50% 0%, ${isDelete ? '#F2B8B5' : colors.primary}26 0%, transparent 70%)` }}
              />
              <svg
                className="relative w-16 h-16"
                viewBox="0 0 24 24"
                fill={isDelete ? '#F2B8B5' : colors.primary}
                style={{ filter: `drop-shadow(0 0 14px ${isDelete ? '#F2B8B580' : `${colors.primary}80`})`, animation: 'gitofyRepoIconFloat 3s ease-in-out infinite' }}
              >
                {isDelete ? (
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                ) : isPrivate ? (
                  <path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-9-2a3 3 0 0 1 6 0v2H9V6zm3 10a2 2 0 1 1 2-2 2 2 0 0 1-2 2z" />
                ) : (
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3.04a15.7 15.7 0 0 0-1.1-5.02A8.04 8.04 0 0 1 18.9 11zM12 4c.9 1.18 1.62 3.67 1.84 7h-3.68C10.38 7.67 11.1 5.18 12 4zM8.24 5.98A15.7 15.7 0 0 0 7.14 11H4.1a8.04 8.04 0 0 1 4.14-5.02zM4.1 13h3.04a15.7 15.7 0 0 0 1.1 5.02A8.04 8.04 0 0 1 4.1 13zm5.96 0h3.88c-.22 3.33-.94 5.82-1.94 7-.9-1.18-1.62-3.67-1.94-7zm4.7 5.02A15.7 15.7 0 0 0 15.86 13h3.04a8.04 8.04 0 0 1-4.14 5.02z" />
                )}
              </svg>
            </div>

            <div className="w-full flex flex-col items-center gap-3">
              <div
                className="text-[0.78rem] font-medium tracking-[1.4px] uppercase opacity-75 transition-opacity duration-300 text-center"
                style={{ color: colors.onSurfaceVariant }}
              >
                {isDelete ? deleteStatus : createStatus}
              </div>

              <div className="relative w-full h-[30px] rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceVariant, boxShadow: 'inset 0 2px 5px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.04)' }}>
                <div
                  className="absolute top-0 left-0 h-full rounded-full overflow-hidden flex items-center justify-end transition-[width] duration-300 ease-linear"
                  style={{
                    width: `${percent}%`,
                    background: isDelete
                      ? 'linear-gradient(90deg, #B3261E 0%, #E57373 45%, #F2B8B5 100%)'
                      : 'linear-gradient(90deg, #7C5CE0 0%, #9A7AFA 45%, #C9B5FF 100%)',
                    boxShadow: `0 0 16px ${isDelete ? '#F2B8B559' : '#D0BCFF59'}, inset 0 1px 0 rgba(255,255,255,.3)`,
                  }}
                >
                  <span
                    className="relative z-[3] pr-3 text-[0.78rem] font-semibold tracking-[.5px] text-white tabular-nums transition-opacity duration-300"
                    style={{ opacity: percent > 0 ? 1 : 0, textShadow: '0 1px 2px rgba(0,0,0,.35)' }}
                  >{percent}%</span>
                  <span className="absolute -top-[30%] -left-1/2 w-1/2 h-[160%] rounded-full pointer-events-none gitofy-silk-shimmer" />
                  <span className="absolute inset-0 pointer-events-none rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.22), transparent 50%, rgba(0,0,0,.12))' }} />
                </div>
              </div>
            </div>

            <p className="mt-3 text-sm text-center truncate max-w-full" style={{ color: colors.onSurfaceVariant }}>
              {repoName}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden animate-scale-in"
      style={{
        color: colors.onSurface,
        background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${colors.diffAddedContainer}66 0%, transparent 70%), ${colors.surface}`,
      }}
    >
      <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-[max(20px,env(safe-area-inset-top))] pb-3">
        <div className="w-12 h-12 rounded-full" />
        <h1 className="text-xl font-medium">Complete</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
        <div
          className="w-[150px] h-[150px] rounded-full flex items-center justify-center relative mb-9"
          style={{
            background: `linear-gradient(135deg, ${colors.diffAdded} 0%, ${colors.diffAddedContainer} 100%)`,
            boxShadow: `0 0 0 0 ${colors.diffAdded}66, 0 12px 32px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.2)`,
            animation: settings.reduceMotion ? 'gitofySuccessPop .55s cubic-bezier(.2,0,0,1) forwards' : 'gitofySuccessPop .8s cubic-bezier(.34,1.56,.64,1) forwards, gitofyRingPulse 2.2s .8s ease-out infinite',
          }}
        >
          <svg className="w-[76px] h-[76px]" viewBox="0 0 24 24" fill="none" stroke={colors.onDiffAddedContainer} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 12px ${colors.diffAdded}cc)` }}>
            <path d="M5 13L10 18L19 7" style={{ strokeDasharray: 60, strokeDashoffset: 60, animation: 'gitofyDrawCheck .6s .4s cubic-bezier(.2,0,0,1) forwards' }} />
          </svg>
          {isDelete === false && (
            <div className="absolute -right-1 -bottom-1 w-12 h-12 rounded-full flex items-center justify-center border-4" style={{ backgroundColor: colors.surfaceContainerHigh, borderColor: colors.diffAddedContainer, color: colors.onSurface }}>
              {isPrivate ? (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-9-2a3 3 0 0 1 6 0v2H9V6z"/></svg>
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3.04a15.7 15.7 0 0 0-1.1-5.02A8.04 8.04 0 0 1 18.9 11zM12 4c.9 1.18 1.62 3.67 1.84 7h-3.68C10.38 7.67 11.1 5.18 12 4zM8.24 5.98A15.7 15.7 0 0 0 7.14 11H4.1a8.04 8.04 0 0 1 4.14-5.02zM4.1 13h3.04a15.7 15.7 0 0 0 1.1 5.02A8.04 8.04 0 0 1 4.1 13zm5.96 0h3.88c-.22 3.33-.94 5.82-1.94 7-.9-1.18-1.62-3.67-1.94-7zm4.7 5.02A15.7 15.7 0 0 0 15.86 13h3.04a8.04 8.04 0 0 1-4.14 5.02z"/></svg>
              )}
            </div>
          )}
        </div>

        {isDelete === false && (
          <div className="mb-5 px-4 py-2 rounded-full text-xs font-semibold" style={{ backgroundColor: colors.surfaceContainerHigh, color: colors.onSurfaceVariant }}>
            {isPrivate ? 'Private repository' : 'Public repository'}
          </div>
        )}

        <h1 className="text-[1.5rem] font-medium tracking-tight max-w-[340px] leading-[1.4]" style={{ animation: 'gitofyTextIn .55s .5s cubic-bezier(.2,0,0,1) both' }}>
          {successTitle}
        </h1>
        <p className="mt-2 text-[0.95rem] leading-6 max-w-[320px]" style={{ color: colors.onSurfaceVariant, animation: 'gitofyTextIn .55s .7s cubic-bezier(.2,0,0,1) both' }}>
          {isDelete
            ? (contentOnly ? 'All files have been removed.' : `${repoName} and its GitHub repository data were removed.`)
            : 'Your repository is ready to use'}
        </p>
      </div>

      <div className="flex-shrink-0 w-full px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 flex justify-center">
        <M3Button
          variant="filled"
          shape="capsule"
          size="large"
          className="w-full max-w-[380px] font-bold"
          onClick={() => { triggerHaptic('click'); onContinue(); }}
        >
          Continue
        </M3Button>
      </div>

      <style>{`
        @keyframes gitofyRepoIconFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes gitofySilkShimmer { 0% { left:-50%; opacity:0; } 15% { opacity:1; } 85% { opacity:1; } 100% { left:105%; opacity:0; } }
        .gitofy-silk-shimmer { background:linear-gradient(100deg,transparent 0%,rgba(255,255,255,.08) 30%,rgba(255,255,255,.42) 50%,rgba(255,255,255,.08) 70%,transparent 100%); filter:blur(6px); animation:gitofySilkShimmer 2.8s cubic-bezier(.45,0,.55,1) infinite; }
        @keyframes gitofySuccessPop { 0% { transform:scale(0) rotate(-45deg); } 70% { transform:scale(1.1) rotate(6deg); } 100% { transform:scale(1) rotate(0deg); } }
        @keyframes gitofyRingPulse { 0% { box-shadow:0 0 0 0 rgba(126,231,135,.5),0 12px 32px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.2); } 75% { box-shadow:0 0 0 36px rgba(126,231,135,0),0 12px 32px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.2); } 100% { box-shadow:0 0 0 0 rgba(126,231,135,0),0 12px 32px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.2); } }
        @keyframes gitofyDrawCheck { to { stroke-dashoffset:0; } }
        @keyframes gitofyTextIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @media (max-width:480px) { .gitofy-repo-action-icon { width:120px;height:120px; } }
        @media (max-height:640px) { .gitofy-repo-action-icon { width:100px;height:100px; } }
        @media (prefers-reduced-motion:reduce) { .gitofy-silk-shimmer { animation:none; } }
      `}</style>
    </div>
  );
};
