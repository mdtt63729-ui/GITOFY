import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { Repository } from '../types';
import { searchRepositories, searchCode, type SearchRepoHit, type SearchCodeHit } from '../git/githubApi';
import { openExternal } from '../utils/external';

interface Props {
  token: string;
  username: string;
  repos: Repository[];
  onBack: () => void;
  onOpenRepo: (fullName: string) => void;
}

type Tab = 'repos' | 'code' | 'mine';

/** One search box across your repositories, GitHub repositories and code. */
export const GlobalSearchScreen: React.FC<Props> = ({ token, username, repos, onBack, onOpenRepo }) => {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('mine');
  const [remoteRepos, setRemoteRepos] = useState<SearchRepoHit[]>([]);
  const [codeHits, setCodeHits] = useState<SearchCodeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  // Your own repositories filter instantly, with no network at all.
  const mine = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
    );
  }, [query, repos]);

  // The GitHub-wide searches are debounced and only run for the visible tab.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || tab === 'mine') { setRemoteRepos([]); setCodeHits([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        if (tab === 'repos') {
          const hits = await searchRepositories(q, token);
          if (!cancelled) setRemoteRepos(hits);
        } else {
          const hits = await searchCode(q, token, username || undefined);
          if (!cancelled) setCodeHits(hits);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [query, tab, token, username]);

  const card: React.CSSProperties = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant };
  const rowStyle: React.CSSProperties = { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant };

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="text-sm font-black flex-1">Search</div>
      </div>

      <div className="px-5 pt-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-full border" style={card}>
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ color: colors.onSurfaceVariant }}>
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setTouched(true); }}
            placeholder="Repositories, code…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: colors.onSurface }}
          />
          {query && (
            <button type="button" className="p-0.5 cursor-pointer" style={{ color: colors.onSurfaceVariant }} onClick={() => setQuery('')}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {([['mine', 'My repos'], ['repos', 'All GitHub'], ['code', 'Code']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as Tab)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${tab === id ? 'ring-2' : ''}`}
              style={{
                backgroundColor: tab === id ? colors.primary : colors.surfaceContainerLowest,
                color: tab === id ? colors.onPrimary : colors.onSurface,
                borderColor: colors.outlineVariant,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 gitofy-scroll px-5 py-4 pb-24 flex flex-col gap-2">
        {tab === 'mine' && (
          mine.length === 0 ? (
            <p className="text-xs opacity-70">{query ? 'No repository matches that.' : 'Type to search your repositories.'}</p>
          ) : (
            mine.map((r) => (
              <button key={r.id} type="button" onClick={() => onOpenRepo(r.full_name)} className="p-3.5 rounded-2xl border flex flex-col gap-1 text-left cursor-pointer active:scale-[0.99] transition-transform" style={rowStyle}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold truncate">{r.name}</span>
                  {r.private && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: colors.surfaceContainerHighest, color: colors.onSurfaceVariant }}>Private</span>}
                </div>
                {r.description && <p className="text-[11px] opacity-70 line-clamp-2">{r.description}</p>}
              </button>
            ))
          )
        )}

        {tab !== 'mine' && loading && <SkeletonRows count={4} height={62} />}

        {tab === 'repos' && !loading && (
          remoteRepos.length === 0 ? (
            <p className="text-xs opacity-70">{touched && query.trim().length >= 2 ? 'Nothing found on GitHub.' : 'Type at least two characters.'}</p>
          ) : (
            remoteRepos.map((r) => (
              <button key={r.full_name} type="button" onClick={() => onOpenRepo(r.full_name)} className="p-3.5 rounded-2xl border flex flex-col gap-1 text-left cursor-pointer active:scale-[0.99] transition-transform" style={rowStyle}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold truncate">{r.full_name}</span>
                  <span className="text-[10px] font-bold flex items-center gap-1 flex-shrink-0" style={{ color: colors.onSurfaceVariant }}>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    {r.stargazers_count}
                  </span>
                </div>
                {r.description && <p className="text-[11px] opacity-70 line-clamp-2">{r.description}</p>}
                {r.language && <span className="text-[10px] opacity-60">{r.language}</span>}
              </button>
            ))
          )
        )}

        {tab === 'code' && !loading && (
          codeHits.length === 0 ? (
            <p className="text-xs opacity-70">{touched && query.trim().length >= 2 ? 'No code matches.' : 'Type at least two characters.'}</p>
          ) : (
            codeHits.map((h) => (
              <button key={h.html_url} type="button" onClick={() => openExternal(h.html_url)} className="p-3.5 rounded-2xl border flex flex-col gap-1 text-left cursor-pointer active:scale-[0.99] transition-transform" style={rowStyle}>
                <span className="text-xs font-mono font-bold truncate">{h.path}</span>
                <span className="text-[10px] opacity-60 truncate">{h.repo}</span>
              </button>
            ))
          )
        )}
      </div>
    </div>
  );
};
