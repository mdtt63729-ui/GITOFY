import { Repository, WorkflowItem, WorkflowRun, InboxItem, DiffSummary, GitHubRelease } from '../types';

export const INITIAL_DEMO_WORKFLOWS: WorkflowItem[] = [
  {
    id: 101,
    name: 'Android CI (Debug APK)',
    path: '.github/workflows/android-ci.yml',
    state: 'active',
    last_run_status: 'success',
    last_run_at: '2 hours ago',
  },
  {
    id: 102,
    name: 'Android Release (Unsigned APK)',
    path: '.github/workflows/android-release.yml',
    state: 'active',
    last_run_status: 'in_progress',
    last_run_at: 'Just now',
  },
];

/**
 * Fetches real GitHub Actions workflows for a repository
 */
export async function fetchRepoWorkflows(
  owner: string,
  repo: string,
  token?: string
): Promise<WorkflowItem[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`, {
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.workflows) && data.workflows.length > 0) {
        return data.workflows.map((wf: any) => ({
          id: wf.id,
          name: wf.name,
          path: wf.path,
          state: wf.state,
          html_url: wf.html_url,
          badge_url: wf.badge_url,
          last_run_status: null,
          last_run_at: 'Tap to view runs',
        }));
      }
    }
  } catch {
    // Fallback
  }

  // If no workflows are defined on GitHub yet, provide standard Android CI templates
  return [
    {
      id: 101,
      name: 'Android CI (Debug APK)',
      path: '.github/workflows/android-ci.yml',
      state: 'active',
      last_run_status: 'success',
      last_run_at: 'Configured',
    },
    {
      id: 102,
      name: 'Android Release (Unsigned APK)',
      path: '.github/workflows/android-release.yml',
      state: 'active',
      last_run_status: 'queued',
      last_run_at: 'Configured',
    },
  ];
}

/**
 * Fetches real workflow runs (execution history) from GitHub API
 */
export async function fetchWorkflowRuns(
  owner: string,
  repo: string,
  workflowId: number | string,
  token?: string
): Promise<WorkflowRun[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  try {
    // Try fetching by workflow ID/filename first
    let res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=20`,
      { headers }
    );

    // Fallback to all repository runs if specific workflow id not found
    if (!res.ok) {
      res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=20`, {
        headers,
      });
    }

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.workflow_runs)) {
        return data.workflow_runs.map((r: any) => ({
          id: r.id,
          name: r.name,
          workflow_id: r.workflow_id,
          head_branch: r.head_branch || 'main',
          head_sha: (r.head_sha || '').substring(0, 7),
          event: r.event,
          status: r.status,
          conclusion: r.conclusion,
          html_url: r.html_url,
          created_at: r.created_at,
          updated_at: r.updated_at,
          run_number: r.run_number,
          actor: {
            login: r.actor?.login || 'github-actions',
            avatar_url: r.actor?.avatar_url || '',
          },
          head_commit: {
            id: r.head_commit?.id ? r.head_commit.id.substring(0, 7) : '',
            message: r.head_commit?.message || 'Triggered workflow run',
            timestamp: r.head_commit?.timestamp || '',
          },
        }));
      }
    }
  } catch (err) {
    console.warn('Could not fetch runs from GitHub:', err);
  }

  return [];
}

/**
 * Real GitHub Actions Workflow Dispatch execution
 * Dispatches the workflow on the specified branch via GitHub REST API
 */
export async function triggerWorkflowDispatch(
  owner: string,
  repo: string,
  workflowIdOrPath: number | string,
  branch: string,
  token: string
): Promise<{ success: boolean; message: string }> {
  if (!token.trim()) {
    throw new Error('Personal Access Token with "workflow" scope is required to run workflows.');
  }

  const cleanBranch = branch || 'main';
  const cleanId = String(workflowIdOrPath).replace('.github/workflows/', '');

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${cleanId}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: cleanBranch,
      }),
    }
  );

  if (res.status === 204) {
    return {
      success: true,
      message: `Workflow dispatched successfully on branch "${cleanBranch}"!`,
    };
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(
    err.message ||
      `Failed to dispatch workflow (HTTP ${res.status}). Ensure the workflow file has a "workflow_dispatch:" trigger and your token has "workflow" scope.`
  );
}

/**
 * Fetches real notifications from GitHub API (G-03)
 */
export async function fetchUserInbox(token?: string): Promise<InboxItem[]> {
  if (!token || !token.trim()) {
    return [];
  }

  try {
    const res = await fetch('https://api.github.com/notifications?all=true&per_page=30', {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((n: any) => ({
          id: n.id,
          title: n.subject?.title || 'GitHub Notification',
          repo: n.repository?.full_name || 'Repository',
          summary: `${n.reason ? n.reason.toUpperCase() : 'NOTIFICATION'}: ${n.subject?.type || 'Update'} on ${n.repository?.name || ''}`,
          type: n.subject?.type === 'CheckSuite' || n.subject?.type === 'WorkflowRun' ? 'workflow' : 'push',
          status: n.unread ? 'success' : 'info',
          timestamp: new Date(n.updated_at).toLocaleDateString(),
          read: !n.unread,
          details: `Subject: ${n.subject?.title}\nType: ${n.subject?.type}\nRepository: ${n.repository?.full_name}\nReason: ${n.reason}`,
        }));
      }
    }
  } catch {
    // Return empty on network issues
  }

  return [];
}

/**
 * Fetches workflow run artifacts (e.g. built APK files) from GitHub Actions (F-01)
 */
export async function fetchRunArtifacts(
  owner: string,
  repo: string,
  runId: number | string,
  token?: string
): Promise<Array<{ id: number; name: string; size_in_bytes: number; expired: boolean; created_at: string }>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.artifacts) ? data.artifacts : [];
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Re-runs a GitHub Actions workflow run (F-41)
 */
export async function rerunWorkflowRun(
  owner: string,
  repo: string,
  runId: number | string,
  token: string,
  failedOnly: boolean = false
): Promise<boolean> {
  const endpoint = failedOnly ? 'rerun-failed-jobs' : 'rerun';
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/${endpoint}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );
  return res.status === 201 || res.status === 204;
}

/**
 * Cancels an in-progress GitHub Actions workflow run (F-41)
 */
export async function cancelWorkflowRun(
  owner: string,
  repo: string,
  runId: number | string,
  token: string
): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );
  return res.status === 202;
}

export const INITIAL_INBOX_ITEMS: InboxItem[] = [
  {
    id: 'inbox-1',
    title: 'Gitofy Ready',
    repo: 'Gitofy App',
    summary: 'Material 3 design system, Ultra-Fast Git push engine, and Actions APK installer initialized.',
    type: 'workflow',
    status: 'success',
    timestamp: 'Just now',
    read: false,
  },
];

/**
 * Fetches real releases for a repository from GitHub API
 */
export async function fetchRepoReleases(
  owner: string,
  repo: string,
  token?: string
): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`, {
    headers,
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    return [];
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Validates a GitHub Personal Access Token (PAT) and returns the user profile
 */
export async function validateGitHubToken(token: string): Promise<{
  success: boolean;
  username: string;
  avatarUrl: string;
  error?: string;
}> {
  if (!token.trim()) {
    return { success: false, username: '', avatarUrl: '', error: 'Token is required' };
  }

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (res.status === 401) {
      return { success: false, username: '', avatarUrl: '', error: 'Invalid GitHub Personal Access Token (Bad credentials)' };
    }

    if (!res.ok) {
      return { success: false, username: '', avatarUrl: '', error: `GitHub error: HTTP ${res.status}` };
    }

    const data = await res.json();
    return {
      success: true,
      username: data.login || 'GitHub User',
      avatarUrl: data.avatar_url || '',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { success: false, username: '', avatarUrl: '', error: `Connection failed: ${msg}` };
  }
}

export const GITHUB_LANGUAGE_COLORS: Record<string, string> = {
  Kotlin: '#A97BFF',
  Java: '#b07219',
  Dart: '#00B4AB',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  'C++': '#f34b7d',
  'C#': '#178600',
  C: '#555555',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Rust: '#dea584',
  Go: '#00ADD8',
  Swift: '#F05138',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Shell: '#89e051',
  Vue: '#41b883',
  Scala: '#c22d40',
  R: '#198CE7',
  Lua: '#000080',
  Markdown: '#083fa1',
  XML: '#0060ac',
};

/**
 * Fetches real repositories for the authenticated user from GitHub API
 * Implements G-01 (Pagination parsing Link header) and G-02 (Eliminates N+1 calls)
 */
export async function fetchUserRepos(token: string): Promise<Repository[]> {
  if (!token.trim()) {
    return [];
  }

  const allRawRepos: any[] = [];
  let page = 1;
  let hasNext = true;
  const maxPages = 6; // Up to 600 repositories supported seamlessly

  while (hasNext && page <= maxPages) {
    try {
      const res = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!res.ok) {
        if (page === 1) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Failed to fetch repos (HTTP ${res.status})`);
        }
        break;
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      allRawRepos.push(...data);

      const linkHeader = res.headers.get('link') || '';
      if (!linkHeader.includes('rel="next"')) {
        hasNext = false;
      } else {
        page++;
      }
    } catch (err) {
      if (page === 1) throw err;
      break;
    }
  }

  // Map repositories without firing separate N+1 /languages calls (G-02)
  return allRawRepos.map((r: any) => {
    let trueLang = r.language || null;

    if (!trueLang) {
      const lowerName = (r.name || '').toLowerCase();
      const lowerDesc = (r.description || '').toLowerCase();
      if (lowerName.includes('android') || lowerDesc.includes('android') || lowerName.includes('apk')) {
        trueLang = 'Kotlin';
      } else if (lowerName.includes('flutter') || lowerDesc.includes('flutter')) {
        trueLang = 'Dart';
      } else if (lowerName.includes('python') || lowerDesc.includes('python')) {
        trueLang = 'Python';
      } else if (lowerName.includes('java')) {
        trueLang = 'Java';
      } else if (lowerName.includes('react') || lowerName.includes('node') || lowerName.includes('js')) {
        trueLang = 'JavaScript';
      } else if (lowerName.includes('ts')) {
        trueLang = 'TypeScript';
      } else if (lowerName.includes('cpp') || lowerName.includes('c++')) {
        trueLang = 'C++';
      }
    }

    const languagesList = trueLang
      ? [{ name: trueLang, percentage: 100, color: GITHUB_LANGUAGE_COLORS[trueLang] || '#6e7681' }]
      : [];

    return {
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      private: r.private,
      fork: r.fork,
      archived: r.archived,
      html_url: r.html_url,
      default_branch: r.default_branch || 'main',
      stargazers_count: r.stargazers_count || 0,
      forks_count: r.forks_count || 0,
      language: trueLang,
      languages: languagesList,
      updated_at: r.updated_at,
      owner: {
        login: r.owner?.login || '',
        avatar_url: r.owner?.avatar_url || '',
      },
      last_commit: {
        sha: r.default_branch ? 'latest' : '',
        message: 'Active repository',
        date: new Date(r.updated_at).toLocaleDateString(),
      },
      action_status: null,
    };
  });
}

/**
 * Lazily fetches detailed language percentage breakdown for a specific repository (G-02)
 */
export async function fetchRepoLanguages(
  owner: string,
  repo: string,
  token?: string
): Promise<Array<{ name: string; percentage: number; color: string }>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers });
    if (!res.ok) return [];

    const data: Record<string, number> = await res.json();
    const entries = Object.entries(data);
    if (entries.length === 0) return [];

    const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
    return entries.map(([name, bytes]) => ({
      name,
      percentage: Math.round((bytes / totalBytes) * 100),
      color: GITHUB_LANGUAGE_COLORS[name] || '#6e7681',
    }));
  } catch {
    return [];
  }
}

/**
 * Checks real repository name availability on GitHub
 */
export async function checkRepoAvailability(
  name: string,
  owner: string,
  token?: string
): Promise<{ available: boolean; message: string }> {
  const cleanName = name.trim();
  if (!cleanName) {
    return { available: false, message: 'Repository name is required' };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(cleanName)) {
    return {
      available: false,
      message: 'Only letters, numbers, hyphens, dots, and underscores allowed',
    };
  }

  if (token && owner) {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${cleanName}`, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (res.status === 404) {
        return { available: true, message: 'Name is available on your GitHub account' };
      }
      if (res.status === 200) {
        return { available: false, message: 'A repository with this name already exists' };
      }
    } catch {
      // Fallback
    }
  }

  return { available: true, message: 'Valid repository name' };
}

/**
 * Real repository creation on GitHub API
 */
export async function createGitHubRepo(
  data: {
    name: string;
    description: string;
    isPrivate: boolean;
    autoInit: boolean;
    language?: string;
  },
  token: string
): Promise<Repository> {
  if (!token.trim()) {
    throw new Error('GitHub Personal Access Token is required to create a repository.');
  }

  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: data.name,
      description: data.description || undefined,
      private: data.isPrivate,
      auto_init: data.autoInit,
    }),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || `Failed to create repo (HTTP ${res.status})`);
  }

  const r = await res.json();
  return {
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    description: r.description,
    private: r.private,
    fork: r.fork,
    archived: r.archived,
    html_url: r.html_url,
    default_branch: r.default_branch || 'main',
    stargazers_count: 0,
    forks_count: 0,
    language: data.language || r.language || null,
    updated_at: r.updated_at || new Date().toISOString(),
    owner: {
      login: r.owner?.login || '',
      avatar_url: r.owner?.avatar_url || '',
    },
    last_commit: {
      sha: 'initial',
      message: 'Initial commit (auto_init)',
      date: 'Just now',
    },
    action_status: null,
  };
}

/**
 * Real repository deletion on GitHub API
 */
export async function deleteGitHubRepo(owner: string, repo: string, token: string): Promise<boolean> {
  if (!token.trim()) {
    throw new Error('GitHub Personal Access Token with delete_repo scope is required.');
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (res.status === 204) {
    return true;
  }

  if (res.status === 403 || res.status === 404) {
    throw new Error('Cannot delete repository. Ensure your PAT has the "delete_repo" scope.');
  }

  const err = await res.json().catch(() => ({}));
  throw new Error(err.message || `Delete failed with HTTP ${res.status}`);
}

/**
 * Fetches real remote git tree map from GitHub
 */
export async function fetchRemoteTreeMap(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<Record<string, { sha: string; size?: number }>> {
  if (!token.trim()) return {};

  try {
    // 1. Get branch head reference
    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!refRes.ok) return {};
    const refData = await refRes.json();
    const commitSha = refData.object?.sha;
    if (!commitSha) return {};

    // 2. Get commit to get tree sha
    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`, {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!commitRes.ok) return {};
    const commitData = await commitRes.json();
    const treeSha = commitData.tree?.sha;
    if (!treeSha) return {};

    // 3. Get recursive tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    if (!treeRes.ok) return {};
    const treeData = await treeRes.json();

    const map: Record<string, { sha: string; size?: number }> = {};
    if (Array.isArray(treeData.tree)) {
      for (const item of treeData.tree) {
        if (item.type === 'blob') {
          map[item.path] = { sha: item.sha, size: item.size };
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Real Git Data API Push to GitHub
 * - Converts each modified/added file to a git blob on GitHub
 * - Creates a new tree
 * - Creates a new commit
 * - Updates the remote branch ref
 */
export async function performRealGitPush(
  owner: string,
  repo: string,
  branch: string,
  commitMessage: string,
  diffSummary: DiffSummary,
  localFiles: Array<{ path: string; data: Uint8Array }>,
  token: string,
  onProgress: (percent: number, phase: string, file: string) => void
): Promise<{ success: boolean; sha: string; error?: string }> {
  if (!token.trim()) {
    throw new Error('Personal Access Token is required to push to GitHub.');
  }

  const changedItems = diffSummary.items.filter((i) => i.status === 'added' || i.status === 'modified');
  const localFileMap = new Map(localFiles.map((f) => [f.path, f.data]));

  // Step 1: Upload blobs for changed items
  onProgress(5, 'Uploading Git blobs to GitHub...', 'Preparing files');
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];

  let uploadedCount = 0;
  for (const item of changedItems) {
    const data = localFileMap.get(item.path);
    if (!data) continue;

    // Convert Uint8Array to base64
    let binary = '';
    const bytes = data;
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    onProgress(
      Math.min(75, Math.round(5 + (uploadedCount / changedItems.length) * 70)),
      `Uploading blob ${uploadedCount + 1}/${changedItems.length}...`,
      item.path
    );

    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: base64,
        encoding: 'base64',
      }),
    });

    if (!blobRes.ok) {
      const err = await blobRes.json().catch(() => ({}));
      throw new Error(`Failed to upload blob for ${item.path}: ${err.message || blobRes.statusText}`);
    }

    const blobData = await blobRes.json();
    treeEntries.push({
      path: item.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha,
    });
    uploadedCount++;
  }

  // Step 2: Get current branch head commit
  onProgress(80, 'Fetching remote reference...', branch);
  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  let baseCommitSha: string | undefined = undefined;
  let baseTreeSha: string | undefined = undefined;

  if (refRes.ok) {
    const refData = await refRes.json();
    baseCommitSha = refData.object?.sha;

    if (baseCommitSha) {
      const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${baseCommitSha}`, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        baseTreeSha = commitData.tree?.sha;
      }
    }
  }

  // Step 3: Create Git Tree
  onProgress(88, 'Creating new Git tree on GitHub...', 'Building tree');
  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeEntries,
    }),
  });

  if (!treeRes.ok) {
    const err = await treeRes.json().catch(() => ({}));
    throw new Error(`Failed to create tree: ${err.message || treeRes.statusText}`);
  }
  const treeData = await treeRes.json();
  const newTreeSha = treeData.sha;

  // Step 4: Create Commit
  onProgress(93, 'Creating commit object...', 'Writing commit');
  const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: commitMessage,
      tree: newTreeSha,
      parents: baseCommitSha ? [baseCommitSha] : [],
    }),
  });

  if (!commitRes.ok) {
    const err = await commitRes.json().catch(() => ({}));
    throw new Error(`Failed to create commit: ${err.message || commitRes.statusText}`);
  }
  const commitData = await commitRes.json();
  const newCommitSha = commitData.sha;

  // Step 5: Update Branch Ref
  onProgress(97, `Updating branch refs/heads/${branch}...`, 'Updating reference');
  const updateRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sha: newCommitSha,
      force: false,
    }),
  });

  if (!updateRefRes.ok) {
    // If ref does not exist yet (e.g. brand new branch), create it with POST
    const createRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: newCommitSha,
      }),
    });

    if (!createRefRes.ok) {
      const err = await createRefRes.json().catch(() => ({}));
      throw new Error(`Failed to update branch reference: ${err.message || updateRefRes.statusText}`);
    }
  }

  onProgress(100, 'Commit and push successful!', 'Done');
  return { success: true, sha: newCommitSha.substring(0, 7) };
}

/** Gitofy Part 3: lightweight backup/restore helpers. */
export async function createBackupTag(owner: string, repo: string, branch: string, token: string): Promise<{name:string;sha:string}> {
  const headers = { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };
  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
  if (!refRes.ok) throw new Error(`Could not read ${branch} HEAD (HTTP ${refRes.status}).`);
  const refData = await refRes.json();
  const name = `gitofy-backup-${new Date().toISOString().replace(/[:.]/g,'-')}`;
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, { method:'POST', headers, body:JSON.stringify({ref:`refs/tags/${name}`, sha:refData.object.sha}) });
  if (!createRes.ok) { const e = await createRes.json().catch(()=>({})); throw new Error(e.message || `Backup tag failed (HTTP ${createRes.status}).`); }
  return { name, sha: refData.object.sha };
}

export async function fetchBackupTags(owner: string, repo: string, token: string): Promise<Array<{name:string;sha:string}>> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/matching-refs/tags/gitofy-backup-`, { headers:{ Authorization:`Bearer ${token.trim()}`, Accept:'application/vnd.github.v3+json' } });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data.map((r:any)=>({name:String(r.ref).replace('refs/tags/',''),sha:r.object?.sha||''})).filter((x:any)=>x.sha).reverse() : [];
}

export async function restoreBranchToSha(owner: string, repo: string, branch: string, sha: string, token: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method:'PATCH', headers:{ Authorization:`Bearer ${token.trim()}`, Accept:'application/vnd.github.v3+json', 'Content-Type':'application/json' }, body:JSON.stringify({sha,force:false}) });
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.message || `Restore failed (HTTP ${res.status}).`); }
}
