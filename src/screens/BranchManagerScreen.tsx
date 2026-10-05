import React, { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3TextField } from '../ui/m3/M3TextField';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { Repository } from '../types';
import { repoOwnerLogin } from '../utils/repo';
import { fetchBranches, createBranch, deleteBranch, renameRepoBranch, type BranchInfo } from '../git/githubApi';

interface Props {
  repo: Repository;
  token: string;
  onBack: () => void;
}

/** Create, rename and delete branches without leaving the app. */
export const BranchManagerScreen: React.FC<Props> = ({ repo, token, onBack }) => {
  const { colors, triggerHaptic } = useTheme();
  const owner = repoOwnerLogin(repo);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<BranchInfo | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<BranchInfo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBranches(await fetchBranches(owner, repo.name, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load branches.');
    } finally {
      setLoading(false);
    }
  }, [owner, repo.name, token]);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<void>, okMessage: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      triggerHaptic('success');
      await load();
    } catch (e) {
      triggerHaptic('error');
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
      void okMessage;
    }
  };

  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black truncate">Branches</div>
          <div className="text-[10px] opacity-60 truncate">{repo.full_name}</div>
        </div>
      </div>

      <div className="p-5 pb-28 flex flex-col gap-4">
        <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>New branch</span>
          <M3TextField label="Branch name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="feature/my-change" />
          <M3Button
            variant="filled" shape="capsule" size="compact" className="w-full" loading={busy}
            disabled={!newName.trim()}
            onClick={() => {
              const from = branches.find((b) => b.name === repo.default_branch) ?? branches[0];
              if (!from) return;
              const name = newName.trim();
              setNewName('');
              void run(() => createBranch(owner, repo.name, name, from.sha, token), 'Created');
            }}
          >
            Create from {repo.default_branch || 'the default branch'}
          </M3Button>
        </div>

        {error && (
          <div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.onErrorContainer, borderColor: colors.error }}>{error}</div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            All branches {branches.length ? `(${branches.length})` : ''}
          </span>
          <button type="button" className="text-xs font-bold cursor-pointer" style={{ color: colors.primary }} onClick={() => void load()}>Refresh</button>
        </div>

        {loading ? (
          <SkeletonRows count={5} height={62} />
        ) : branches.length === 0 ? (
          <p className="text-xs opacity-70">No branches found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {branches.map((b) => (
              <div key={b.name} className="p-3.5 rounded-2xl border flex items-center gap-3" style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: b.name === repo.default_branch ? colors.primary : colors.outlineVariant }}>
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: colors.primary }}>
                  <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{b.name}</div>
                  <div className="text-[10px] font-mono opacity-60 truncate">{b.sha.slice(0, 10)}{b.protected ? ' · protected' : ''}</div>
                </div>
                {b.name === repo.default_branch ? (
                  <span className="text-[10px] font-black uppercase" style={{ color: colors.primary }}>Default</span>
                ) : (
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label="Rename" className="p-1.5 cursor-pointer" style={{ color: colors.onSurfaceVariant }} onClick={() => { setRenaming(b); setRenameTo(b.name); }}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                    </button>
                    <button type="button" aria-label="Delete" className="p-1.5 cursor-pointer" style={{ color: colors.error }} onClick={() => setConfirmDelete(b)}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {renaming && (
        <>
          <div className="fixed inset-0 z-[75]" style={{ backgroundColor: 'rgba(0,0,0,.3)' }} onClick={() => setRenaming(null)} />
          <div className="fixed left-1/2 -translate-x-1/2 z-[80] w-[300px] rounded-3xl border p-4 flex flex-col gap-3 gitofy-screen-in" style={{ top: '38%', backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }}>
            <span className="text-sm font-black">Rename {renaming.name}</span>
            <M3TextField label="New name" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
            <div className="flex gap-2">
              <M3Button variant="text" shape="capsule" size="compact" className="flex-1" onClick={() => setRenaming(null)}>Cancel</M3Button>
              <M3Button variant="filled" shape="capsule" size="compact" className="flex-1" loading={busy} onClick={() => {
                const from = renaming.name; const to = renameTo.trim();
                setRenaming(null);
                if (to && to !== from) void run(() => renameRepoBranch(owner, repo.name, from, to, token), 'Renamed');
              }}>Rename</M3Button>
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-[75]" style={{ backgroundColor: 'rgba(0,0,0,.3)' }} onClick={() => setConfirmDelete(null)} />
          <div className="fixed left-1/2 -translate-x-1/2 z-[80] w-[300px] rounded-3xl border p-4 flex flex-col gap-3 gitofy-screen-in" style={{ top: '38%', backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }}>
            <span className="text-sm font-black">Delete “{confirmDelete.name}”?</span>
            <p className="text-xs opacity-75 leading-relaxed">This removes the branch on GitHub. Commits only on that branch may become unreachable.</p>
            <div className="flex gap-2">
              <M3Button variant="text" shape="capsule" size="compact" className="flex-1" onClick={() => setConfirmDelete(null)}>Keep</M3Button>
              <M3Button variant="destructive-filled" shape="capsule" size="compact" className="flex-1" loading={busy} onClick={() => {
                const name = confirmDelete.name;
                setConfirmDelete(null);
                void run(() => deleteBranch(owner, repo.name, name, token), 'Deleted');
              }}>Delete</M3Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
