import React, { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3TextField } from '../ui/m3/M3TextField';
import { M3Switch } from '../ui/m3/M3Switch';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { Repository } from '../types';
import { repoOwnerLogin } from '../utils/repo';
import {
  fetchRepoEditableSettings,
  updateRepoEditableSettings,
  renameRepoBranch,
  type RepoEditableSettings,
} from '../git/githubApi';

interface Props {
  repo: Repository;
  token: string;
  onBack: () => void;
  /** Lets the parent refresh its copy of the repository after a save. */
  onSaved?: (patch: Partial<RepoEditableSettings>) => void;
}

/**
 * Repository settings — the same options GitHub's own repository
 * Settings page edits (description, homepage, visibility, features, merge
 * options, archive and the default-branch rename), backed by the REST API.
 */
export const RepoSettingsScreen: React.FC<Props> = ({ repo, token, onBack, onSaved }) => {
  const { colors, triggerHaptic } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<RepoEditableSettings | null>(null);

  const [description, setDescription] = useState('');
  const [homepage, setHomepage] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [archived, setArchived] = useState(false);
  const [hasIssues, setHasIssues] = useState(true);
  const [hasWiki, setHasWiki] = useState(true);
  const [hasProjects, setHasProjects] = useState(true);
  const [hasDownloads, setHasDownloads] = useState(true);
  const [allowSquash, setAllowSquash] = useState(true);
  const [allowMerge, setAllowMerge] = useState(true);
  const [allowRebase, setAllowRebase] = useState(true);

  const [branchName, setBranchName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchRepoEditableSettings(repoOwnerLogin(repo), repo.name, token);
      setSettings(s);
      setDescription(s.description ?? '');
      setHomepage(s.homepage ?? '');
      setIsPrivate(s.private);
      setArchived(s.archived);
      setHasIssues(s.has_issues);
      setHasWiki(s.has_wiki);
      setHasProjects(s.has_projects);
      setHasDownloads(s.has_downloads);
      setAllowSquash(s.allow_squash_merge);
      setAllowMerge(s.allow_merge_commit);
      setAllowRebase(s.allow_rebase_merge);
      setBranchName(s.default_branch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load repository settings.');
    } finally {
      setLoading(false);
    }
  }, [repo, token]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const patch: Partial<RepoEditableSettings> = {
        description: description.trim() || null,
        homepage: homepage.trim() || null,
        private: isPrivate,
        archived,
        has_issues: hasIssues,
        has_wiki: hasWiki,
        has_projects: hasProjects,
        has_downloads: hasDownloads,
        allow_squash_merge: allowSquash,
        allow_merge_commit: allowMerge,
        allow_rebase_merge: allowRebase,
      };
      const s = await updateRepoEditableSettings(repoOwnerLogin(repo), repo.name, token, patch);
      setSettings(s);
      triggerHaptic('success');
      setSaved(true);
      onSaved?.(patch);
      window.setTimeout(() => setSaved(false), 2600);
    } catch (e) {
      triggerHaptic('error');
      setError(e instanceof Error ? e.message : 'Could not save repository settings.');
    } finally {
      setSaving(false);
    }
  };

  const renameBranch = async () => {
    const next = branchName.trim();
    if (!settings || !next || next === settings.default_branch) return;
    setRenaming(true);
    setError(null);
    try {
      await renameRepoBranch(repoOwnerLogin(repo), repo.name, settings.default_branch, next, token);
      triggerHaptic('success');
      setSettings({ ...settings, default_branch: next });
      setSaved(true);
      onSaved?.({ default_branch: next });
      window.setTimeout(() => setSaved(false), 2600);
    } catch (e) {
      triggerHaptic('error');
      setError(e instanceof Error ? e.message : 'Could not rename the branch.');
    } finally {
      setRenaming(false);
    }
  };

  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };
  const row = 'flex items-center justify-between gap-3';

  const Toggle: React.FC<{ title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }> = ({ title, hint, checked, onChange }) => (
    <div className={row}>
      <div className="pr-3">
        <p className="text-xs font-bold">{title}</p>
        <p className="text-[10px] opacity-70 leading-relaxed">{hint}</p>
      </div>
      <M3Switch checked={checked} onChange={onChange} />
    </div>
  );

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black truncate">{repo.name} settings</div>
          <div className="text-[10px] opacity-60 truncate">{repo.full_name}</div>
        </div>
      </div>

      <div className="p-5 pb-28 flex flex-col gap-4">
        {loading ? (
          <SkeletonRows count={7} height={56} />
        ) : (
          <>
            <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>General</span>
              <M3TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
              <M3TextField label="Website" value={homepage} onChange={(e) => setHomepage(e.target.value)} placeholder="https://example.com" />
              <Toggle title="Private repository" hint="Only you and collaborators you invite can see this repository." checked={isPrivate} onChange={setIsPrivate} />
            </div>

            <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Features</span>
              <Toggle title="Issues" hint="Track ideas, feedback and tasks." checked={hasIssues} onChange={setHasIssues} />
              <Toggle title="Wikis" hint="Host documentation for the project." checked={hasWiki} onChange={setHasWiki} />
              <Toggle title="Projects" hint="Organise work with boards." checked={hasProjects} onChange={setHasProjects} />
              <Toggle title="Downloads" hint="Show the downloads section." checked={hasDownloads} onChange={setHasDownloads} />
            </div>

            <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Pull requests</span>
              <Toggle title="Allow squash merging" hint="Combine all commits into one on merge." checked={allowSquash} onChange={setAllowSquash} />
              <Toggle title="Allow merge commits" hint="Add all commits from the head branch." checked={allowMerge} onChange={setAllowMerge} />
              <Toggle title="Allow rebase merging" hint="Add all commits individually." checked={allowRebase} onChange={setAllowRebase} />
            </div>

            <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Default branch</span>
              <p className="text-[10px] opacity-70 leading-relaxed">
                Currently <span className="font-mono font-bold">{settings?.default_branch}</span>. Renaming it updates the repository immediately.
              </p>
              <M3TextField label="Rename default branch" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="main" />
              <M3Button variant="tonal" shape="capsule" size="compact" className="w-full" loading={renaming} disabled={!settings || branchName.trim() === settings.default_branch} onClick={renameBranch}>
                Rename branch
              </M3Button>
            </div>

            <div className="p-5 rounded-3xl border flex flex-col gap-3" style={{ borderColor: colors.error, backgroundColor: colors.errorContainer }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.error }}>Danger zone</span>
              <div className={row}>
                <div className="pr-3">
                  <p className="text-xs font-bold">Archive this repository</p>
                  <p className="text-[10px] opacity-80 leading-relaxed">Makes it read-only. You can unarchive it at any time.</p>
                </div>
                <M3Switch checked={archived} onChange={setArchived} />
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.onErrorContainer, borderColor: colors.error }}>{error}</div>
            )}
            {saved && (
              <div className="rounded-2xl border px-3 py-2 text-xs font-semibold animate-fade-in" style={{ backgroundColor: colors.diffAddedContainer, color: colors.diffAdded, borderColor: colors.diffAdded }}>✓ Saved to GitHub</div>
            )}

            <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" loading={saving} onClick={save}>
              Save repository settings
            </M3Button>
          </>
        )}
      </div>
    </div>
  );
};
