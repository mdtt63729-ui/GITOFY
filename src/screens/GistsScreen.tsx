import React, { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3TextField } from '../ui/m3/M3TextField';
import { M3Switch } from '../ui/m3/M3Switch';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { fetchGists, createGist, deleteGist, type GistInfo } from '../git/githubApi';
import { openExternal } from '../utils/external';

interface Props {
  token: string;
  onBack: () => void;
}

/** Your GitHub gists — list, create and delete. */
export const GistsScreen: React.FC<Props> = ({ token, onBack }) => {
  const { colors, triggerHaptic } = useTheme();
  const [gists, setGists] = useState<GistInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);

  const [filename, setFilename] = useState('snippet.txt');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<GistInfo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGists(await fetchGists(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your gists.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black truncate">Gists</div>
          <div className="text-[10px] opacity-60 truncate">Your GitHub snippets</div>
        </div>
        <M3IconButton aria-label="New gist" onClick={() => { triggerHaptic('tick'); setComposing(true); }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </M3IconButton>
      </div>

      <div className="p-5 pb-28 flex flex-col gap-4">
        {error && (
          <div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.onErrorContainer, borderColor: colors.error }}>{error}</div>
        )}

        {loading ? (
          <SkeletonRows count={5} height={70} />
        ) : gists.length === 0 ? (
          <div className="p-6 rounded-3xl border text-center" style={card}>
            <p className="text-sm font-bold">No gists yet</p>
            <p className="text-xs opacity-70 mt-1">Tap + to save your first snippet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {gists.map((g) => (
              <div key={g.id} className="p-3.5 rounded-2xl border flex flex-col gap-2" style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{g.description || g.files[0]?.filename || 'Untitled gist'}</div>
                    <div className="text-[10px] font-mono opacity-60 truncate">
                      {g.files.map((f) => f.filename).join(', ')}
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}>
                    {g.public ? 'Public' : 'Secret'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] opacity-60">
                  <span>{g.created_at ? new Date(g.created_at).toLocaleDateString() : ''}</span>
                  <span>·</span>
                  <span>{g.files.length} file{g.files.length === 1 ? '' : 's'}</span>
                </div>
                <div className="flex gap-2 pt-0.5">
                  <M3Button variant="tonal" shape="capsule" size="compact" className="flex-1" onClick={() => openExternal(g.html_url)}>Open on GitHub ↗</M3Button>
                  <M3Button variant="text" shape="capsule" size="compact" onClick={() => setConfirmDelete(g)}>Delete</M3Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {composing && (
        <>
          <div className="fixed inset-0 z-[75]" style={{ backgroundColor: 'rgba(0,0,0,.3)' }} onClick={() => setComposing(false)} />
          <div className="fixed left-1/2 -translate-x-1/2 z-[80] w-[330px] max-h-[78vh] overflow-y-auto gitofy-scroll rounded-3xl border p-4 flex flex-col gap-3 gitofy-screen-in" style={{ top: '12%', backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }}>
            <span className="text-sm font-black">New gist</span>
            <M3TextField label="File name" value={filename} onChange={(e) => setFilename(e.target.value)} />
            <M3TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your code…"
              rows={7}
              className="w-full rounded-2xl border p-3 text-xs font-mono outline-none"
              style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface }}
            />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold">Public gist</p>
                <p className="text-[10px] opacity-70">Anyone can find it. Off keeps it secret.</p>
              </div>
              <M3Switch checked={isPublic} onChange={setIsPublic} />
            </div>
            <div className="flex gap-2">
              <M3Button variant="text" shape="capsule" size="compact" className="flex-1" onClick={() => setComposing(false)}>Cancel</M3Button>
              <M3Button variant="filled" shape="capsule" size="compact" className="flex-1" loading={busy} disabled={!filename.trim() || !content.trim()} onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await createGist(token, description.trim(), filename.trim(), content, isPublic);
                  triggerHaptic('success');
                  setComposing(false);
                  setContent(''); setDescription(''); setFilename('snippet.txt'); setIsPublic(false);
                  await load();
                } catch (e) {
                  triggerHaptic('error');
                  setError(e instanceof Error ? e.message : 'Could not create the gist.');
                } finally {
                  setBusy(false);
                }
              }}>Create</M3Button>
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-[75]" style={{ backgroundColor: 'rgba(0,0,0,.3)' }} onClick={() => setConfirmDelete(null)} />
          <div className="fixed left-1/2 -translate-x-1/2 z-[80] w-[300px] rounded-3xl border p-4 flex flex-col gap-3 gitofy-screen-in" style={{ top: '38%', backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }}>
            <span className="text-sm font-black">Delete this gist?</span>
            <p className="text-xs opacity-75 leading-relaxed">{confirmDelete.description || confirmDelete.files[0]?.filename}</p>
            <div className="flex gap-2">
              <M3Button variant="text" shape="capsule" size="compact" className="flex-1" onClick={() => setConfirmDelete(null)}>Keep</M3Button>
              <M3Button variant="destructive-filled" shape="capsule" size="compact" className="flex-1" loading={busy} onClick={async () => {
                const id = confirmDelete.id;
                setConfirmDelete(null);
                setBusy(true);
                try {
                  await deleteGist(token, id);
                  triggerHaptic('success');
                  setGists((prev) => prev.filter((g) => g.id !== id));
                } catch (e) {
                  triggerHaptic('error');
                  setError(e instanceof Error ? e.message : 'Could not delete the gist.');
                } finally {
                  setBusy(false);
                }
              }}>Delete</M3Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
