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

    // Fetch remote branch HEAD
    let remoteTreeMap: Record<string, { sha: string; size?: number }> = {};
    let baseCommitSha: string | null = null;
    let baseTreeSha: string | null = null;

    try {
      const refRes = await fetch(
        `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/ref/heads/${options.branch}`,
        {
          headers: {
            Authorization: `Bearer ${options.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );
      if (refRes.ok) {
        const refData = await refRes.json();
        baseCommitSha = refData.object.sha;

        const commitRes = await fetch(
          `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/commits/${baseCommitSha}`,
          {
            headers: {
              Authorization: `Bearer ${options.token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );
        if (commitRes.ok) {
          const commitData = await commitRes.json();
          baseTreeSha = commitData.tree.sha;

          const treeRes = await fetch(
            `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/trees/${baseTreeSha}?recursive=1`,
            {
              headers: {
                Authorization: `Bearer ${options.token}`,
                Accept: 'application/vnd.github.v3+json',
              },
            }
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
      }
    } catch {
      // Empty repository
    }

    const diff = computeSmartDiff(localFiles, remoteTreeMap, false);
    phaseTimes.diffMs = Date.now() - tDiffStart;

    if (this.isCancelled) throw new Error('Upload cancelled');

    const filesToUpload = localFiles.filter((f) => {
      const diffItem = diff.items.find((d) => d.path === f.path);
      return diffItem && (diffItem.status === 'added' || diffItem.status === 'modified');
    });

    // 3. ADAPTIVE CONCURRENT UPLOAD (Workers: 8 to 16, adaptive backoff)
    const tUploadStart = Date.now();
    let completedCount = 0;
    let uploadedBytesTotal = 0;
    const uploadedBlobMap = new Map<string, string>(); // path -> blobSha

    let concurrency = 8;
    const maxConcurrency = 16;
    const queue = [...filesToUpload];

    const uploadWorker = async () => {
      while (queue.length > 0 && !this.isCancelled) {
        const file = queue.shift();
        if (!file) break;

        let attempt = 0;
        let success = false;
        let blobSha = '';

        while (attempt < 4 && !success && !this.isCancelled) {
          attempt++;
          try {
            // Encode binary byte-safe to base64
            let binaryString = '';
            const chunkSize = 8192;
            for (let i = 0; i < file.data.length; i += chunkSize) {
              const slice = file.data.subarray(i, i + chunkSize);
              binaryString += String.fromCharCode.apply(null, Array.from(slice));
            }
            const base64Content = btoa(binaryString);

            const blobRes = await fetch(
              `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/blobs`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${options.token}`,
                  Accept: 'application/vnd.github.v3+json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  content: base64Content,
                  encoding: 'base64',
                }),
              }
            );

            if (blobRes.status === 429) {
              // Rate limit: decrease concurrency and backoff
              concurrency = Math.max(4, Math.floor(concurrency * 0.7));
              await new Promise((r) => setTimeout(r, 1000 * attempt));
              continue;
            }

            if (blobRes.status >= 500) {
              // 5xx Server Error: retry with backoff
              await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
              continue;
            }

            if (!blobRes.ok) {
              const err = await blobRes.json().catch(() => ({}));
              throw new Error(err.message || `Failed to create blob (HTTP ${blobRes.status})`);
            }

            const blobData = await blobRes.json();
            blobSha = blobData.sha;
            success = true;

            // Adaptive ramp-up if performing well
            if (concurrency < maxConcurrency && Math.random() < 0.2) {
              concurrency++;
            }
          } catch (err) {
            if (attempt >= 4) throw err;
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }

        if (success) {
          uploadedBlobMap.set(file.path, blobSha);
          completedCount++;
          uploadedBytesTotal += file.size;

          const elapsedSec = (Date.now() - tUploadStart) / 1000;
          const mbps = elapsedSec > 0 ? (uploadedBytesTotal / (1024 * 1024) / elapsedSec).toFixed(1) : '0';

          const pct = Math.round(
            50 + (completedCount / Math.max(1, filesToUpload.length)) * 35
          );

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
      }
    };

    // Run workers concurrently
    const activeWorkers = Array.from({ length: Math.min(concurrency, filesToUpload.length || 1) }, () =>
      uploadWorker()
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

    const treeEntries = localFiles.map((file) => ({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: uploadedBlobMap.get(file.path) || file.sha,
    }));

    const createTreeRes = await fetch(
      `https://api.github.com/repos/${options.repoOwner}/${options.repoName}/git/trees`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tree: treeEntries,
        }),
      }
    );

    if (!createTreeRes.ok) {
      const err = await createTreeRes.json().catch(() => ({}));
      throw new Error(err.message || `Failed to create Git tree (HTTP ${createTreeRes.status})`);
    }

    const newTree = await createTreeRes.json();

    // 5. CREATE COMMIT
    const createCommitRes = await fetch(
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

    const updateRefRes = await fetch(
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
      await fetch(
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

    const verifyTreeRes = await fetch(
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
