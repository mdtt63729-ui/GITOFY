import React, { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3TextField } from '../ui/m3/M3TextField';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { Repository } from '../types';
import { repoOwnerLogin } from '../utils/repo';
import {
  fetchRepoIssues, fetchRepoPulls, createIssue, setIssueState, fetchIssueComments,
  addIssueComment, mergePullRequest, type IssueInfo, type IssueComment,
} from '../git/githubApi';
import { openExternal } from '../utils/external';

interface Props {
  repo: Repository;
  token: string;
  onBack: () => void;
}

type Tab = 'issues' | 'pulls';

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!t) return '';
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Issues and pull requests for one repository: list, read, create, close, merge. */
export const IssuesScreen: React.FC<Props> = ({ repo, token, onBack }) => {
  const { colors, triggerHaptic } = useTheme();
  const owner = repoOwnerLogin(repo);

  const [tab, setTab] = useState<Tab>('issues');
  const [state, setState] = useState<'open' | 'closed'>('open');
  const [items, setItems] = useState<IssueInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<IssueInfo | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');

  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(tab === 'issues' ? await fetchRepoIssues(owner, repo.name, token, state) : await fetchRepoPulls(owner, repo.name, token, state));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load them.');
    } finally {
      setLoading(false);
    }
  }, [owner, repo.name, token, tab, state]);

  useEffect(() => { if (!detail) void load(); }, [load, detail]);

  const openDetail = async (item: IssueInfo) => {
    triggerHaptic('tick');
    setDetail(item);
    setComments([]);
    setLoadingComments(true);
    try {
      setComments(await fetchIssueComments(owner, repo.name, item.number, token));
    } catch {
      /* an empty thread is fine; the issue itself still shows */
    } finally {
      setLoadingComments(false);
    }
  };

  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };
  const row: React.CSSProperties = { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant };

  /* ------------------------------- detail ------------------------------- */
  if (detail) {
    const toggle = async () => {
      setBusy(true);
      try {
        const next = detail.state === 'open' ? 'closed' : 'open';
        await setIssueState(owner, repo.name, detail.number, next, token, detail.isPull);
        triggerHaptic('success');
        setDetail({ ...detail, state: next });
        await load();
      } catch (e) {
        triggerHaptic('error');
        setError(e instanceof Error ? e.message : 'That did not work.');
      } finally {
        setBusy(false);
      }
    };

    const merge = async () => {
      setBusy(true);
      try {
        await mergePullRequest(owner, repo.name, detail.number, token);
        triggerHaptic('success');
        setDetail({ ...detail, merged: true, state: 'closed' });
        await load();
      } catch (e) {
        triggerHaptic('error');
        setError(e instanceof Error ? e.message : 'Could not merge.');
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="gitofy-screen-in flex-1 flex flex-col gitofy-scroll select-none" style={{ backgroundColor: colors.background }}>
        <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
          <M3IconButton aria-label="Back" onClick={() => setDetail(null)}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </M3IconButton>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black truncate">{detail.isPull ? `Pull request #${detail.number}` : `Issue #${detail.number}`}</div>
            <div className="text-[10px] opacity-60 truncate">{repo.full_name}</div>
          </div>
        </div>

        <div className="p-5 pb-28 flex flex-col gap-4">
          <div className="p-5 rounded-3xl border flex flex-col gap-3" style={card}>
            <div className="flex items-start gap-2">
              <span className="text-base font-black flex-1 leading-snug">{detail.title}</span>
              <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: detail.merged ? colors.tertiaryContainer : detail.state === 'open' ? colors.primaryContainer : colors.surfaceContainerHighest,
                  color: detail.merged ? colors.onTertiaryContainer : detail.state === 'open' ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                }}>
                {detail.merged ? 'Merged' : detail.state}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] opacity-70">
              {detail.userAvatar && <img src={detail.userAvatar} className="w-5 h-5 rounded-full" alt="" />}
              <span className="font-semibold">{detail.user}</span>
              <span>·</span>
              <span>{timeAgo(detail.createdAt)}</span>
              {detail.isPull && detail.head && detail.base && (
                <>
                  <span>·</span>
                  <span className="font-mono text-[10px] truncate">{detail.head} → {detail.base}</span>
                </>
              )}
            </div>
            {detail.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.labels.map((l) => (
                  <span key={l.name} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `#${l.color}22`, color: colors.onSurface, border: `1px solid #${l.color}66` }}>{l.name}</span>
                ))}
              </div>
            )}
            {detail.body && <p className="text-xs leading-relaxed whitespace-pre-wrap opacity-90">{detail.body}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {detail.isPull && detail.state === 'open' && !detail.merged && (
                <M3Button variant="filled" shape="capsule" size="compact" loading={busy} onClick={merge}>Merge</M3Button>
              )}
              <M3Button variant="tonal" shape="capsule" size="compact" loading={busy} onClick={toggle}>
                {detail.state === 'open' ? 'Close' : 'Reopen'}
              </M3Button>
              <M3Button variant="text" shape="capsule" size="compact" onClick={() => openExternal(detail.htmlUrl)}>On GitHub ↗</M3Button>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.onErrorContainer, borderColor: colors.error }}>{error}</div>
          )}

          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.onSurfaceVariant }}>
            {detail.comments ? `${detail.comments} comment${detail.comments === 1 ? '' : 's'}` : 'Comments'}
          </span>

          {loadingComments ? (
            <SkeletonRows count={2} height={70} />
          ) : comments.length === 0 ? (
            <p className="text-xs opacity-70">No comments yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {comments.map((c) => (
                <div key={c.id} className="p-3.5 rounded-2xl border flex gap-3" style={row}>
                  <img src={c.userAvatar} className="w-7 h-7 rounded-full flex-shrink-0" alt="" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold">{c.user} <span className="opacity-60 font-normal">· {timeAgo(c.createdAt)}</span></div>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap mt-1 opacity-90">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              rows={3}
              placeholder="Write a comment…"
              className="w-full rounded-2xl border p-3 text-xs outline-none"
              style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface }}
            />
            <M3Button
              variant="filled" shape="capsule" size="compact" loading={busy}
              disabled={!commentDraft.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await addIssueComment(owner, repo.name, detail.number, commentDraft.trim(), token);
                  triggerHaptic('success');
                  setCommentDraft('');
                  setComments(await fetchIssueComments(owner, repo.name, detail.number, token));
                } catch (e) {
                  triggerHaptic('error');
                  setError(e instanceof Error ? e.message : 'Could not post the comment.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Post comment
            </M3Button>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------- list -------------------------------- */
  return (
    <div className="gitofy-screen-in flex-1 flex flex-col select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black truncate">Issues &amp; Pull requests</div>
          <div className="text-[10px] opacity-60 truncate">{repo.full_name}</div>
        </div>
        <M3IconButton aria-label="New issue" onClick={() => { triggerHaptic('tick'); setComposing(true); }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </M3IconButton>
      </div>

      <div className="px-5 pt-4 flex flex-col gap-3">
        <div className="flex gap-2 p-1 rounded-full border" style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}>
          {([['issues', 'Issues'], ['pulls', 'Pull requests']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => { triggerHaptic('tick'); setTab(id as Tab); }}
              className="flex-1 py-2 rounded-full text-xs font-bold cursor-pointer transition-all"
              style={{ backgroundColor: tab === id ? colors.primary : 'transparent', color: tab === id ? colors.onPrimary : colors.onSurface }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['open', 'closed'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setState(s)}
              className="px-3.5 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer capitalize"
              style={{ backgroundColor: state === s ? colors.secondaryContainer : 'transparent', color: colors.onSurface, borderColor: colors.outlineVariant }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 gitofy-scroll px-5 py-4 pb-24 flex flex-col gap-2">
        {error && (
          <div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.onErrorContainer, borderColor: colors.error }}>{error}</div>
        )}
        {loading ? (
          <SkeletonRows count={5} height={72} />
        ) : items.length === 0 ? (
          <p className="text-xs opacity-70 py-6 text-center">Nothing {state} here.</p>
        ) : (
          items.map((it) => (
            <button key={it.number} type="button" onClick={() => void openDetail(it)}
              className="text-left p-3.5 rounded-2xl border flex flex-col gap-1.5 cursor-pointer active:scale-[0.99] transition-transform" style={row}>
              <div className="flex items-start gap-2">
                <span className="text-sm font-bold flex-1 leading-snug">{it.title}</span>
                {it.isPull && it.draft && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>Draft</span>}
              </div>
              <div className="flex items-center gap-2 text-[10px] opacity-65">
                <span className="font-mono">#{it.number}</span>
                <span>·</span>
                <span>{it.user}</span>
                <span>·</span>
                <span>{timeAgo(it.createdAt)}</span>
                {it.comments > 0 && <><span>·</span><span>{it.comments} 💬</span></>}
              </div>
              {it.labels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {it.labels.slice(0, 4).map((l) => (
                    <span key={l.name} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `#${l.color}22`, border: `1px solid #${l.color}66` }}>{l.name}</span>
                  ))}
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {composing && (
        <>
          <div className="fixed inset-0 z-[75]" style={{ backgroundColor: 'rgba(0,0,0,.3)' }} onClick={() => setComposing(false)} />
          <div className="fixed left-1/2 -translate-x-1/2 z-[80] w-[330px] max-h-[78vh] overflow-y-auto gitofy-scroll rounded-3xl border p-4 flex flex-col gap-3 gitofy-screen-in" style={{ top: '14%', backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }}>
            <span className="text-sm font-black">New issue</span>
            <M3TextField label="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={6}
              placeholder="Describe it…"
              className="w-full rounded-2xl border p-3 text-xs outline-none"
              style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface }}
            />
            <div className="flex gap-2">
              <M3Button variant="text" shape="capsule" size="compact" className="flex-1" onClick={() => setComposing(false)}>Cancel</M3Button>
              <M3Button variant="filled" shape="capsule" size="compact" className="flex-1" loading={busy} disabled={!newTitle.trim()}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await createIssue(owner, repo.name, newTitle.trim(), newBody, token);
                    triggerHaptic('success');
                    setComposing(false);
                    setNewTitle(''); setNewBody('');
                    setTab('issues'); setState('open');
                    await load();
                  } catch (e) {
                    triggerHaptic('error');
                    setError(e instanceof Error ? e.message : 'Could not create the issue.');
                  } finally {
                    setBusy(false);
                  }
                }}>
                Create
              </M3Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
