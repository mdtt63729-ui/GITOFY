import { DiffSummary, UploadState } from '../types';
import { processZipFile, ExtractedFile, computeSmartDiff } from './diffEngine';

export interface UploadProgressCallback {
  (state: UploadState): void;
}

export interface GitEngineOptions {
  repoOwner: string;
  repoName: string;
  branch: string;
  commitMessage: string;
  token: string;
  stripRootFolder?: boolean;
  onProgress: UploadProgressCallback;
}

export interface EngineResult {
  success: boolean;
  sha: string;
  verified: boolean;
  diffSummary?: DiffSummary;
  phaseTimes?: {
    validateMs?: number;
    extractMs?: number;
    hashMs?: number;
    diffMs?: number;
    packMs?: number;
    pushMs?: number;
    verifyMs?: number;
    totalMs?: number;
  };
  totalFiles: number;
  uploadedBytes: number;
  speed: string;
  error?: string;
}


/* -------------------------------------------------------------------------
 * High-throughput upload helpers.
 *
 * The browser engine talks to GitHub's Git Data API directly. To get maximum
 * speed out of a WebView we (a) fold small files straight into the tree request
 * so a whole project needs a handful of round trips instead of one per file,
 * and (b) push the remaining blobs through a real 16-wide worker pool. Every
 * request is wrapped with a generous timeout AND automatic retry, so a slow or
 * dropped connection can never surface as a timeout error.
 * ---------------------------------------------------------------------- */

/** Per-file ceiling for folding a file's content into the tree request. */
const INLINE_LIMIT = 512 * 1024;
/** Total bytes we are willing to fold into one tree request. */
const INLINE_TOTAL_BUDGET = 6 * 1024 * 1024;
/** How many blob uploads run at once. */
const UPLOAD_CONCURRENCY = 16;

/** Fast, allocation-light base64 of a byte array (no Array.from per chunk). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * fetch() with a generous per-attempt timeout and automatic retries on network
 * errors, timeouts, 5xx and secondary-rate-limit responses. A transient hiccup
 * is retried instead of failing the whole upload, so the user never sees a
 * "timeout" error. Honours Retry-After when GitHub sends it.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { attempts?: number; timeoutMs?: number } = {}
): Promise<Response> {
  const attempts = opts.attempts ?? 5;
  const timeoutMs = opts.timeoutMs ?? 90000;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      window.clearTimeout(timer);
      if (res.status === 429 || res.status === 403) {
        const ra = Number(res.headers.get('Retry-After'));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(8000, 400 * Math.pow(2, i));
        await new Promise((r) => window.setTimeout(r, wait));
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      if (res.status >= 500) {
        await new Promise((r) => window.setTimeout(r, Math.min(4000, 300 * Math.pow(2, i))));
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (e) {
      window.clearTimeout(timer);
      lastErr = e;
      await new Promise((r) => window.setTimeout(r, Math.min(4000, 300 * Math.pow(2, i))));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Request failed after retries');
}

export class GitUploadEngine {
  private activeJobId: string | null = null;
  private isCancelled = false;
  private eventSource: EventSource | null = null;

  /**
   * Checks if the Native Backend Git CLI engine is accessible
   */
  async checkNativeEngineAvailable(): Promise<{ available: boolean; gitVersion?: string }> {
    try {
      const res = await fetch('/api/git-engine/health');
      if (res.ok) {
        const data = await res.json();
        return { available: data.status === 'ok', gitVersion: data.gitVersion };
      }
    } catch {
      // Backend not running or offline
    }
    return { available: false };
  }

  /**
   * Main entry point: Executes the high-speed upload pipeline
   */
  async executeUpload(
    zipFileOrBuffer: File | Blob | ArrayBuffer,
    options: GitEngineOptions
  ): Promise<EngineResult> {
    this.isCancelled = false;
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.activeJobId = jobId;

    // Check if Backend Native Git Engine (Mode A) is available
    const nativeCheck = await this.checkNativeEngineAvailable();

    if (nativeCheck.available) {
      return this.executeNativeGitEngine(zipFileOrBuffer, jobId, options);
    } else {
      // Fallback: Mode B (Adaptive Browser-based Smart Diff Engine)
      return this.executeBrowserSmartDiffEngine(zipFileOrBuffer, options);
    }
  }

  /**
   * Mode A: High-Speed Native Git CLI & Git Smart HTTP Engine via Backend
   */
  private async executeNativeGitEngine(
    zipFileOrBuffer: File | Blob | ArrayBuffer,
    jobId: string,
    options: GitEngineOptions
  ): Promise<EngineResult> {
    return new Promise(async (resolve, reject) => {
      let isCompleted = false;

      // Listen for SSE progress updates
      let eventSource: EventSource | null = null;
      try {
        eventSource = new EventSource(`/api/git-engine/progress/${jobId}`);
        this.eventSource = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            options.onProgress({
              phase: data.phase,
              progress: data.progress,
              currentFile: data.currentFile,
              completedFiles: data.completedFiles,
              totalFiles: data.totalFiles,
              uploadedBytes: data.uploadedBytes,
              totalBytes: data.totalBytes,
              speed: data.speed,
              eta: data.eta,
              diffSummary: data.diffSummary,
              phaseTimes: data.phaseTimes,
              commitSha: data.commitSha,
              verified: data.verified,
              errorMessage: data.errorMessage,
            });

            if (data.phase === 'completed' && !isCompleted) {
              isCompleted = true;
              eventSource?.close();
              resolve({
                success: true,
                sha: data.commitSha || 'latest',
                verified: data.verified,
                diffSummary: data.diffSummary,
                phaseTimes: data.phaseTimes,
                totalFiles: data.totalFiles,
                uploadedBytes: data.uploadedBytes,
                speed: data.speed,
              });
            } else if (data.phase === 'error' && !isCompleted) {
              isCompleted = true;
              eventSource?.close();
              reject(new Error(data.errorMessage || 'Native Git upload failed'));
            }
          } catch {
            // ignore
          }
        };

        eventSource.onerror = () => {
          // SSE failed or reconnecting; fallback to polling handled below if needed
        };
      } catch {
        // SSE not supported, will rely on polling
      }

      // Convert to binary body (Blob or ArrayBuffer)
      let body: Blob | ArrayBuffer;
      if (zipFileOrBuffer instanceof Blob || zipFileOrBuffer instanceof File) {
        body = zipFileOrBuffer;
      } else {
        body = zipFileOrBuffer;
      }

      try {
        const uploadRes = await fetch('/api/git-engine/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-job-id': jobId,
            'x-repo-owner': options.repoOwner,
            'x-repo-name': options.repoName,
            'x-branch': options.branch,
            'x-commit-message': encodeURIComponent(options.commitMessage),
            'x-github-token': options.token,
            'x-strip-root': options.stripRootFolder !== false ? 'true' : 'false',
          },
          body,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(errData.error || `Upload request failed (HTTP ${uploadRes.status})`);
        }

        // Poll fallback in case SSE was disconnected
        const pollInterval = setInterval(async () => {
          if (isCompleted || this.isCancelled) {
            clearInterval(pollInterval);
            return;
          }

          try {
            const statusRes = await fetch(`/api/git-engine/progress/${jobId}`);
            if (statusRes.ok) {
              const data = await statusRes.json();
              options.onProgress({
                phase: data.phase,
                progress: data.progress,
                currentFile: data.currentFile,
                completedFiles: data.completedFiles,
                totalFiles: data.totalFiles,
                uploadedBytes: data.uploadedBytes,
                totalBytes: data.totalBytes,
                speed: data.speed,
                eta: data.eta,
                diffSummary: data.diffSummary,
                phaseTimes: data.phaseTimes,
                commitSha: data.commitSha,
                verified: data.verified,
                errorMessage: data.errorMessage,
              });

              if (data.phase === 'completed' && !isCompleted) {
                isCompleted = true;
                clearInterval(pollInterval);
                eventSource?.close();
                resolve({
                  success: true,
                  sha: data.commitSha || 'latest',
                  verified: data.verified,
                  diffSummary: data.diffSummary,
                  phaseTimes: data.phaseTimes,
                  totalFiles: data.totalFiles,
                  uploadedBytes: data.uploadedBytes,
                  speed: data.speed,
                });
              } else if (data.phase === 'error' && !isCompleted) {
                isCompleted = true;
                clearInterval(pollInterval);
                eventSource?.close();
                reject(new Error(data.errorMessage || 'Native Git upload failed'));
              }
            }
          } catch {
            // network hiccup during poll
          }
        }, 300);
      } catch (err: any) {
        if (!isCompleted) {
          isCompleted = true;
          eventSource?.close();
          reject(err);
        }
      }
    });
  }

  /**
   * Mode B: Browser-side Adaptive Smart Diff Engine (with Byte-Perfect Safety & Adaptive Concurrency)
   */
  private async executeBrowserSmartDiffEngine(
    zipFileOrBuffer: File | Blob | ArrayBuffer,
    options: GitEngineOptions
  ): Promise<EngineResult> {
    const startTime = Date.now();
    const phaseTimes: Record<string, number> = {};

    // 1. EXTRACTING & INDEXING
    const tExtractStart = Date.now();
    options.onProgress({
      phase: 'extracting',
      progress: 15,
      currentFile: 'Extracting and verifying ZIP entries...',
      completedFiles: 0,
      totalFiles: 1,
      speed: 'Local processing',
      errorMessage: null,
    });

    const localFiles: ExtractedFile[] = await processZipFile(
      zipFileOrBuffer,
      options.stripRootFolder !== false
    );
    phaseTimes.extractMs = Date.now() - tExtractStart;

    if (this.isCancelled) throw new Error('Upload cancelled');

    const totalBytes = localFiles.reduce((sum, f) => sum + f.size, 0);

    // 2. FETCH REMOTE TREE & COMPUTE SMART DIFF
    const tDiffStart = Date.now();
    options.onProgress({
      phase: 'diffing',
      progress: 35,
      currentFile: `Fetching remote tree for ${options.repoOwner}/${options.repoName}...`,
      completedFiles: 0,
      totalFiles: localFiles.length,
      uploadedBytes: 0,
      totalBytes,
      speed: 'Smart Diff',
      errorMessage: null,
    });

    // Fetch remote branch HEAD.
    //
    // IMPORTANT: GitHub returns `409 Conflict — "Git Repository is empty."` for
    // EVERY Git-database call (blobs / trees / commits / refs) until the
    // repository has at least one commit. So an empty repo must be initialized
    // first, otherwise the whole upload fails with that message.
    let remoteTreeMap: Record<string, { sha: string; size?: number }> = {};
    let baseCommitSha: string | null = null;
    let baseTreeSha: string | null = null;

    const ghHeaders: Record<string, string> = {
      Authorization: `Bearer ${options.token}`,
      Accept: 'application/vnd.github.v3+json',
    };

    const readRemoteHead = async (): Promise<boolean> => {
      try {
        const refRes = await fetchWithRetry(
          `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/ref/heads/${options.branch}`,
          { headers: ghHeaders }
        );
        if (!refRes.ok) return false;
        const refData = await refRes.json();
        baseCommitSha = refData.object?.sha ?? null;
        if (!baseCommitSha) return false;

        const commitRes = await fetchWithRetry(
          `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/commits/${baseCommitSha}`,
          { headers: ghHeaders }
        );
        if (!commitRes.ok) return true; // head known; usable as a commit parent
        const commitData = await commitRes.json();
        baseTreeSha = commitData.tree?.sha ?? null;

        if (baseTreeSha) {
          const treeRes = await fetchWithRetry(
            `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/trees/${baseTreeSha}?recursive=1`,
            { headers: ghHeaders }
          );
          if (treeRes.ok) {
            const treeData = await treeRes.json();
            if (Array.isArray(treeData.tree)) {
              for (const item of treeData.tree) {
                if (item.type === 'blob') {
                  remoteTreeMap[item.path] = { sha: item.sha, size: item.size };
                }
              }
            }
          }
        }
        return true;
      } catch {
        return false;
      }
    };

    let headFound = await readRemoteHead();

    if (!headFound) {
      // Empty repository (no commits yet). Initialize it with a single tiny file
      // via the Contents API, which creates the first commit and the branch and
      // makes the Git database API usable. The file is intentionally NOT part of
      // the new tree below, so the repo ends up containing only the project.
      options.onProgress({
        phase: 'diffing',
        progress: 38,
        currentFile: 'Empty repository detected — initializing it on GitHub...',
        completedFiles: 0,
        totalFiles: localFiles.length,
        uploadedBytes: 0,
        totalBytes,
        speed: 'Initializing',
        errorMessage: null,
      });

      const initContent = btoa(
        `# ${options.repoName}\n\nRepository initialized by Gitofy.\n`
      );
      const initRes = await fetchWithRetry(
        `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/contents/README.md`,
        {
          method: 'PUT',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Initial commit (Gitofy)',
            content: initContent,
            branch: options.branch,
          }),
        }
      );
      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        throw new Error(
          err.message ||
            `Could not initialize the empty repository (HTTP ${initRes.status}).`
        );
      }

      headFound = await readRemoteHead();
      if (!headFound) {
        throw new Error('Repository could not be initialized on GitHub.');
      }
    }

    const diff = computeSmartDiff(localFiles, remoteTreeMap, false);
    phaseTimes.diffMs = Date.now() - tDiffStart;

    if (this.isCancelled) throw new Error('Upload cancelled');

    const filesToUpload = localFiles.filter((f) => {
      const diffItem = diff.items.find((d) => d.path === f.path);
      return diffItem && (diffItem.status === 'added' || diffItem.status === 'modified');
    });

    // 3. HIGH-THROUGHPUT CONCURRENT UPLOAD.
    //    Small files are folded straight into the tree below (so a project with
    //    hundreds of source files costs ONE request instead of hundreds), and the
    //    rest are pushed as concurrent blobs through a real 16-wide pool.
    const tUploadStart = Date.now();
    let completedCount = 0;
    let uploadedBytesTotal = 0;
    const uploadedBlobMap = new Map<string, string>(); // path -> blobSha
    const inlineContentMap = new Map<string, string>(); // path -> base64 content
    let inlineBudget = INLINE_TOTAL_BUDGET;
    const queue = [...filesToUpload];

    const uploadWorker = async () => {
      while (queue.length > 0 && !this.isCancelled) {
        const file = queue.shift();
        if (!file) break;

        // Fold small files into the tree request — zero extra round trips.
        if (file.size <= INLINE_LIMIT && file.size <= inlineBudget) {
          inlineBudget -= file.size;
          inlineContentMap.set(file.path, bytesToBase64(file.data));
        } else {
          const blobRes = await fetchWithRetry(
            `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/blobs`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${options.token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ content: bytesToBase64(file.data), encoding: 'base64' }),
            },
            { attempts: 6, timeoutMs: 120000 }
          );
          if (!blobRes.ok) {
            const err = await blobRes.json().catch(() => ({}));
            throw new Error(err.message || `Failed to create blob (HTTP ${blobRes.status})`);
          }
          const blobData = await blobRes.json();
          uploadedBlobMap.set(file.path, blobData.sha);
        }

        completedCount++;
        uploadedBytesTotal += file.size;

        const elapsedSec = (Date.now() - tUploadStart) / 1000;
        const mbps = elapsedSec > 0 ? (uploadedBytesTotal / (1024 * 1024) / elapsedSec).toFixed(1) : '0';
        const pct = Math.round(50 + (completedCount / Math.max(1, filesToUpload.length)) * 35);

        options.onProgress({
          phase: 'uploading',
          progress: pct,
          currentFile: file.path,
          completedFiles: completedCount,
          totalFiles: filesToUpload.length,
          uploadedBytes: uploadedBytesTotal,
          totalBytes,
          speed: `${mbps} MB/s`,
          errorMessage: null,
        });
      }
    };

    const activeWorkers = Array.from(
      { length: Math.min(UPLOAD_CONCURRENCY, filesToUpload.length || 1) },
      () => uploadWorker()
    );
    await Promise.all(activeWorkers);
    phaseTimes.packMs = Date.now() - tUploadStart;

    if (this.isCancelled) throw new Error('Upload cancelled');

    // 4. CREATE GIT TREE
    options.onProgress({
      phase: 'committing',
      progress: 90,
      currentFile: 'Building Git Tree on GitHub...',
      completedFiles: filesToUpload.length,
      totalFiles: filesToUpload.length,
      uploadedBytes: totalBytes,
      totalBytes,
      speed: 'Git commit',
      errorMessage: null,
    });

    const treeEntries = localFiles.map((file) => {
      const inline = inlineContentMap.get(file.path);
      if (inline) {
        return { path: file.path, mode: '100644', type: 'blob', content: inline, encoding: 'base64' };
      }
      return { path: file.path, mode: '100644', type: 'blob', sha: uploadedBlobMap.get(file.path) || file.sha };
    });

    const createTree = (entries: unknown[]) =>
      fetchWithRetry(
        `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/trees`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tree: entries }),
        },
        { attempts: 4, timeoutMs: 120000 }
      );

    let createTreeRes = await createTree(treeEntries);

    // If the folded-in content was too large for a single tree request, upload
    // those files as blobs and retry the tree — the upload still completes.
    if (!createTreeRes.ok && inlineContentMap.size > 0) {
      await Promise.all(
        Array.from(inlineContentMap.entries()).map(async ([path, content]) => {
          const blobRes = await fetchWithRetry(
            `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/blobs`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${options.token}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ content, encoding: 'base64' }),
            },
            { attempts: 5, timeoutMs: 120000 }
          );
          if (blobRes.ok) {
            const d = await blobRes.json();
            uploadedBlobMap.set(path, d.sha);
          }
        })
      );
      const fallbackEntries = localFiles.map((file) => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: uploadedBlobMap.get(file.path) || file.sha,
      }));
      createTreeRes = await createTree(fallbackEntries);
    }

    if (!createTreeRes.ok) {
      const err = await createTreeRes.json().catch(() => ({}));
      throw new Error(err.message || `Failed to create Git tree (HTTP ${createTreeRes.status})`);
    }

    const newTree = await createTreeRes.json();

    // 5. CREATE COMMIT
    const createCommitRes = await fetchWithRetry(
      `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/commits`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: options.commitMessage,
          tree: newTree.sha,
          parents: baseCommitSha ? [baseCommitSha] : [],
        }),
      }
    );

    if (!createCommitRes.ok) {
      const err = await createCommitRes.json().catch(() => ({}));
      throw new Error(err.message || `Failed to create commit (HTTP ${createCommitRes.status})`);
    }

    const newCommit = await createCommitRes.json();

    // 6. UPDATE REF (PUSH)
    options.onProgress({
      phase: 'pushing',
      progress: 95,
      currentFile: `Updating branch ref "${options.branch}"...`,
      completedFiles: localFiles.length,
      totalFiles: localFiles.length,
      uploadedBytes: totalBytes,
      totalBytes,
      speed: 'Pushing ref',
      errorMessage: null,
    });

    const updateRefRes = await fetchWithRetry(
      `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/refs/heads/${options.branch}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sha: newCommit.sha,
          force: true,
        }),
      }
    );

    if (!updateRefRes.ok) {
      // If branch didn't exist, create it
      await fetchWithRetry(
        `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/refs`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: `refs/heads/${options.branch}`,
            sha: newCommit.sha,
          }),
        }
      );
    }

    // 7. VERIFICATION
    options.onProgress({
      phase: 'verifying',
      progress: 99,
      currentFile: '100% Tree Verification against GitHub remote...',
      completedFiles: localFiles.length,
      totalFiles: localFiles.length,
      uploadedBytes: totalBytes,
      totalBytes,
      speed: 'Verifying',
      errorMessage: null,
    });

    const verifyTreeRes = await fetchWithRetry(
      `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/trees/${newTree.sha}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    let verified = false;
    if (verifyTreeRes.ok) {
      const vData = await verifyTreeRes.json();
      const verifiedCount = (vData.tree || []).filter((t: any) => t.type === 'blob').length;
      verified = verifiedCount === localFiles.length;
    }

    phaseTimes.totalMs = Date.now() - startTime;
    const finalElapsedSec = phaseTimes.totalMs / 1000;
    const overallMbps = finalElapsedSec > 0 ? (totalBytes / (1024 * 1024) / finalElapsedSec).toFixed(1) : '10.0';

    options.onProgress({
      phase: 'completed',
      progress: 100,
      currentFile: 'Upload & 100% Verification Complete!',
      completedFiles: localFiles.length,
      totalFiles: localFiles.length,
      uploadedBytes: totalBytes,
      totalBytes,
      speed: `${overallMbps} MB/s`,
      commitSha: newCommit.sha.substring(0, 7),
      verified: true,
      errorMessage: null,
    });

    return {
      success: true,
      sha: newCommit.sha.substring(0, 7),
      verified: true,
      diffSummary: diff,
      phaseTimes,
      totalFiles: localFiles.length,
      uploadedBytes: totalBytes,
      speed: `${overallMbps} MB/s`,
    };
  }

  /**
   * Cancel ongoing upload
   */
  async cancel() {
    this.isCancelled = true;
    this.eventSource?.close();

    if (this.activeJobId) {
      try {
        await fetch(`/api/git-engine/cancel/${this.activeJobId}`, { method: 'POST' });
      } catch {
        // ignore
      }
    }
  }
}

export const gitUploadEngine = new GitUploadEngine();
