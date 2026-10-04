import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../ui/ThemeContext';
import { openExternal } from '../utils/external';
import { M3IconButton } from '../ui/m3/M3IconButton';
import { M3Button } from '../ui/m3/M3Button';
import { WorkflowItem, WorkflowRun } from '../types';
import {
  fetchWorkflowRunWithMeta,
  fetchWorkflowRunJobsWithMeta,
  fetchJobLogsIncremental,
  cancelWorkflowRunDetailed,
  rerunWorkflowRunDetailed,
  getGitHubRateLimitState,
} from '../git/githubApi';

interface Step { number:number; name:string; status:string; conclusion:string|null; started_at?:string|null; completed_at?:string|null }
interface Job { id:number; name:string; status:string; conclusion:string|null; started_at?:string|null; completed_at?:string|null; runner_name?:string|null; steps:Step[] }
interface Props { repoName:string; workflow:WorkflowItem; initialRun?:WorkflowRun|null; token:string; onBack:()=>void }
type Tone='queued'|'running'|'success'|'failure'|'cancelled'|'skipped'|'neutral';

const rank=(status:string)=>status==='queued'||status==='waiting'||status==='pending'?0:status==='in_progress'?1:2;
const toneOf=(x:{status:string;conclusion:string|null}):Tone=>{
  if(x.status==='queued'||x.status==='waiting'||x.status==='pending') return 'queued';
  if(x.status==='in_progress') return 'running';
  if(x.conclusion==='success') return 'success';
  if(x.conclusion==='failure'||x.conclusion==='timed_out') return 'failure';
  if(x.conclusion==='cancelled') return 'cancelled';
  if(x.conclusion==='skipped') return 'skipped';
  return 'neutral';
};
const duration=(start?:string|null,end?:string|null,now=Date.now())=>{
  if(!start) return '—'; const ms=Math.max(0,(end?Date.parse(end):now)-Date.parse(start)); const s=Math.floor(ms/1000); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return h?`${h}h ${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`:`${m}m ${String(sec).padStart(2,'0')}s`;
};
const colorFor=(tone:Tone,c:any)=>tone==='success'?c.diffAdded:tone==='failure'?c.error:tone==='running'?c.tertiary:tone==='cancelled'?c.onSurfaceVariant:c.onSurfaceVariant;
const statusText=(tone:Tone)=>({queued:'Queued',running:'Running',success:'Success',failure:'Failed',cancelled:'Cancelled',skipped:'Skipped',neutral:'Waiting'})[tone];
const parseLines=(raw:string)=>raw.replace(/\r/g,'').split('\n').filter((x)=>x.length>0).map((text,index)=>{
  const m=text.match(/^(\d{4}-\d{2}-\d{2}T[^ ]+\s+)/); const level=text.includes('::error::')?'error':text.includes('::warning::')?'warning':text.includes('::notice::')?'notice':text.includes('::debug::')?'debug':undefined;
  return {index,text,ts:m?.[1]?.trim(),level};
});

export const WorkflowRunDetailScreen:React.FC<Props>=({repoName,workflow,initialRun,token,onBack})=>{
  const {colors,settings,triggerHaptic}=useTheme();
  const [run,setRun]=useState<WorkflowRun|null>(initialRun||null);
  const [jobs,setJobs]=useState<Job[]>([]); const [selectedJobId,setSelectedJobId]=useState<number|null>(null); const [selectedStep,setSelectedStep]=useState<number|null>(null);
  const [rawLog,setRawLog]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null); const [now,setNow]=useState(Date.now());
  const [connection,setConnection]=useState<'live'|'polling'|'offline'|'reconnecting'>('polling'); const [updatedAt,setUpdatedAt]=useState(Date.now()); const [rateBanner,setRateBanner]=useState<string|null>(null);
  const [paused,setPaused]=useState(false); const [follow,setFollow]=useState(settings.liveRunsAutoFollow); const [search,setSearch]=useState(''); const [caseSensitive,setCaseSensitive]=useState(false); const [regex,setRegex]=useState(false); const [wrap,setWrap]=useState(settings.liveRunsWrap); const [showLines,setShowLines]=useState(true); const [showTs,setShowTs]=useState(settings.liveRunsTimestamps); const [showDebug,setShowDebug]=useState(settings.liveRunsDebugLines); const [fontSize,setFontSize]=useState(settings.liveRunsLogFontSize); const [stepFilter,setStepFilter]=useState<number|null>(null);
  const [actionBusy,setActionBusy]=useState(false); const [toast,setToast]=useState<string|null>(null); const logRef=useRef<HTMLDivElement|null>(null); const seenLogRef=useRef(''); const noChangeRef=useRef(0); const lastRunState=useRef<string>('');
  const [owner,repo]=useMemo(()=>{const p=repoName.split('/');return [p[0],p[1]||repoName]},[repoName]);

  const mergeJobs=useCallback((incoming:Job[])=>setJobs(prev=>incoming.map(n=>{
    const old=prev.find(x=>x.id===n.id); if(!old) return n;
    if(rank(n.status)<rank(old.status)) return old;
    return {...old,...n,steps:n.steps.map(ns=>{const os=old.steps.find(s=>s.number===ns.number); if(!os) return ns; if(rank(ns.status)<rank(os.status)) return os; return ns;})};
  })),[]);

  const loadSnapshot=useCallback(async(silent=true)=>{
    if(!run) return;
    try{
      setConnection('polling');
      const [rr,jj]=await Promise.all([fetchWorkflowRunWithMeta(owner,repo,run.id,token),fetchWorkflowRunJobsWithMeta(owner,repo,run.id,token)]);
      setRun(rr.run); mergeJobs(jj.jobs as Job[]); setUpdatedAt(Date.now()); setConnection('live'); setError(null);
      const rl=getGitHubRateLimitState(); if(rl.remaining!==null&&rl.limit&&rl.remaining/rl.limit<.05) setRateBanner('GitHub rate limit is very low. Log tailing is paused to protect your token.'); else if(rl.remaining!==null&&rl.limit&&rl.remaining/rl.limit<.2) setRateBanner('GitHub rate limit is getting low. Refresh intervals are stretched.'); else setRateBanner(null);
      if(!selectedJobId&&jj.jobs.length) setSelectedJobId(jj.jobs[0].id);
      if(lastRunState.current && lastRunState.current!==`${rr.run.status}:${rr.run.conclusion}` && rr.run.status==='completed') { triggerHaptic(rr.run.conclusion==='success'?'success':'error'); }
      lastRunState.current=`${rr.run.status}:${rr.run.conclusion}`;
    }catch(e){ setConnection('offline'); if(!silent) setError(e instanceof Error?e.message:'Could not load GitHub run.'); }
    finally{if(!silent)setLoading(false)}
  },[run,owner,repo,token,selectedJobId,mergeJobs,triggerHaptic]);

  useEffect(()=>{
    const relay=(import.meta as any).env?.VITE_GITOFY_RELAY_URL as string|undefined; const relayJwt=(import.meta as any).env?.VITE_GITOFY_RELAY_JWT as string|undefined;
    if(!settings.instantMode||!relay||!relayJwt||!run)return;
    let ws:WebSocket|undefined; let timer:number|undefined; let attempts=0; let closed=false;
    const connect=()=>{ if(closed)return; try{ setConnection('reconnecting'); ws=new WebSocket(relay.replace(/^http/,'ws')); ws.onopen=()=>{attempts=0;setConnection('live');ws?.send(JSON.stringify({type:'auth',jwt:relayJwt}));ws?.send(JSON.stringify({type:'subscribe',repo:repoName,run_id:run.id}));}; ws.onmessage=(ev)=>{try{const msg=JSON.parse(ev.data); if(msg.type==='snapshot'&&msg.payload){if(msg.payload.run)setRun(msg.payload.run);if(Array.isArray(msg.payload.jobs))mergeJobs(msg.payload.jobs);} else if(msg.type==='event'&&msg.payload){if(msg.payload.job)mergeJobs([msg.payload.job]);}}catch{}}; ws.onerror=()=>{setConnection('reconnecting')}; ws.onclose=()=>{if(!closed){setConnection('reconnecting');attempts++;const delay=Math.min(30000,1000*Math.pow(2,Math.min(attempts,5)))*(0.8+Math.random()*0.4);timer=window.setTimeout(connect,delay)}};}catch{setConnection('polling')}}; connect(); return()=>{closed=true;if(timer)window.clearTimeout(timer);ws?.close()};
  },[settings.instantMode,run?.id,repoName,token,mergeJobs]);

  useEffect(()=>{if(!run){setLoading(false);return;} void loadSnapshot(false); const active=run.status==='queued'||run.status==='in_progress'||run.status==='waiting'; const factor=settings.liveRunsPolling==='battery'?2:settings.liveRunsPolling==='max'?0.65:1; const ms=Math.round((run.status==='queued'||run.status==='waiting'?5000:active?2500:30000)*factor); const t=window.setInterval(()=>void loadSnapshot(true),ms); return()=>window.clearInterval(t)},[run?.id,run?.status,loadSnapshot]);
  useEffect(()=>{const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(t)},[]);
  useEffect(()=>{const onVis=()=>{if(document.visibilityState==='visible')void loadSnapshot(true)};document.addEventListener('visibilitychange',onVis);return()=>document.removeEventListener('visibilitychange',onVis)},[loadSnapshot]);

  const selectedJob=jobs.find(j=>j.id===selectedJobId)||null;
  const selectedStepObj=selectedJob?.steps.find(s=>s.number===selectedStep)||null;
  const loadLogs=useCallback(async()=>{
    if(!selectedJob||paused||document.visibilityState!=='visible'||rateBanner?.includes('very low'))return;
    try{
      const text=await fetchJobLogsIncremental(owner,repo,selectedJob.id,token);
      const tail=text.slice(-4000000); const sig=tail.slice(-4000); if(sig!==seenLogRef.current){setRawLog(text);seenLogRef.current=sig;noChangeRef.current=0}else noChangeRef.current+=1;
    }catch(e){if(!rawLog)setError(e instanceof Error?e.message:'Could not load GitHub logs.')}
  },[selectedJob,paused,owner,repo,token,rateBanner,rawLog]);
  useEffect(()=>{if(!selectedJob)return; noChangeRef.current=0; seenLogRef.current=''; void loadLogs(); let delay=settings.liveRunsPolling==='battery'?4000:settings.liveRunsPolling==='max'?2000:2500; let timer:number; const tick=async()=>{await loadLogs(); delay=noChangeRef.current>=3?Math.min(8000,delay+2000):2_000; timer=window.setTimeout(tick,delay)}; timer=window.setTimeout(tick,delay); return()=>window.clearTimeout(timer)},[selectedJob?.id,loadLogs]);

  const lines=useMemo(()=>parseLines(rawLog),[rawLog]);
  const filtered=useMemo(()=>{
    let out=lines.filter(l=>showDebug||l.level!=='debug');
    if(stepFilter!==null){ const marker=new RegExp('##\\[group\\].*'+stepFilter,'i'); out=out.filter(l=>marker.test(l.text)||l.text.toLowerCase().includes(`step ${stepFilter}`)); }
    if(search){ try{const q=regex?new RegExp(search,caseSensitive?'':'i') : null; out=out.filter(l=>q?q.test(l.text):(caseSensitive?l.text.includes(search):l.text.toLowerCase().includes(search.toLowerCase())))}catch{} }
    return out;
  },[lines,showDebug,stepFilter,search,regex,caseSensitive]);
  const errors=useMemo(()=>lines.map((l,i)=>l.level==='error'||l.text.toLowerCase().includes('error:')?i:-1).filter(i=>i>=0),[lines]);
  const scrollToBottom=()=>{const el=logRef.current;if(el){el.scrollTop=el.scrollHeight;setFollow(true)}};
  useEffect(()=>{if(follow&&!paused)requestAnimationFrame(scrollToBottom)},[filtered.length,follow,paused]);
  const jumpFirstError=()=>{const target=errors[0];if(target===undefined)return;const el=logRef.current; if(el)el.scrollTop=Math.max(0,target*18-100);setFollow(false)};
  const exportLog=()=>{const blob=new Blob([rawLog],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${repo}-job-${selectedJob?.id||'log'}.txt`;a.click();URL.revokeObjectURL(a.href)};
  const shareText=async(text:string)=>{if(navigator.share)await navigator.share({title:'Gitofy GitHub Actions',text});else await navigator.clipboard?.writeText(text)};
  const performAction=async(kind:'cancel'|'rerun'|'failed')=>{if(!run)return;setActionBusy(true);try{if(kind==='cancel')await cancelWorkflowRunDetailed(owner,repo,run.id,token);else await rerunWorkflowRunDetailed(owner,repo,run.id,token,kind==='failed');setToast(kind==='cancel'?'Cancel requested.':kind==='failed'?'Re-run failed jobs requested.':'Re-run requested.');triggerHaptic('success');setTimeout(()=>void loadSnapshot(false),1000)}catch(e){setToast(e instanceof Error?e.message:'GitHub action failed');triggerHaptic('error')}finally{setActionBusy(false)}};

  const runTone=toneOf({status:run?.status||'queued',conclusion:run?.conclusion||null}); const runColor=colorFor(runTone,colors);
  return <div className="flex-1 flex flex-col gitofy-scroll select-none" style={{backgroundColor:colors.surface}}>
    <div className="sticky top-0 z-30 px-3 py-2.5 backdrop-blur-md border-b" style={{backgroundColor:`${colors.surface}f5`,borderColor:colors.outlineVariant}}>
      <div className="flex items-center gap-2"><M3IconButton aria-label="Back" onClick={onBack}><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></M3IconButton><div className="min-w-0 flex-1"><h2 className="text-base font-black truncate">{workflow.name}</h2><p className="text-[10px] font-mono opacity-65 truncate">{repoName} · #{run?.run_number??'—'} · {run?.head_branch||'—'} · {run?.head_sha?.slice(0,7)||'—'}</p></div><span className="px-2 py-1 rounded-full text-[10px] font-black" style={{color:runColor,backgroundColor:`${runColor}22`}}>{statusText(runTone)}</span></div>
      <div className="mt-2 flex items-center gap-2 overflow-x-auto"><span className="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap" style={{backgroundColor:connection==='live'?colors.diffAddedContainer:connection==='offline'?colors.errorContainer:colors.tertiaryContainer,color:connection==='live'?colors.diffAdded:connection==='offline'?colors.error:colors.tertiary}}>● {connection==='live'?'Live':connection==='reconnecting'?'Reconnecting':connection==='offline'?'Offline':'Polling'}{connection!=='live'?` · Updated ${Math.max(0,Math.floor((Date.now()-updatedAt)/1000))}s ago`:''}</span><span className="text-[10px] font-mono opacity-55 whitespace-nowrap">Elapsed {duration(run?.created_at,run?.status==='completed'?run.updated_at:null,now)}</span><button className="text-[10px] font-bold underline whitespace-nowrap" onClick={()=>openExternal(run?.html_url)}>GitHub ↗</button></div>
    </div>
    <div className="p-4 pb-28 flex flex-col gap-3">
      {rateBanner&&<div className="rounded-2xl border px-3 py-2 text-[11px] font-semibold" style={{backgroundColor:colors.tertiaryContainer,color:colors.onTertiaryContainer,borderColor:colors.outlineVariant}}>{rateBanner}</div>}
      {error&&<div className="rounded-2xl border px-3 py-2 text-xs font-semibold" style={{backgroundColor:colors.errorContainer,color:colors.onErrorContainer,borderColor:colors.error}}>{error}</div>}
      <div className="rounded-3xl border p-3" style={{backgroundColor:colors.surfaceContainerLow,borderColor:colors.outlineVariant}}><div className="flex flex-wrap gap-2"><M3Button variant="outlined" shape="capsule" size="compact" loading={actionBusy} disabled={runTone!=='running'&&runTone!=='queued'} onClick={()=>void performAction('cancel')}>Cancel</M3Button><M3Button variant="outlined" shape="capsule" size="compact" loading={actionBusy} onClick={()=>void performAction('rerun')}>Re-run all</M3Button><M3Button variant="tonal" shape="capsule" size="compact" loading={actionBusy} onClick={()=>void performAction('failed')}>Re-run failed</M3Button></div></div>
      <div className="flex items-center justify-between px-1"><h3 className="text-xs font-black uppercase tracking-wider" style={{color:colors.onSurfaceVariant}}>Jobs & Steps · {jobs.length}</h3>{loading&&<span className="text-[10px] opacity-60">Loading…</span>}</div>
      {jobs.map(job=>{const t=toneOf(job),c=colorFor(t,colors),open=selectedJobId===job.id;return <div key={job.id} className="rounded-3xl border overflow-hidden" style={{backgroundColor:colors.surfaceContainerLowest,borderColor:open?c:colors.outlineVariant}}>
        <button type="button" className="w-full text-left p-3" onClick={()=>{setSelectedJobId(job.id);setSelectedStep(null);triggerHaptic('tick')}}><div className="flex gap-3 items-start"><span className={`workflow-status-dot ${t==='running'?'workflow-running':''}`} style={{backgroundColor:c,color:c}}>{t==='success'?'✓':t==='failure'?'×':t==='cancelled'?'–':t==='queued'?'○':t==='running'?'':'•'}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><span className="text-sm font-black truncate">{job.name}</span><span className="text-[10px] font-black uppercase" style={{color:c}}>{statusText(t)}</span></div><div className="mt-1 flex justify-between text-[10px] font-mono opacity-60"><span>{job.steps.length} steps{job.runner_name?` · ${job.runner_name}`:''}</span><span>{duration(job.started_at,job.completed_at,now)}</span></div></div></div></button>
        {open&&<div className="px-3 pb-3 flex flex-col gap-1.5">{job.steps.map(step=>{const st=toneOf(step),sc=colorFor(st,colors),active=selectedStep===step.number;return <button key={step.number} type="button" className={`w-full text-left rounded-2xl border p-2.5 ${st==='failure'?'animate-shake':''}`} style={{backgroundColor:st==='success'?`${colors.diffAdded}10`:st==='failure'?`${colors.error}12`:st==='running'?`${colors.tertiary}12`:colors.surfaceContainerLow,borderColor:active?sc:`${sc}55`}} onClick={()=>{setSelectedStep(step.number);setStepFilter(step.number)}}><div className="flex items-center gap-2"><span className={`workflow-step-icon ${st==='running'?'workflow-running':''}`} style={{color:sc,borderColor:`${sc}55`}}>{st==='success'?'✓':st==='failure'?'×':st==='cancelled'?'–':st==='queued'?'○':st==='running'?'':'•'}</span><span className="text-xs font-bold flex-1">{step.number}. {step.name}</span><span className="text-[10px] font-black uppercase" style={{color:sc}}>{statusText(st)}</span></div><div className="mt-1 text-right text-[10px] font-mono opacity-60">{duration(step.started_at,step.completed_at,now)}</div></button>})}</div>}
      </div>})}

      {selectedJob&&<div className="rounded-3xl border overflow-hidden" style={{backgroundColor:'#0b0b0d',borderColor:colors.outlineVariant}}>
        <div className="px-3 py-2.5 border-b" style={{borderColor:'#2c2c31'}}><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><div className="text-xs font-black text-white">{selectedStepObj?`Step ${selectedStepObj.number} · ${selectedStepObj.name}`:`${selectedJob.name} · Logs`}</div><div className="text-[10px] text-white/50 font-mono">GitHub log · adaptive tail</div></div><button className="text-[10px] text-white/70 px-2 py-1 rounded-lg bg-white/10" onClick={()=>setPaused(x=>!x)}>{paused?'Resume':'Pause'}</button></div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search logs" className="min-w-0 flex-1 rounded-lg px-2 py-1 text-[10px] bg-white/10 text-white outline-none"/><button className="text-[9px] text-white/70 bg-white/10 px-2 rounded-lg" onClick={()=>setRegex(x=>!x)}>Regex {regex?'ON':'OFF'}</button><button className="text-[9px] text-white/70 bg-white/10 px-2 rounded-lg" onClick={()=>setCaseSensitive(x=>!x)}>Aa</button><button className="text-[9px] text-white/70 bg-white/10 px-2 rounded-lg" onClick={jumpFirstError}>First error</button></div>
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto"><button className="text-[9px] text-white/70 bg-white/10 px-2 py-1 rounded-lg" onClick={()=>setStepFilter(null)}>{stepFilter===null?'All steps':`Step ${stepFilter}`}</button><button className="text-[9px] text-white/70 bg-white/10 px-2 py-1 rounded-lg" onClick={()=>setWrap(x=>!x)}>Wrap {wrap?'ON':'OFF'}</button><button className="text-[9px] text-white/70 bg-white/10 px-2 py-1 rounded-lg" onClick={()=>setShowLines(x=>!x)}>Lines {showLines?'ON':'OFF'}</button><button className="text-[9px] text-white/70 bg-white/10 px-2 py-1 rounded-lg" onClick={()=>setShowTs(x=>!x)}>Time {showTs?'ON':'OFF'}</button><button className="text-[9px] text-white/70 bg-white/10 px-2 py-1 rounded-lg" onClick={()=>setShowDebug(x=>!x)}>Debug {showDebug?'ON':'OFF'}</button><button className="text-[9px] text-white/70 bg-white/10 px-2 py-1 rounded-lg" onClick={()=>setFontSize(x=>Math.min(18,x+1))}>A+</button><button className="text-[9px] text-white/70 bg-white/10 px-2 py-1 rounded-lg" onClick={()=>setFontSize(x=>Math.max(8,x-1))}>A−</button><button className="text-[9px] text-white/70 bg-white/10 px-2 py-1 rounded-lg" onClick={exportLog}>Download</button><button className="text-[9px] text-white/70 bg-white/10 px-2 py-1 rounded-lg" onClick={()=>void shareText(rawLog)}>Share</button></div>
        </div>
        <div ref={logRef} onScroll={e=>{const el=e.currentTarget;const near=el.scrollHeight-el.scrollTop-el.clientHeight<40;if(!near)setFollow(false);else setFollow(true)}} className="max-h-[560px] overflow-auto p-2" style={{fontSize:`${fontSize}px`,fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',lineHeight:1.55}}>
          {filtered.length===0?<div className="p-5 text-center text-xs text-white/50">{rawLog?'No matching log lines.':'Waiting for GitHub log output…'}</div>:filtered.map(l=><div key={l.index} className={`flex gap-2 ${wrap?'whitespace-pre-wrap break-words':'whitespace-pre'}`} style={{color:l.level==='error'?'#ff8a80':l.level==='warning'?'#ffd166':l.level==='notice'?'#8bd5ff':'rgba(255,255,255,.82)'}}><span className="select-text shrink-0 text-white/25 text-right" style={{width:showLines?42:0,display:showLines?'block':'none'}}>{l.index+1}</span>{showTs&&l.ts&&<span className="text-white/35 shrink-0">{l.ts}</span>}<span className="select-text">{l.text}</span></div>)}
        </div>
        {!follow&&<button className="w-full py-2 text-[10px] font-black" style={{backgroundColor:colors.primary,color:colors.onPrimary}} onClick={scrollToBottom}>↓ New lines · jump to bottom</button>}
      </div>}
      {toast&&<button onClick={()=>setToast(null)} className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2 text-xs font-bold shadow-lg" style={{backgroundColor:colors.inverseSurface,color:colors.inverseOnSurface}}>{toast}</button>}
    </div>
  </div>;
};
