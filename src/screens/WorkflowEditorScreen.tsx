import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { SkeletonRows } from '../ui/m3/SkeletonRows';
import { CodeBlock } from '../ui/CodeBlock';
import { Repository, WorkflowItem } from '../types';
import { repoOwnerLogin } from '../utils/repo';
import { fetchFileForEdit, saveFileContent } from '../git/githubApi';

interface Props {
  repo: Repository;
  workflow: WorkflowItem;
  token: string;
  onBack: () => void;
  onSaved?: () => void;
}

/** View and edit a workflow's YAML straight from the app. */
export const WorkflowEditorScreen: React.FC<Props> = ({ repo, workflow, token, onBack, onSaved }) => {
  const { colors, triggerHaptic } = useTheme();
  const owner = repoOwnerLogin(repo);
  const [text, setText] = useState('');
  const [sha, setSha] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState('Update workflow');
  const originalRef = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFileForEdit(owner, repo.name, workflow.path, repo.default_branch || 'main', token);
      setText(res.text);
      originalRef.current = res.text;
      setSha(res.sha);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the workflow file.');
    } finally {
      setLoading(false);
    }
  }, [owner, repo.name, repo.default_branch, workflow.path, token]);

  useEffect(() => { void load(); }, [load]);

  const dirty = text !== originalRef.current;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveFileContent(owner, repo.name, workflow.path, text, sha, repo.default_branch || 'main', message.trim() || 'Update workflow', token);
      originalRef.current = text;
      triggerHaptic('success');
      setSaved(true);
      onSaved?.();
      window.setTimeout(() => setSaved(false), 2600);
      await load();
    } catch (e) {
      triggerHaptic('error');
      setError(e instanceof Error ? e.message : 'Could not save the workflow.');
    } finally {
      setSaving(false);
    }
  };

  const lines = text.split('\n');

  return (
    <div className="gitofy-screen-in flex-1 flex flex-col select-none" style={{ backgroundColor: colors.background }}>
      <div className="sticky top-0 z-30 px-3 py-3 border-b gitofy-topbar flex items-center gap-2" style={{ backgroundColor: `${colors.surface}f5`, borderColor: colors.outlineVariant }}>
        <M3IconButton aria-label="Back" onClick={onBack}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        </M3IconButton>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black truncate">{workflow.name}</div>
          <div className="text-[10px] font-mono opacity-60 truncate">{workflow.path}</div>
        </div>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="text-[11px] font-bold px-3 py-1.5 rounded-full border cursor-pointer"
          style={{ borderColor: colors.outlineVariant, color: colors.onSurfaceVariant }}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      <div className="flex-1 gitofy-scroll px-4 py-4 pb-28 flex flex-col gap-3">
        {loading ? (
          <SkeletonRows count={8} height={22} />
        ) : (
          <>
            {preview ? (
              <CodeBlock code={text} path={workflow.path} />
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                rows={Math.min(40, Math.max(14, lines.length + 2))}
                className="w-full rounded-2xl border p-3 text-[11px] leading-5 font-mono outline-none"
                style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant, color: colors.onSurface, tabSize: 2 }}
              />
            )}

            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border" style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}>
              <span className="text-[10px] font-bold uppercase" style={{ color: colors.onSurfaceVariant }}>Commit</span>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex-1 bg-transparent outline-none text-xs"
                style={{ color: colors.onSurface }}
              />
            </div>

            {error && (
              <div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{ backgroundColor: colors.errorContainer, color: colors.onErrorContainer, borderColor: colors.error }}>{error}</div>
            )}
            {saved && (
              <div className="rounded-2xl border px-3 py-2 text-xs font-semibold animate-fade-in" style={{ backgroundColor: colors.diffAddedContainer, color: colors.diffAdded, borderColor: colors.diffAdded }}>✓ Committed to GitHub</div>
            )}

            <M3Button variant="filled" shape="capsule" size="large" className="w-full font-bold" loading={saving} disabled={!dirty} onClick={save}>
              {dirty ? 'Commit changes' : 'No changes yet'}
            </M3Button>
            <p className="text-[10px] opacity-60 text-center leading-relaxed">
              Commits directly to {repo.default_branch || 'main'} with your token.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
