import React, { useMemo, useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3TextField } from '../ui/m3/M3TextField';
import { Repository } from '../types';
import { repoOwnerLogin } from '../utils/repo';
import { gitUploadEngine } from '../git/gitUploadEngine';

interface Props {
  zipFile: File;
  repos: Repository[];
  /** The repository the ZIP was already pushed to — preselected and locked. */
  currentRepo: Repository | null;
  token: string;
  onBack: () => void;
  onFinished: (pushed: number) => void;
}

type RowStatus = 'waiting' | 'running' | 'done' | 'failed';

interface Row {
  status: RowStatus;
  sha?: string;
  error?: string;
  percent: number;
}

/**
 * Push the same ZIP to several repositories in one go.
 *
 * The uploads run one after another rather than in parallel — a single shared
 * upload engine, and one push at a time is kinder to a phone connection than
 * several competing. Each repository reports its own result.
 */
export const MultiRepoUploadScreen: React.FC<Props> = ({ zipFile, repos, currentRepo, token, onBack, onFinished }) => {
  const { colors, settings, triggerHaptic } = useTheme();

  const [selected, setSelected] = useState<Set<number>>(() => new Set(currentRepo ? [currentRepo.id] : []));
  const [message, setMessage] = useState('Upload via Gitofy');
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Record<number, Row>>({});
  const cancelledRef = useRef(false);

  const targets = useMemo(() => repos.filter((r) => selected.has(r.id)), [repos, selected]);
  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };
  const rowStyle: React.CSSProperties = { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant };

  const toggle = (id: number) => {
    if (running) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const start = async () => {
    setRunning(true);
    cancelledRef.current = false;
    triggerHaptic('tick');
    const initial: Record<number, Row> = {};
    targets.forEach((r) => { initial[r.id] = { status: 'waiting', percent: 0 }; });
    setRows(initial);

    let pushed = 0;
    for (const repo of targets) {
      if (cancelledRef.current) break;
      setRows((prev) => ({ ...prev, [repo.id]: { ...prev[repo.id], status: 'running', percent: 0 } }));
      try {
        const result = await gitUploadEngine.executeUpload(zipFile, {
          repoOwner: repoOwnerLogin(repo),
          repoName: repo.name,
          branch: repo.default_branch || settings.defaultBranch || 'main',
          commitMessage: message.trim() || 'Upload via Gitofy',
          token,
          stripRootFolder: settings.stripRootFolder,
          onProgress: (state) => {
            setRows((prev) => ({ ...prev, [repo.id]: { ...prev[repo.id], status: 'running', percent: Math.max(0, Math.min(100, Math.round(state.progress))) } }));
          },
        });
        if (result.success) {
          pushed += 1;
          setRows((prev) => ({ ...prev, [repo.id]: { status: 'done', sha: result.sha, percent: 100 } }));
        } else {
          setRows((prev) => ({ ...prev, [repo.id]: { status: 'failed', error: result.error || 'Upload failed.', percent: 0 } }));
        }
      } catch (e) {
        setRows((prev) => ({ ...prev, [repo.id]: { status: 'failed', error: e instanceof Error ? e.message : 'Upload failed.', percent: 0 } }));
      }
    }

    setRunning(false);
    if (pushed > 0) {
      triggerHaptic('success');
      onFinished(pushed);
    } else {
      triggerHaptic('error');
    }
  };

  const doneCount = Object.values(rows).filter((r) => r.status === 'done').length;
  const failedCount = Object.values(rows).filter((r) => r.status === 'failed').length;

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack} disabled={running}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black truncate">Send to more repositories</div>
          <div className="text-[10px] opacity-60 truncate">{zipFile.name}</div>
        </div>
      </div>

      <div className="p-5 pb-32 flex flex-col gap-4">
        <div className="p-4 rounded-3xl border flex flex-col gap-2" style={card}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Commit message</span>
          <M3TextField label="Message" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            Repositories ({selected.size} selected)
          </span>
          {!running && (
            <button
              type="button"
              className="text-xs font-bold cursor-pointer"
              style={{ color: colors.primary }}
              onClick={() => setSelected((prev) => (prev.size === repos.length ? new Set() : new Set(repos.map((r) => r.id))))}
            >
              {selected.size === repos.length ? 'Clear all' : 'Select all'}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {repos.map((r) => {
            const isCurrent = currentRepo?.id === r.id;
            const on = selected.has(r.id);
            const row = rows[r.id];
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r.id)}
                disabled={running}
                className="p-3.5 rounded-2xl border flex items-center gap-3 text-left cursor-pointer active:scale-[0.99] transition-transform disabled:opacity-70"
                style={{ ...rowStyle, borderColor: on ? colors.primary : colors.outlineVariant }}
              >
                <span
                  className="w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: on ? colors.primary : colors.outlineVariant, backgroundColor: on ? colors.primary : 'transparent' }}
                >
                  {on && <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke={colors.onPrimary} strokeWidth="3.5"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold truncate">{r.name}</span>
                  <span className="block text-[10px] font-mono opacity-60 truncate">
                    {r.default_branch || settings.defaultBranch || 'main'}{isCurrent ? ' · already uploaded' : ''}
                  </span>
                </span>
                {row && (
                  <span className="text-[10px] font-bold flex-shrink-0" style={{
                    color: row.status === 'done' ? colors.diffAdded : row.status === 'failed' ? colors.error : colors.onSurfaceVariant,
                  }}>
                    {row.status === 'running' ? `${row.percent}%` : row.status === 'done' ? '✓' : row.status === 'failed' ? '✕' : '…'}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {failedCount > 0 && (
          <div className="p-4 rounded-2xl border flex flex-col gap-2" style={{ backgroundColor: colors.errorContainer, borderColor: colors.error }}>
            <span className="text-xs font-bold" style={{ color: colors.onErrorContainer }}>{failedCount} could not be uploaded</span>
            {targets.filter((r) => rows[r.id]?.status === 'failed').map((r) => (
              <span key={r.id} className="text-[11px]" style={{ color: colors.onErrorContainer }}>{r.name}: {rows[r.id]?.error}</span>
            ))}
          </div>
        )}

        {doneCount > 0 && !running && (
          <div className="p-4 rounded-2xl border" style={{ backgroundColor: colors.secondaryContainer, borderColor: colors.outlineVariant }}>
            <span className="text-xs font-bold" style={{ color: colors.onSecondaryContainer }}>✓ Pushed to {doneCount} {doneCount === 1 ? 'repository' : 'repositories'}</span>
          </div>
        )}
      </div>

      <div className="fixed left-4 right-4 bottom-6 z-40 flex justify-center">
        <M3Button
          variant="filled" shape="capsule" size="large"
          className="w-full max-w-sm shadow-2xl font-bold"
          loading={running}
          disabled={selected.size === 0 || running}
          onClick={() => void start()}
        >
          {running ? `Uploading ${doneCount + failedCount + 1} of ${targets.length}…` : `Push to ${selected.size} ${selected.size === 1 ? 'repository' : 'repositories'}`}
        </M3Button>
      </div>
    </div>
  );
};
