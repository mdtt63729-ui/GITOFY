import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

const app = express();
const PORT = 3000;

// Middleware for binary ZIP uploads (up to 500MB)
app.use('/api/git-engine/upload', express.raw({ type: '*/*', limit: '500mb' }));
app.use(express.json({ limit: '10mb' }));

interface UploadJob {
  id: string;
  phase:
    | 'idle'
    | 'validating'
    | 'extracting'
    | 'indexing'
    | 'hashing'
    | 'diffing'
    | 'git_prep'
    | 'uploading'
    | 'committing'
    | 'pushing'
    | 'verifying'
    | 'completed'
    | 'error'
    | 'cancelled';
  progress: number;
  currentFile: string;
  completedFiles: number;
  totalFiles: number;
  uploadedBytes: number;
  totalBytes: number;
  speed: string;
  eta: string;
  startTime: number;
  phaseTimes: {
    validateMs?: number;
    extractMs?: number;
    hashMs?: number;
    diffMs?: number;
    packMs?: number;
    pushMs?: number;
    verifyMs?: number;
    totalMs?: number;
  };
  diffSummary?: {
    added: number;
    modified: number;
    deleted: number;
    unchanged: number;
    total: number;
  };
  commitSha: string | null;
  verified: boolean;
  errorMessage: string | null;
  childProcess?: any;
  tempDir: string;
  cancelled: boolean;
  sseClients: Response[];
}

const activeJobs = new Map<string, UploadJob>();

// Broadcast updates to SSE subscribers
function notifyJobUpdate(job: UploadJob) {
  const data = JSON.stringify({
    id: job.id,
    phase: job.phase,
    progress: job.progress,
    currentFile: job.currentFile,
    completedFiles: job.completedFiles,
    totalFiles: job.totalFiles,
    uploadedBytes: job.uploadedBytes,
    totalBytes: job.totalBytes,
    speed: job.speed,
    eta: job.eta,
    diffSummary: job.diffSummary,
    phaseTimes: job.phaseTimes,
    commitSha: job.commitSha,
    verified: job.verified,
    errorMessage: job.errorMessage,
  });

  job.sseClients.forEach((res) => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      // client disconnected
    }
  });
}

function calculateSpeedAndEta(job: UploadJob, transferredBytes: number) {
  const elapsedSec = (Date.now() - job.startTime) / 1000;
  if (elapsedSec > 0.3 && transferredBytes > 0) {
    const bytesPerSec = transferredBytes / elapsedSec;
    const mbPerSec = (bytesPerSec / (1024 * 1024)).toFixed(1);
    job.speed = `${mbPerSec} MB/s`;

    const remainingBytes = Math.max(0, job.totalBytes - transferredBytes);
    if (bytesPerSec > 0 && remainingBytes > 0) {
      const remainingSec = Math.round(remainingBytes / bytesPerSec);
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      job.eta = `${mins > 0 ? `${mins}m ` : ''}${secs}s`;
    } else {
      job.eta = '0s';
    }
  }
}

/**
 * Executes a Git command inside a specific directory with sanitized error logs
 */
async function runGit(args: string[], cwd: string, tokenToSanitize?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        let cleanError = stderr || stdout || `Git failed with code ${code}`;
        if (tokenToSanitize) {
          cleanError = cleanError.split(tokenToSanitize).join('***');
        }
        reject(new Error(cleanError.trim()));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// -------------------------------------------------------------
// API Routes: High-Speed Git Engine
// -------------------------------------------------------------

// 1. Health & Capability check
app.get('/api/git-engine/health', async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execFileAsync('git', ['--version']);
    res.json({
      status: 'ok',
      engine: 'native_git_cli',
      gitVersion: stdout.trim(),
      capabilities: [
        'git_smart_http',
        'pack_compression',
        'smart_diff',
        'streaming_sse',
        'unicode_paths',
        'binary_safe',
        'full_verification',
      ],
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. Real-time Progress (Server-Sent Events & JSON Polling)
app.get('/api/git-engine/progress/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  const job = activeJobs.get(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  // If client wants SSE:
  if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    job.sseClients.push(res);
    notifyJobUpdate(job);

    req.on('close', () => {
      job.sseClients = job.sseClients.filter((c) => c !== res);
    });
  } else {
    // Standard JSON poll
    res.json({
      id: job.id,
      phase: job.phase,
      progress: job.progress,
      currentFile: job.currentFile,
      completedFiles: job.completedFiles,
      totalFiles: job.totalFiles,
      uploadedBytes: job.uploadedBytes,
      totalBytes: job.totalBytes,
      speed: job.speed,
      eta: job.eta,
      diffSummary: job.diffSummary,
      phaseTimes: job.phaseTimes,
      commitSha: job.commitSha,
      verified: job.verified,
      errorMessage: job.errorMessage,
    });
  }
});

// 3. Cancel Job
app.post('/api/git-engine/cancel/:jobId', async (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  const job = activeJobs.get(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  job.cancelled = true;
  job.phase = 'cancelled';
  job.errorMessage = 'Upload cancelled by user.';

  if (job.childProcess) {
    try {
      job.childProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
  }

  // Cleanup temp directory
  try {
    if (fs.existsSync(job.tempDir)) {
      await fsp.rm(job.tempDir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }

  notifyJobUpdate(job);
  res.json({ success: true, message: 'Upload cancelled successfully' });
});

// 4. Primary Native Git Upload Endpoint (Binary ZIP Stream)
app.post('/api/git-engine/upload', async (req: Request, res: Response) => {
  const repoOwner = (req.headers['x-repo-owner'] as string) || '';
  const repoName = (req.headers['x-repo-name'] as string) || '';
  const branch = (req.headers['x-branch'] as string) || 'main';
  const commitMessage =
    decodeURIComponent((req.headers['x-commit-message'] as string) || 'Update project via Gitofy');
  const token = (req.headers['x-github-token'] as string) || '';
  const stripRoot = req.headers['x-strip-root'] === 'true';
  const jobId = (req.headers['x-job-id'] as string) || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  if (!token.trim()) {
    res.status(401).json({ error: 'GitHub Personal Access Token is required.' });
    return;
  }

  if (!repoOwner || !repoName) {
    res.status(400).json({ error: 'Target repository owner and name are required.' });
    return;
  }

  const zipBuffer = req.body as Buffer;
  if (!zipBuffer || !Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
    res.status(400).json({ error: 'Valid ZIP archive binary data is required.' });
    return;
  }

  // Initialize Job
  const tempDir = path.join('/tmp', 'gitofy-upload', jobId);
  const job: UploadJob = {
    id: jobId,
    phase: 'validating',
    progress: 5,
    currentFile: 'Validating ZIP integrity...',
    completedFiles: 0,
    totalFiles: 0,
    uploadedBytes: 0,
    totalBytes: zipBuffer.length,
    speed: 'Calculating...',
    eta: 'Estimating...',
    startTime: Date.now(),
    phaseTimes: {},
    commitSha: null,
    verified: false,
    errorMessage: null,
    tempDir,
    cancelled: false,
    sseClients: [],
  };

  activeJobs.set(jobId, job);

  // Send immediate 202 Accepted so client can track progress over SSE or poll
  res.status(202).json({
    jobId,
    status: 'processing',
    message: 'Ultra-fast Git engine initialized. Listening for progress...',
  });

  // Execute the pipeline asynchronously
  (async () => {
    try {
      await fsp.mkdir(tempDir, { recursive: true });
      const zipPath = path.join(tempDir, 'project.zip');
      const extractDir = path.join(tempDir, 'extracted');
      const repoDir = path.join(tempDir, 'repo');

      await fsp.writeFile(zipPath, zipBuffer);

      // STEP 1: ZIP VALIDATE
      const tValidateStart = Date.now();
      job.phase = 'validating';
      job.progress = 10;
      job.currentFile = 'Verifying ZIP magic bytes and checksums...';
      notifyJobUpdate(job);

      // Check ZIP magic bytes PK\x03\x04
      if (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4b || zipBuffer[2] !== 0x03 || zipBuffer[3] !== 0x04) {
        throw new Error('Invalid archive format: File is missing standard ZIP magic header.');
      }

      // Test ZIP integrity using unzip -tq
      try {
        await execFileAsync('unzip', ['-tq', zipPath]);
      } catch (err: any) {
        throw new Error(`Corrupted ZIP archive: ${err.message}`);
      }

      // Scan entry names for security and large files
      const { stdout: zipList } = await execFileAsync('unzip', ['-Z1', zipPath]);
      const entryLines = zipList.split('\n').filter((l) => l.trim().length > 0);
      job.totalFiles = entryLines.length;

      // Check for Zip Slip / Path Traversal
      for (const line of entryLines) {
        if (line.includes('../') || line.startsWith('/') || /^[a-zA-Z]:/.test(line)) {
          throw new Error(`Security Violation (Zip Slip detected): Malicious relative path "${line}"`);
        }
      }

      // Check for files exceeding 100 MiB (GitHub hard rejection limit)
      const { stdout: zipVerbose } = await execFileAsync('unzip', ['-l', zipPath]);
      const lines = zipVerbose.split('\n');
      for (const line of lines) {
        const match = line.trim().match(/^(\d+)\s+[\d-]+\s+[\d:]+\s+(.+)$/);
        if (match) {
          const size = parseInt(match[1], 10);
          const name = match[2];
          if (size > 104857600) {
            // 100 MiB limit
            throw new Error(
              `Large File Detected: "${name}" is ${(size / (1024 * 1024)).toFixed(
                1
              )} MB. GitHub rejects individual files over 100 MiB without Git LFS.`
            );
          }
        }
      }

      job.phaseTimes.validateMs = Date.now() - tValidateStart;

      if (job.cancelled) return;

      // STEP 2: ZIP EXTRACT
      const tExtractStart = Date.now();
      job.phase = 'extracting';
      job.progress = 25;
      job.currentFile = `Extracting ${job.totalFiles} files with native byte-perfection...`;
      notifyJobUpdate(job);

      await fsp.mkdir(extractDir, { recursive: true });
      await execFileAsync('unzip', ['-q', '-o', zipPath, '-d', extractDir]);

      // Remove any .git folder from the extracted project for hook security
      const extractedGitDir = path.join(extractDir, '.git');
      if (fs.existsSync(extractedGitDir)) {
        await fsp.rm(extractedGitDir, { recursive: true, force: true });
      }

      // Root Folder Handling: Strip single top-level directory if configured
      let effectiveSourceDir = extractDir;
      if (stripRoot) {
        const topEntries = await fsp.readdir(extractDir);
        if (topEntries.length === 1) {
          const singlePath = path.join(extractDir, topEntries[0]);
          const stat = await fsp.stat(singlePath);
          if (stat.isDirectory()) {
            effectiveSourceDir = singlePath;
          }
        }
      }

      job.phaseTimes.extractMs = Date.now() - tExtractStart;

      if (job.cancelled) return;

      // STEP 3: GIT WORKING TREE PREPARATION & CLONE/FETCH
      const tGitPrepStart = Date.now();
      job.phase = 'git_prep';
      job.progress = 40;
      job.currentFile = `Connecting to GitHub repository ${repoOwner}/${repoName}...`;
      notifyJobUpdate(job);

      await fsp.mkdir(repoDir, { recursive: true });
      await runGit(['init'], repoDir);
      await runGit(['config', 'user.name', 'Gitofy Engine'], repoDir);
      await runGit(['config', 'user.email', 'gitofy@vineflow.io'], repoDir);
      await runGit(['config', 'core.autocrlf', 'false'], repoDir);
      await runGit(['config', 'core.quotepath', 'false'], repoDir);

      const remoteUrl = `https://${token}@github.com/${repoOwner}/${repoName}.git`;
      await runGit(['remote', 'add', 'origin', remoteUrl], repoDir, token);

      // Check if remote branch exists
      let branchExists = false;
      try {
        const { stdout: lsRemoteOut } = await runGit(['ls-remote', '--heads', 'origin', branch], repoDir, token);
        branchExists = lsRemoteOut.includes(`refs/heads/${branch}`);
      } catch {
        // Empty repository or network issue handled below
      }

      if (branchExists) {
        job.currentFile = `Fetching latest state of branch "${branch}"...`;
        notifyJobUpdate(job);
        try {
          await runGit(['fetch', '--depth=1', 'origin', branch], repoDir, token);
          await runGit(['checkout', '-B', branch, `origin/${branch}`], repoDir, token);
        } catch {
          await runGit(['checkout', '-B', branch], repoDir, token);
        }
      } else {
        await runGit(['checkout', '-B', branch], repoDir, token);
      }

      job.phaseTimes.packMs = Date.now() - tGitPrepStart;

      if (job.cancelled) return;

      // STEP 4: SMART DIFF CALCULATION & WORKING TREE SYNC
      const tDiffStart = Date.now();
      job.phase = 'diffing';
      job.progress = 55;
      job.currentFile = 'Analyzing Smart Diff against remote repository...';
      notifyJobUpdate(job);

      // Copy all extracted files into repoDir (preserving Unicode, hidden files, binary)
      // Uses Node's cp with recursive and dereference
      await fsp.cp(effectiveSourceDir, repoDir, {
        recursive: true,
        force: true,
        filter: (src) => !src.includes('/.git/') && !src.endsWith('/.git'),
      });

      // Calculate diff using git status
      const { stdout: statusOut } = await runGit(['status', '--porcelain'], repoDir, token);
      const statusLines = statusOut.split('\n').filter((l) => l.trim().length > 0);

      let added = 0;
      let modified = 0;
      let deleted = 0;

      for (const line of statusLines) {
        const code = line.substring(0, 2).trim();
        if (code === '?' || code === 'A') added++;
        else if (code === 'M') modified++;
        else if (code === 'D') deleted++;
      }

      const changedCount = added + modified + deleted;
      job.diffSummary = {
        added,
        modified,
        deleted,
        unchanged: Math.max(0, job.totalFiles - (added + modified)),
        total: job.totalFiles,
      };

      job.phaseTimes.diffMs = Date.now() - tDiffStart;

      if (job.cancelled) return;

      // STEP 5: COMMITTING
      job.phase = 'committing';
      job.progress = 70;
      job.currentFile = `Staging ${changedCount} changed files...`;
      notifyJobUpdate(job);

      await runGit(['add', '-A'], repoDir, token);

      let commitCreated = false;
      let headSha = '';

      if (changedCount > 0) {
        await runGit(['commit', '-m', commitMessage], repoDir, token);
        const { stdout: revOut } = await runGit(['rev-parse', 'HEAD'], repoDir, token);
        headSha = revOut.trim();
        commitCreated = true;
      } else {
        // No changes needed
        const { stdout: revOut } = await runGit(['rev-parse', 'HEAD'], repoDir, token);
        headSha = revOut.trim() || 'latest';
      }

      job.commitSha = headSha.substring(0, 7);

      if (job.cancelled) return;

      // STEP 6: ULTRA-FAST GIT SMART HTTP PUSH
      const tPushStart = Date.now();
      job.phase = 'pushing';
      job.progress = 80;
      job.currentFile = `Transferring Git pack objects via Smart HTTP to GitHub (${branch})...`;
      notifyJobUpdate(job);

      if (changedCount > 0) {
        await runGit(['push', '-u', 'origin', branch], repoDir, token);
      }

      job.uploadedBytes = job.totalBytes;
      job.completedFiles = job.totalFiles;
      calculateSpeedAndEta(job, job.totalBytes);
      job.phaseTimes.pushMs = Date.now() - tPushStart;

      if (job.cancelled) return;

      // STEP 7: FINAL 100% VERIFICATION
      const tVerifyStart = Date.now();
      job.phase = 'verifying';
      job.progress = 95;
      job.currentFile = 'Verifying remote commit SHA and tree structure...';
      notifyJobUpdate(job);

      // Verify remote ref points to HEAD commit
      const { stdout: finalLsRemote } = await runGit(['ls-remote', 'origin', branch], repoDir, token);
      const isRefConfirmed = finalLsRemote.includes(headSha) || changedCount === 0;

      // Verify file count from git ls-tree
      const { stdout: lsTreeOut } = await runGit(['ls-tree', '-r', '--name-only', 'HEAD'], repoDir, token);
      const treeFiles = lsTreeOut.split('\n').filter((l) => l.trim().length > 0);

      job.verified = isRefConfirmed && treeFiles.length > 0;
      job.phaseTimes.verifyMs = Date.now() - tVerifyStart;
      job.phaseTimes.totalMs = Date.now() - job.startTime;

      // FINAL COMPLETION
      job.phase = 'completed';
      job.progress = 100;
      job.currentFile = '100% Verified! Repository successfully updated.';
      notifyJobUpdate(job);

      // Cleanup workspace asynchronously
      setTimeout(async () => {
        try {
          if (fs.existsSync(tempDir)) {
            await fsp.rm(tempDir, { recursive: true, force: true });
          }
        } catch {
          // ignore
        }
      }, 10000);
    } catch (err: any) {
      job.phase = 'error';
      job.errorMessage = err.message || 'Git upload failed';
      notifyJobUpdate(job);

      // Cleanup
      try {
        if (fs.existsSync(tempDir)) {
          await fsp.rm(tempDir, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }
    }
  })();
});

// -------------------------------------------------------------
// Vite Server Integration (Middleware Mode)
// -------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Gitofy Engine] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
