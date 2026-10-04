import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { M3Button } from '../ui/m3/M3Button';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3Switch } from '../ui/m3/M3Switch';
import { Repository, WorkflowItem } from '../types';
import { processZipFile, ExtractedFile } from '../git/diffEngine';
import {
  createBackupTag,
  fetchBackupTags,
  restoreBranchToSha,
  fetchRepoWorkflows,
  fetchWorkflowRuns,
  rerunWorkflowRun,
  triggerWorkflowDispatch,
} from '../git/githubApi';

interface Props {
  repo: Repository;
  zipFile?: File | null;
  token: string;
  onBack: () => void;
  onRunWorkflows: () => void;
}

type CheckStatus = 'pass' | 'warn' | 'fail';
interface Check { id: string; title: string; detail: string; status: CheckStatus; fix?: string; }

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/^\.env(?:\.|$)/i, '.env file'],
  [/\.(?:jks|keystore|pem)$/i, 'signing/private key'],
  [/^(?:google-services\.json)$/i, 'Google services credential'],
  [/\bgh[pousr]_[A-Za-z0-9_\-]{20,}\b/g, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AWS access key'],
];

function detectProject(files: ExtractedFile[]) {
  const paths = new Set(files.map(f => f.path));
  const has = (p: string) => paths.has(p);
  if (has('gradlew') || [...paths].some(p => /(^|\/)build\.gradle(?:\.kts)?$/.test(p))) return 'Android / Gradle';
  if (has('pubspec.yaml')) return 'Flutter';
  if (has('package.json') && [...paths].some(p => /(^|\/)(vite\.config\.|next\.config\.|react-native)/i.test(p))) return 'Node / React / Vite';
  if (has('package.json')) return 'Node.js';
  if (has('requirements.txt') || has('pyproject.toml')) return 'Python';
  if (has('ProjectSettings/ProjectVersion.txt')) return 'Unity';
  return 'Static / Other';
}

function getChecks(files: ExtractedFile[], project: string): Check[] {
  const paths = new Set(files.map(f => f.path));
  const text = (name: string) => files.find(f => f.path === name)?.text || '';
  const workflows = files.filter(f => /^\.github\/workflows\/[^/]+\.(yml|yaml)$/i.test(f.path));
  const checks: Check[] = [];

  if (/Android|Gradle/i.test(project)) {
    checks.push({ id: 'gradlew', title: 'Gradle wrapper', detail: paths.has('gradlew') ? 'gradlew is present.' : 'gradlew is missing; CI may fail before Gradle starts.', status: paths.has('gradlew') ? 'pass' : 'fail', fix: 'Add the Gradle wrapper from the project root.' });
    checks.push({ id: 'wrapper', title: 'Wrapper metadata', detail: paths.has('gradle/wrapper/gradle-wrapper.jar') && paths.has('gradle/wrapper/gradle-wrapper.properties') ? 'Wrapper JAR and properties are present.' : 'gradle/wrapper metadata is incomplete.', status: paths.has('gradle/wrapper/gradle-wrapper.jar') && paths.has('gradle/wrapper/gradle-wrapper.properties') ? 'pass' : 'warn' });
    checks.push({ id: 'settings', title: 'settings.gradle', detail: paths.has('settings.gradle') || paths.has('settings.gradle.kts') ? 'Gradle settings file detected.' : 'No settings.gradle(.kts) found.', status: paths.has('settings.gradle') || paths.has('settings.gradle.kts') ? 'pass' : 'warn' });
  }
  if (/Node/i.test(project)) {
    const pkg = text('package.json');
    const hasLock = paths.has('package-lock.json') || paths.has('yarn.lock') || paths.has('pnpm-lock.yaml') || paths.has('bun.lock');
    let hasBuild = false;
    try { hasBuild = !!JSON.parse(pkg).scripts?.build; } catch { /* validator below */ }
    checks.push({ id: 'lock', title: 'Dependency lockfile', detail: hasLock ? 'A supported lockfile is present.' : 'No lockfile found; npm ci/yarn --frozen-lockfile style CI can fail.', status: hasLock ? 'pass' : 'fail', fix: 'Commit the lockfile used by CI.' });
    checks.push({ id: 'build', title: 'Build script', detail: hasBuild ? 'package.json scripts.build exists.' : 'package.json has no scripts.build entry.', status: hasBuild ? 'pass' : 'warn' });
  }
  if (/Python/i.test(project)) checks.push({ id: 'requirements', title: 'Python dependency manifest', detail: paths.has('requirements.txt') || paths.has('pyproject.toml') ? 'Dependency manifest detected.' : 'No requirements.txt/pyproject.toml found.', status: paths.has('requirements.txt') || paths.has('pyproject.toml') ? 'pass' : 'warn' });

  const hasLocal = paths.has('local.properties');
  checks.push({ id: 'local', title: 'local.properties exclusion', detail: hasLocal ? 'local.properties is inside the upload and should not be committed.' : 'local.properties is not present.', status: hasLocal ? 'fail' : 'pass', fix: 'Exclude local.properties before pushing.' });
  const gitignore = files.find(f => f.path === '.gitignore')?.text || '';
  const ignoredBuild = /(^|\n)\s*(build\/|\.gradle\/|node_modules\/)/m.test(gitignore);
  checks.push({ id: 'ignore', title: '.gitignore coverage', detail: ignoredBuild ? 'Common build/cache paths are ignored.' : 'Build/cache paths are not clearly ignored.', status: ignoredBuild ? 'pass' : 'warn', fix: 'Add build/, .gradle/ and node_modules/ where applicable.' });
  checks.push({ id: 'workflow', title: 'Workflow files', detail: workflows.length ? `${workflows.length} workflow file(s) detected.` : 'No GitHub Actions workflow was found.', status: workflows.length ? 'pass' : 'warn' });
  return checks;
}

function validateWorkflow(file: ExtractedFile): Check {
  const src = file.text || '';
  const hasJobs = /(^|\n)\s*jobs\s*:/m.test(src);
  const hasRuns = /runs-on\s*:/m.test(src);
  const hasSteps = /steps\s*:/m.test(src);
  const hasOn = /(^|\n)\s*(on|['"]on['"])\s*:/m.test(src);
  const uses = [...src.matchAll(/uses:\s*([^\s#]+)/g)].map(m => m[1]);
  const unpinned = uses.filter(u => !/@[0-9a-f]{7,40}$/i.test(u) && !/@v\d+(?:\.\d+)*$/i.test(u));
  if (!hasOn || !hasJobs || !hasRuns || !hasSteps) return { id: file.path, title: file.path, detail: 'Workflow structure is incomplete: expected on, jobs, runs-on and steps.', status: 'fail', fix: 'Add the missing GitHub Actions keys.' };
  if (unpinned.length) return { id: file.path, title: file.path, detail: `Workflow is structurally valid, but ${unpinned.length} action reference(s) are not version pinned.`, status: 'warn', fix: 'Pin actions to a release tag or commit SHA.' };
  return { id: file.path, title: file.path, detail: 'Basic workflow structure is valid and action references are pinned.', status: 'pass' };
}

function scanSecrets(files: ExtractedFile[]) {
  const hits: string[] = [];
  for (const f of files) {
    if (f.size > 2_000_000 || !f.text) continue;
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(f.path) || pattern.test(f.text)) hits.push(`${f.path} — ${label}`);
      pattern.lastIndex = 0;
    }
  }
  return [...new Set(hits)];
}

export const ProToolsScreen: React.FC<Props> = ({ repo, zipFile, token, onBack, onRunWorkflows }) => {
  const { colors, settings, triggerHaptic } = useTheme();
  const [files, setFiles] = useState<ExtractedFile[]>([]);
  const [loading, setLoading] = useState(!!zipFile);
  const [checks, setChecks] = useState<Check[]>([]);
  const [backupTags, setBackupTags] = useState<Array<{name: string; sha: string}>>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [message, setMessage] = useState<string>('');
  const [readOnly, setReadOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'doctor'|'recovery'|'actions'|'health'>('doctor');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (zipFile) {
        setLoading(true);
        try {
          const parsed = await processZipFile(zipFile, settings.stripRootFolder !== false);
          if (!cancelled) { setFiles(parsed); setChecks(getChecks(parsed, detectProject(parsed))); }
        } catch (e) { if (!cancelled) setMessage(e instanceof Error ? e.message : 'ZIP analysis failed'); }
        finally { if (!cancelled) setLoading(false); }
      }
      if (token) {
        try { setBackupTags(await fetchBackupTags(repo.owner.login, repo.name, token)); } catch {}
        try { setWorkflows(await fetchRepoWorkflows(repo.owner.login, repo.name, token)); } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [zipFile, repo, token, settings.stripRootFolder]);

  const project = useMemo(() => detectProject(files), [files]);
  const workflowChecks = useMemo(() => files.filter(f => /^\.github\/workflows\/[^/]+\.(yml|yaml)$/i.test(f.path)).map(validateWorkflow), [files]);
  const secretHits = useMemo(() => scanSecrets(files), [files]);
  const allChecks = [...checks, ...workflowChecks];
  const failCount = allChecks.filter(c => c.status === 'fail').length + (secretHits.length ? 1 : 0);
  const warnCount = allChecks.filter(c => c.status === 'warn').length;
  const score = Math.max(0, 100 - failCount * 20 - warnCount * 5);
  const risk = useMemo(() => {
    let value = 0;
    if (secretHits.length) value += 50;
    if (workflowChecks.some(c => c.status === 'fail')) value += 25;
    if (files.some(f => f.size > 50 * 1024 * 1024)) value += 15;
    if (files.length > 1000) value += 10;
    return value >= 50 ? 'High' : value >= 20 ? 'Medium' : 'Low';
  }, [files, secretHits, workflowChecks]);

  const doBackup = async () => {
    if (readOnly) return;
    try {
      const ref = await createBackupTag(repo.owner.login, repo.name, repo.default_branch || 'main', token);
      setBackupTags(prev => [{ name: ref.name, sha: ref.sha }, ...prev.filter(x => x.name !== ref.name)]);
      triggerHaptic('success'); setMessage(`Backup created: ${ref.name}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Backup failed'); }
  };

  const restore = async (tag: {name: string; sha: string}) => {
    if (readOnly) return;
    if (!window.confirm(`Restore ${repo.default_branch} to ${tag.name}? This creates a new commit on the branch.`)) return;
    try { await restoreBranchToSha(repo.owner.login, repo.name, repo.default_branch || 'main', tag.sha, token); triggerHaptic('success'); setMessage(`Restored branch to ${tag.sha.slice(0,7)}.`); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Restore failed'); }
  };

  const runWorkflow = async (wf: WorkflowItem) => {
    try { await triggerWorkflowDispatch(repo.owner.login, repo.name, wf.path || wf.id, repo.default_branch || 'main', token); setMessage(`Workflow dispatched: ${wf.name}`); onRunWorkflows(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Workflow dispatch failed'); }
  };

  const failureExplain = async () => {
    try {
      const runs = workflows.length ? await fetchWorkflowRuns(repo.owner.login, repo.name, workflows[0].id, token) : [];
      const failed = runs.find(r => r.conclusion === 'failure');
      if (!failed) { setMessage('No recent failed run found.'); return; }
      setMessage(`Failure Explainer: run #${failed.run_number} failed. Open Actions logs to inspect the first failing command; common Gitofy patterns include gradlew permission, missing lockfile, SDK location, dependency resolution, duplicate classes and Gradle OOM.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not inspect workflow history'); }
  };

  return <div className="flex-1 flex flex-col overflow-y-auto overscroll-contain select-none">
    <div className="sticky top-0 z-30 px-4 py-3 backdrop-blur-md border-b flex items-center justify-between" style={{backgroundColor:`${colors.surface}f2`,borderColor:colors.outlineVariant}}>
      <div className="flex items-center gap-2"><M3IconButton aria-label="Back" onClick={onBack}><span className="text-xl">‹</span></M3IconButton><div><h2 className="text-base font-bold">Gitofy Pro Tools</h2><p className="text-[10px] opacity-70">{repo.full_name} · Part 3</p></div></div>
      <div className="flex items-center gap-2"><span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{backgroundColor:risk==='High'?colors.errorContainer:risk==='Medium'?colors.tertiaryContainer:colors.diffAddedContainer,color:risk==='High'?colors.onErrorContainer:risk==='Medium'?colors.onTertiaryContainer:colors.diffAdded}}>{risk} risk</span></div>
    </div>

    <div className="p-5 flex flex-col gap-4 pb-28">
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-2xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="text-[10px] opacity-70">Project</div><div className="text-sm font-black mt-1">{loading?'Scanning…':project}</div></div>
        <div className="p-3 rounded-2xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="text-[10px] opacity-70">Readiness</div><div className="text-sm font-black mt-1">{loading?'—':`${score}/100`}</div></div>
        <div className="p-3 rounded-2xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="text-[10px] opacity-70">Files</div><div className="text-sm font-black mt-1">{files.length}</div></div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none">{(['doctor','recovery','actions','health'] as const).map(t=><button key={t} onClick={()=>setActiveTab(t)} className="px-4 py-2 rounded-full text-xs font-bold border whitespace-nowrap" style={{backgroundColor:activeTab===t?colors.primary:colors.surfaceContainerLow,color:activeTab===t?colors.onPrimary:colors.onSurface,borderColor:activeTab===t?colors.primary:colors.outlineVariant}}>{t==='doctor'?'CI Doctor':t==='recovery'?'Recovery':t==='actions'?'Build & Actions':'Health Check'}</button>)}</div>

      {activeTab==='doctor' && <>
        <div className="p-4 rounded-3xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}>
          <div className="flex items-center justify-between"><div><div className="text-sm font-black">Pre-push intelligence</div><div className="text-[10px] opacity-70 mt-1">X-A01 · X-A02 · X-A03 · X-A13 · X-I04</div></div><span className="text-xs font-black">{allChecks.filter(c=>c.status==='pass').length} pass</span></div>
          <div className="mt-3 flex flex-col gap-2">{allChecks.map(c=><div key={c.id} className="p-3 rounded-2xl border" style={{backgroundColor:colors.surfaceContainerLowest,borderColor:colors.outlineVariant}}><div className="flex items-center justify-between gap-3"><div className="text-xs font-bold truncate">{c.title}</div><span className="text-[10px] font-black uppercase" style={{color:c.status==='fail'?colors.error:c.status==='warn'?colors.tertiary:colors.diffAdded}}>{c.status}</span></div><div className="text-[10px] opacity-70 mt-1">{c.detail}</div>{c.fix&&<div className="text-[10px] mt-2 font-semibold" style={{color:colors.primary}}>Fix: {c.fix}</div>}</div>)}{secretHits.length>0&&<div className="p-3 rounded-2xl border" style={{backgroundColor:colors.errorContainer,borderColor:colors.error}}><div className="text-xs font-black" style={{color:colors.onErrorContainer}}>Secret scanner blocked this push</div><div className="text-[10px] mt-1" style={{color:colors.onErrorContainer}}>{secretHits.slice(0,8).join(' · ')}</div></div>}</div>
        </div>
        <div className="p-4 rounded-3xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="text-xs font-bold">Never-push defaults</div><div className="flex flex-wrap gap-1.5 mt-2">{['.env*','*.jks','*.keystore','*.pem','google-services.json','local.properties','node_modules/','build/','.gradle/'].map(x=><span key={x} className="px-2 py-1 rounded-full text-[10px] font-mono" style={{backgroundColor:colors.surfaceContainerHighest}}>{x}</span>)}</div></div>
      </>}

      {activeTab==='recovery' && <div className="flex flex-col gap-3">
        <div className="p-4 rounded-3xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="flex items-center justify-between"><div><div className="text-sm font-black">Safe / read-only mode</div><div className="text-[10px] opacity-70">X-I10 · disables destructive recovery actions</div></div><M3Switch checked={readOnly} onChange={setReadOnly} /></div><div className="text-[10px] opacity-70 mt-2">Create a Gitofy backup point before making a destructive change.</div><M3Button className="w-full mt-3" variant="filled" shape="capsule" size="medium" onClick={doBackup} disabled={readOnly}>Create backup point now</M3Button></div>
        <div className="p-4 rounded-3xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="text-sm font-black">Restore points</div><div className="text-[10px] opacity-70 mt-1">Default branch: {repo.default_branch}</div><div className="mt-3 flex flex-col gap-2">{backupTags.length?backupTags.map(t=><div key={t.name} className="flex items-center justify-between gap-2 p-3 rounded-2xl border" style={{borderColor:colors.outlineVariant,backgroundColor:colors.surfaceContainerLowest}}><div className="min-w-0"><div className="text-xs font-bold truncate">{t.name}</div><div className="text-[10px] font-mono opacity-60">{t.sha.slice(0,10)}</div></div><M3Button variant="tonal" size="compact" onClick={()=>restore(t)} disabled={readOnly}>Restore</M3Button></div>):<div className="text-xs opacity-60">No Gitofy backup tags yet.</div>}</div></div>
      </div>}

      {activeTab==='actions' && <div className="flex flex-col gap-3">
        <div className="p-4 rounded-3xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="flex items-center justify-between"><div><div className="text-sm font-black">Build & Actions</div><div className="text-[10px] opacity-70">X-C01 · X-C03 · X-C04</div></div><M3Button variant="tonal" size="compact" onClick={failureExplain}>Failure Explainer</M3Button></div><div className="mt-3 flex flex-col gap-2">{workflows.map(w=><div key={w.id} className="flex items-center justify-between gap-2 p-3 rounded-2xl border" style={{borderColor:colors.outlineVariant,backgroundColor:colors.surfaceContainerLowest}}><div className="min-w-0"><div className="text-xs font-bold truncate">{w.name}</div><div className="text-[10px] font-mono opacity-60 truncate">{w.path}</div></div><M3Button variant="filled" size="compact" onClick={()=>runWorkflow(w)}>Build</M3Button></div>)}{!workflows.length&&<div className="text-xs opacity-60">No workflows found. Add one from the Workflow Template Library.</div>}</div></div>
        <div className="p-4 rounded-3xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="text-xs font-bold">Workflow validator</div>{workflowChecks.map(c=><div key={c.id} className="mt-2 text-[10px]" style={{color:c.status==='fail'?colors.error:c.status==='warn'?colors.tertiary:colors.diffAdded}}>● {c.title}: {c.status.toUpperCase()} — {c.detail}</div>)}</div>
      </div>}

      {activeTab==='health' && <div className="flex flex-col gap-3"><div className="p-4 rounded-3xl border" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="text-sm font-black">Health Check</div><div className="text-[10px] opacity-70 mt-1">X-N08 · connectivity and local readiness</div><div className="mt-3 flex flex-col gap-2">{[['GitHub API',!!token?'Connected':'Missing token'],['ZIP parser',loading?'Scanning':'Ready'],['Secret scanner',secretHits.length?'Issues found':'Clean'],['Workflow API',workflows.length?`${workflows.length} detected`:'No workflows']].map(([a,b])=><div key={String(a)} className="flex justify-between text-xs"><span>{a}</span><span className="font-bold">{b}</span></div>)}</div></div><M3Button variant="tonal" shape="capsule" onClick={async()=>{const report=JSON.stringify({repo:repo.full_name,project,score,risk,files:files.length,workflowCount:workflows.length,secretHits:secretHits.length}); try{await navigator.clipboard.writeText(report); setMessage('Diagnostic summary copied.');}catch{setMessage(report);}}}>Copy diagnostic summary</M3Button></div>}

      {message&&<div className="p-3 rounded-2xl border text-xs font-semibold" style={{backgroundColor:colors.secondaryContainer,color:colors.onSecondaryContainer,borderColor:colors.outlineVariant}}>{message}</div>}
    </div>
  </div>;
};
