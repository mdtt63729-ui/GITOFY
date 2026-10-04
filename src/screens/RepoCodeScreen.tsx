import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { useTheme } from '../ui/ThemeContext';
import { openExternal } from '../utils/external';
import { Repository } from '../types';
import {
  addRepoCommitComment,
  commitRepoFileChange,
  fetchRepoCommits,
  fetchRepoTree,
  fetchRepoFile,
  type RepoTreeEntry,
  type RepoCommit,
} from '../git/githubApi';

interface Props {
  repo: Repository;
  token: string;
  initialTab: 'files' | 'commits';
  onBack: () => void;
}

type View = { kind: 'tree'; path: string } | { kind: 'file'; path: string; sha: string } | { kind: 'commit'; sha: string };

const iconFor = (entry: RepoTreeEntry) => entry.type === 'tree' ? 'folder' : 'file';

export const RepoCodeScreen: React.FC<Props> = ({ repo, token, initialTab, onBack }) => {
  const { colors, triggerHaptic } = useTheme();
  const [tab, setTab] = useState<'files' | 'commits'>(initialTab);
  const [view, setView] = useState<View>({ kind: 'tree', path: '' });
  const [tree, setTree] = useState<RepoTreeEntry[]>([]);
  const [commits, setCommits] = useState<RepoCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileSha, setFileSha] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [commitMessage, setCommitMessage] = useState('Update file via Gitofy');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentLine, setCommentLine] = useState('1');
  const [commenting, setCommenting] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const loadTree = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setTree(await fetchRepoTree(repo.owner.login, repo.name, repo.default_branch, token));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load repository files.'); }
    finally { setLoading(false); }
  }, [repo, token]);

  const loadCommits = useCallback(async () => {
    setLoading(true); setError(null);
    try { setCommits(await fetchRepoCommits(repo.owner.login, repo.name, repo.default_branch, token)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load commits.'); }
    finally { setLoading(false); }
  }, [repo, token]);

  useEffect(() => { if (tab === 'files') void loadTree(); else void loadCommits(); }, [tab, loadTree, loadCommits]);

  const currentEntries = useMemo(() => {
    if (view.kind !== 'tree') return [];
    const prefix = view.path ? `${view.path.replace(/\/$/, '')}/` : '';
    return tree
      .filter(e => e.path.startsWith(prefix))
      .filter(e => {
        const rest = e.path.slice(prefix.length);
        return rest && !rest.includes('/');
      })
      .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1);
  }, [tree, view]);

  const openFile = async (entry: RepoTreeEntry) => {
    if (entry.type === 'tree') { setView({ kind: 'tree', path: entry.path }); setMenuPath(null); return; }
    setFileLoading(true); setError(null); setMenuPath(null); setView({ kind: 'file', path: entry.path, sha: entry.sha });
    try {
      const result = await fetchRepoFile(repo.owner.login, repo.name, entry.path, token, repo.default_branch);
      setFileContent(result.content); setDraft(result.content); setFileSha(result.sha);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open file.'); }
    finally { setFileLoading(false); }
  };

  const downloadFile = (path: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = path.split('/').pop() || 'file'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setMenuPath(null); triggerHaptic('success');
  };

  const saveFile = async () => {
    if (view.kind !== 'file' || !token.trim()) return;
    setSaving(true); setError(null);
    try {
      const result = await commitRepoFileChange(repo.owner.login, repo.name, view.path, draft, fileSha, commitMessage, repo.default_branch, token);
      setFileContent(draft); setFileSha(result.contentSha); setEditing(false); setSuccess(`Changes committed: ${result.commitSha.slice(0, 7)}`); setCommitMessage('Update file via Gitofy');
      triggerHaptic('success');
      window.setTimeout(() => setSuccess(null), 2600);
      await loadTree();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not commit changes.'); }
    finally { setSaving(false); }
  };

  const submitComment = async () => {
    if (view.kind !== 'file' || !commentText.trim()) return;
    setCommenting(true); setError(null);
    try {
      const sha = commits[0]?.sha || (await fetchRepoCommits(repo.owner.login, repo.name, repo.default_branch, token))[0]?.sha;
      if (!sha) throw new Error('No commit is available for this comment.');
      await addRepoCommitComment(repo.owner.login, repo.name, sha, commentText.trim(), view.path, Number(commentLine) || 1, token);
      setCommentText(''); setCommentOpen(false); setSuccess('Comment posted to GitHub'); triggerHaptic('success');
      window.setTimeout(() => setSuccess(null), 2600);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not post comment.'); }
    finally { setCommenting(false); }
  };

  const startLongPress = (path: string) => {
    longPressedRef.current = false;
    longPressTimer.current = window.setTimeout(() => { longPressedRef.current = true; setMenuPath(path); triggerHaptic('heavy'); }, 600);
  };
  const cancelLongPress = () => { if (longPressTimer.current) window.clearTimeout(longPressTimer.current); longPressTimer.current = null; };
  const handleEntryClick = (entry: RepoTreeEntry) => {
    if (longPressedRef.current) { longPressedRef.current = false; return; }
    void openFile(entry);
  };

  const breadcrumbs = view.kind === 'commit' ? [] : view.kind === 'tree' ? view.path.split('/').filter(Boolean) : view.path.split('/').slice(0, -1).filter(Boolean);

  return (
    <div className="flex-1 min-h-0 flex flex-col gitofy-scroll animate-fade-in" style={{ backgroundColor: colors.surface }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></M3IconButton>
        <div className="min-w-0 flex-1"><div className="text-sm font-black truncate">{repo.name}</div><div className="text-[10px] opacity-60">{tab === 'files' ? 'Files' : 'Commits'} · {repo.default_branch}</div></div>
        <M3IconButton aria-label="Refresh" onClick={() => tab === 'files' ? void loadTree() : void loadCommits()}><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8.1 8.1 0 0 0-14.9-4L3 10"/><path d="M3 5v5h5"/><path d="M4 13a8.1 8.1 0 0 0 14.9 4L21 14"/><path d="M21 19v-5h-5"/></svg></M3IconButton>
      </div>

      <div className="px-4 pt-3"><div className="flex p-1 rounded-2xl border" style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}>
        {(['files','commits'] as const).map(t => <button key={t} type="button" className="flex-1 py-2.5 rounded-xl text-sm font-black transition-all" style={{ backgroundColor: tab === t ? colors.primary : 'transparent', color: tab === t ? colors.onPrimary : colors.onSurface }} onClick={() => { triggerHaptic('tick'); setTab(t); setView({ kind: t === 'files' ? 'tree' : 'commit', sha: '' } as View); }}>{t === 'files' ? 'Files' : 'Commits'}</button>)}
      </div></div>

      {success && <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" style={{backgroundColor:'rgba(0,0,0,.35)'}}><div className="w-full max-w-sm rounded-[32px] p-7 text-center border shadow-2xl animate-scale-in" style={{backgroundColor:colors.surfaceContainerHigh,borderColor:colors.outlineVariant}}><div className="mx-auto w-24 h-24 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-lg"><svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l4 4L19 6"/></svg></div><h3 className="mt-5 text-xl font-black">Success</h3><p className="mt-2 text-sm opacity-70">{success}</p><M3Button className="mt-5 w-full" variant="filled" onClick={()=>setSuccess(null)}>Continue</M3Button></div></div>}
      {error && <div className="mx-4 mt-3 p-3 rounded-2xl text-sm font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.error }}>{error}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-28">
        {tab === 'files' && view.kind === 'tree' && <>
          <div className="flex items-center gap-1 text-xs mb-3 overflow-x-auto whitespace-nowrap"><button className="font-black" onClick={() => setView({kind:'tree',path:''})}>root</button>{breadcrumbs.map((b,i) => <React.Fragment key={b+i}><span className="opacity-40">/</span><button className="font-bold" onClick={() => setView({kind:'tree',path:breadcrumbs.slice(0,i+1).join('/')})}>{b}</button></React.Fragment>)}</div>
          {loading ? <div className="py-16 text-center text-sm opacity-60">Loading project structure…</div> : currentEntries.length === 0 ? <div className="py-16 text-center text-sm opacity-60">This folder is empty.</div> : <div className="rounded-3xl border overflow-hidden" style={{ borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLow }}>{currentEntries.map((entry,i) => <div key={entry.path} className="relative flex items-center gap-3 px-4 py-3.5 border-b last:border-b-0 active:scale-[0.995] transition-transform" style={{ borderColor: colors.outlineVariant }} onPointerDown={() => startLongPress(entry.path)} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} onPointerLeave={cancelLongPress} onClick={() => handleEntryClick(entry)}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: entry.type === 'tree' ? colors.primaryContainer : colors.surfaceContainerHighest, color: entry.type === 'tree' ? colors.onPrimaryContainer : colors.onSurfaceVariant }}><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">{entry.type === 'tree' ? <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/> : <path d="M6 3h8l4 4v14H6zM14 3v5h5"/>}</svg></div>
            <div className="min-w-0 flex-1"><div className="text-sm font-bold truncate">{entry.name}</div><div className="text-[10px] opacity-55">{entry.type === 'tree' ? 'Folder' : `${entry.size ?? 0} bytes`}</div></div><span className="opacity-35">›</span>
            {menuPath === entry.path && <div className="absolute right-3 top-12 z-40 w-44 rounded-2xl border p-1.5 shadow-2xl" style={{backgroundColor:colors.surfaceContainerHigh,borderColor:colors.outlineVariant}} onClick={e=>e.stopPropagation()}>{entry.type === 'blob' && <button className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold" onClick={()=>openFile(entry)}>Edit</button>}<button className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold" onClick={()=>openFile(entry)}>Open</button>{entry.type === 'blob' && <button className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold" onClick={()=>{setMenuPath(null); void (async()=>{const r=await fetchRepoFile(repo.owner.login,repo.name,entry.path,token,repo.default_branch);downloadFile(entry.path,r.content)})()}}>Download</button>}</div>}
          </div>)}</div>}
        </>}

        {tab === 'files' && view.kind === 'file' && <>
          <div className="flex items-center gap-2 mb-3"><button className="text-sm font-black" onClick={()=>setView({kind:'tree',path:view.path.split('/').slice(0,-1).join('/')})}>‹ Files</button><span className="opacity-35">/</span><span className="text-xs font-mono truncate">{view.path}</span></div>
          {fileLoading ? <div className="py-16 text-center opacity-60">Opening file…</div> : <>
            <div className="flex gap-2 mb-3"><M3Button size="compact" variant="filled" onClick={()=>setEditing(v=>!v)}>{editing?'Cancel edit':'Edit'}</M3Button><M3Button size="compact" variant="tonal" onClick={()=>downloadFile(view.path,fileContent)}>Download</M3Button><M3Button size="compact" variant="tonal" onClick={()=>setCommentOpen(true)}>Comment</M3Button></div>
            {editing ? <div className="flex flex-col gap-3"><textarea value={draft} onChange={e=>setDraft(e.target.value)} className="w-full min-h-[55vh] rounded-2xl border p-4 font-mono text-xs leading-5 outline-none resize-y" style={{backgroundColor:colors.surfaceContainerLowest,borderColor:colors.outlineVariant,color:colors.onSurface}} spellCheck={false}/><input value={commitMessage} onChange={e=>setCommitMessage(e.target.value)} className="rounded-xl border px-3 py-3 text-sm outline-none" style={{backgroundColor:colors.surfaceContainerLowest,borderColor:colors.outlineVariant,color:colors.onSurface}} placeholder="Commit message"/><M3Button variant="filled" size="large" loading={saving} onClick={saveFile}>Commit changes</M3Button></div> : <pre className="rounded-2xl border p-4 overflow-auto text-[11px] leading-5 font-mono whitespace-pre-wrap break-words" style={{backgroundColor:colors.surfaceContainerLowest,borderColor:colors.outlineVariant}}>{fileContent}</pre>}
          </>}
        </>}

        {tab === 'commits' && <>{loading ? <div className="py-16 text-center opacity-60">Loading commits…</div> : commits.length === 0 ? <div className="py-16 text-center opacity-60">No commits found.</div> : <div className="flex flex-col gap-2">{commits.map(c=><button key={c.sha} type="button" className="text-left p-4 rounded-2xl border transition-transform active:scale-[0.99]" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}} onClick={()=>openExternal(c.html_url)}><div className="flex gap-3"><img src={c.author?.avatar_url} className="w-9 h-9 rounded-full" alt=""/><div className="min-w-0 flex-1"><div className="text-sm font-black truncate">{c.message}</div><div className="text-xs mt-1 opacity-65">{c.author?.login || c.committer?.login || 'GitHub user'} · {new Date(c.date).toLocaleString()}</div><div className="text-[10px] font-mono mt-2 opacity-50">{c.sha.slice(0,7)}</div></div></div></button>)}</div>}</>}
      </div>

      {commentOpen && <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4" style={{backgroundColor:'rgba(0,0,0,.45)'}}><div className="w-full max-w-md rounded-3xl p-5 border" style={{backgroundColor:colors.surfaceContainerHigh,borderColor:colors.outlineVariant}}><h3 className="text-lg font-black">Comment on {view.kind==='file'?view.path.split('/').pop():''}</h3><p className="text-xs opacity-60 mt-1">Posts a real GitHub commit comment on the selected file.</p><input value={commentLine} onChange={e=>setCommentLine(e.target.value)} type="number" min="1" className="mt-4 w-full rounded-xl border px-3 py-3 text-sm" style={{backgroundColor:colors.surfaceContainerLowest,borderColor:colors.outlineVariant}} placeholder="Line number"/><textarea value={commentText} onChange={e=>setCommentText(e.target.value)} className="mt-2 w-full min-h-28 rounded-xl border p-3 text-sm resize-none" style={{backgroundColor:colors.surfaceContainerLowest,borderColor:colors.outlineVariant}} placeholder="Write your comment…"/><div className="flex gap-2 mt-3"><M3Button className="flex-1" variant="tonal" onClick={()=>setCommentOpen(false)}>Cancel</M3Button><M3Button className="flex-1" variant="filled" loading={commenting} onClick={submitComment}>Post comment</M3Button></div></div></div>}
    </div>
  );
};
