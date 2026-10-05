import React, { useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3TextField } from '../ui/m3/M3TextField';
import { M3Switch } from '../ui/m3/M3Switch';
import { Repository } from '../types';
import { repoOwnerLogin } from '../utils/repo';
import { createRelease, uploadReleaseAsset } from '../git/githubApi';
import { openExternal } from '../utils/external';

interface Props {
  repo: Repository;
  token: string;
  onBack: () => void;
  onCreated?: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Create a GitHub release and attach an APK (or any file) to it. */
export const ReleaseCreatorScreen: React.FC<Props> = ({ repo, token, onBack, onCreated }) => {
  const { colors, triggerHaptic } = useTheme();
  const owner = repoOwnerLogin(repo);
  const defaultBranch = repo.default_branch || 'main';

  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [branch, setBranch] = useState(defaultBranch);
  const [draft, setDraft] = useState(false);
  const [prerelease, setPrerelease] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);

  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const created = await createRelease(
        owner,
        repo.name,
        { tag_name: tag.trim(), name: name.trim() || tag.trim(), body, target_commitish: branch.trim() || defaultBranch, draft, prerelease },
        token
      );
      // The upload URL is the release's own endpoint with the template removed.
      if (file) {
        setProgress({ sent: 0, total: file.size });
        await uploadReleaseAsset(`https://uploads.github.com/repos/${owner}/${repo.name}/releases/${created.id}/assets`, file, token, (sent, total) =>
          setProgress({ sent, total })
        );
      }
      triggerHaptic('success');
      setDone(created.html_url);
      onCreated?.();
    } catch (e) {
      triggerHaptic('error');
      setError(e instanceof Error ? e.message : 'Could not create the release.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pct = progress && progress.total ? Math.round((progress.sent / progress.total) * 100) : 0;

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black truncate">New release</div>
          <div className="text-[10px] opacity-60 truncate">{repo.full_name}</div>
        </div>
      </div>

      <div className="p-5 pb-28 flex flex-col gap-4">
        <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
          <M3TextField label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="v1.0.0" />
          <M3TextField label="Release title" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gitofy 1.0.0" />
          <M3TextField label="Target branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="What changed in this release…"
            className="w-full rounded-2xl border p-3 text-xs outline-none"
            style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface }}
          />
        </div>

        <div className="p-5 rounded-3xl border flex flex-col gap-4" style={card}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold">Draft</p>
              <p className="text-[10px] opacity-70">Save it without publishing.</p>
            </div>
            <M3Switch checked={draft} onChange={setDraft} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold">Pre-release</p>
              <p className="text-[10px] opacity-70">Mark it as not ready for everyone.</p>
            </div>
            <M3Switch checked={prerelease} onChange={setPrerelease} />
          </div>
        </div>

        <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>Attach a file</span>
          <label className="flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed cursor-pointer text-xs font-bold" style={{ borderColor: colors.outlineVariant, color: colors.primary }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            {file ? file.name : 'Choose an APK or any file'}
            <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && (
            <div className="flex items-center justify-between text-[11px] opacity-70">
              <span>{formatBytes(file.size)}</span>
              <button type="button" className="font-bold cursor-pointer" style={{ color: colors.error }} onClick={() => setFile(null)}>Remove</button>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.onErrorContainer, borderColor: colors.error }}>{error}</div>
        )}

        {progress && (
          <div className="p-4 rounded-2xl border flex flex-col gap-2" style={card}>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span>Uploading {file?.name}</span>
              <span style={{ color: colors.primary }}>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.surfaceContainerHighest }}>
              <div className="h-full rounded-full transition-all duration-200" style={{ width: `${pct}%`, backgroundColor: colors.primary }} />
            </div>
            <span className="text-[10px] opacity-70 font-mono">{formatBytes(progress.sent)} / {formatBytes(progress.total)}</span>
          </div>
        )}

        {done && (
          <div className="p-4 rounded-2xl border flex flex-col gap-2" style={{ backgroundColor: colors.secondaryContainer, borderColor: colors.outlineVariant }}>
            <span className="text-xs font-bold" style={{ color: colors.onSecondaryContainer }}>✓ Release created</span>
            <M3Button variant="tonal" shape="capsule" size="compact" onClick={() => openExternal(done)}>Open on GitHub ↗</M3Button>
          </div>
        )}

        <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" loading={busy} disabled={!tag.trim()} onClick={submit}>
          Create release
        </M3Button>
      </div>
    </div>
  );
};
