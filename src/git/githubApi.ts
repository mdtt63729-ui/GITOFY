import { Repository, WorkflowItem, WorkflowRun, InboxItem, DiffSummary, GitHubRelease } from '../types';

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

  // Never fabricate/demo workflows. An empty repository must show an empty state.
  return [];
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

/**
 * Builds the inbox from real GitHub notifications and recent Actions runs.
 * Actions runs are queried per known repository because GitHub notifications do not
 * reliably surface build success/failure events for every repository.
 */
export async function fetchUserActivityInbox(
  repos: Repository[],
  token?: string
): Promise<InboxItem[]> {
  if (!token?.trim()) return [];

  const notificationItems = await fetchUserInbox(token);
  const candidates = repos.slice(0, 20);
  const headers = {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github.v3+json',
  };

  const runGroups = await Promise.all(
    candidates.map(async (repo) => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repo.owner.login}/${repo.name}/actions/runs?per_page=8`,
          { headers }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
      } catch {
        return [];
      }
    })
  );

  const actionItems: InboxItem[] = runGroups.flat().map((run: any) => {
    const isSuccess = run.conclusion === 'success';
    const isFailure = run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'cancelled';
    const status: InboxItem['status'] = isSuccess ? 'success' : isFailure ? 'failure' : 'info';
    const stateLabel = isSuccess ? 'Build successful' : isFailure ? 'Build failed' : `Build ${run.status || 'queued'}`;
    const repoName = run.repository?.full_name || candidates.find((r) => r.id === run.repository_id)?.full_name || 'Repository';
    return {
      id: `workflow-${run.id}`,
      title: `${stateLabel}: ${run.name || 'GitHub Actions'}`,
      repo: repoName,
      summary: `${run.event || 'workflow'} • ${run.head_branch || 'main'} • Run #${run.run_number ?? ''}`,
      type: 'workflow',
      status,
      timestamp: run.updated_at ? new Date(run.updated_at).toLocaleString() : 'Recently',
      read: false,
      details: `Status: ${run.status || 'unknown'}\nConclusion: ${run.conclusion || 'in progress'}\nCommit: ${(run.head_sha || '').slice(0, 7)}`,
      commitSha: (run.head_sha || '').slice(0, 7),
      branch: run.head_branch || 'main',
      linkUrl: run.html_url,
    } as InboxItem;
  });

  const merged = [...actionItems, ...notificationItems];
  const unique = new Map<string, InboxItem>();
  merged.forEach((item) => unique.set(item.id, item));
  return [...unique.values()]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 60);
}

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

  const headers = {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github.v3+json',
  };
  const endpoint = (page: number) =>
    `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`;

  // Fetch page 1 first to discover the last page, then fetch remaining pages concurrently.
  // This avoids the old sequential 6-request startup delay.
  const firstRes = await fetch(endpoint(1), { headers });
  if (!firstRes.ok) {
    const err = await firstRes.json().catch(() => ({}));
    throw new Error(err.message || `Failed to fetch repos (HTTP ${firstRes.status})`);
  }
  const firstPage = await firstRes.json();
  if (!Array.isArray(firstPage) || firstPage.length === 0) return [];

  const allRawRepos: any[] = [...firstPage];
  const linkHeader = firstRes.headers.get('link') || '';
  const lastMatch = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>; rel="last"/);
  const lastPage = Math.min(Number(lastMatch?.[1] || 1), 6);

  if (lastPage > 1) {
    const pages = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) =>
        fetch(endpoint(i + 2), { headers }).then(async (res) => {
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data) ? data : [];
        }).catch(() => [])
      )
    );
    pages.forEach((items) => allRawRepos.push(...items));
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
      size: Number(r.size || 0),
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
 * Fetches real language breakdown for a repository from GitHub API
 * Returns an array of { name: string, bytes: number, percentage: number }
 */
export async function fetchRepoLanguages(
  owner: string,
  repo: string,
  token?: string
): Promise<Array<{ name: string; bytes: number; percentage: number }>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, {
      headers,
    });
    if (res.ok) {
      const data: Record<string, number> = await res.json();
      const totalBytes = Object.values(data).reduce((acc, curr) => acc + curr, 0);
      if (totalBytes > 0) {
        return Object.entries(data).map(([name, bytes]) => ({
          name,
          bytes,
          percentage: Math.round((bytes / totalBytes) * 100),
          color: GITHUB_LANGUAGE_COLORS[name] || '#6e7681',
        }));
      }
    }
  } catch (err) {
    console.warn('Could not fetch languages from GitHub:', err);
  }
  return [];
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

/**
 * Remove every tracked file from a repository in a single Git commit.
 * This clears source files, folders and workflow files without deleting the repository itself.
 */
export async function clearGitHubRepoContents(owner: string, repo: string, branch: string, token: string): Promise<string> {
  if (!token.trim()) throw new Error('GitHub Personal Access Token is required.');
  const headers = {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
  if (!refRes.ok) throw new Error(`Could not read ${branch} branch.`);
  const ref = await refRes.json();
  const headSha = ref.object?.sha;
  if (!headSha) throw new Error('Repository branch head was not found.');

  const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${headSha}`, { headers });
  if (!commitRes.ok) throw new Error('Could not read the latest repository commit.');
  const commit = await commitRes.json();
  const treeSha = commit.tree?.sha;
  if (!treeSha) throw new Error('Repository tree was not found.');

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`, { headers });
  if (!treeRes.ok) throw new Error('Could not read repository files.');
  const tree = await treeRes.json();
  const entries = Array.isArray(tree.tree) ? tree.tree : [];
  const deletions = entries
    .filter((entry: { type?: string; path?: string }) => (entry.type === 'blob' || entry.type === 'commit') && entry.path)
    .map((entry: { path: string }) => ({ path: entry.path, mode: '100644', type: 'blob', sha: null }));

  if (deletions.length === 0) return headSha;

  const newTreeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: 'POST', headers,
    body: JSON.stringify({ base_tree: treeSha, tree: deletions }),
  });
  if (!newTreeRes.ok) {
    const e = await newTreeRes.json().catch(() => ({}));
    throw new Error(e.message || 'Could not create the empty repository tree.');
  }
  const newTree = await newTreeRes.json();

  const newCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
    method: 'POST', headers,
    body: JSON.stringify({
      message: 'Clear repository contents via Gitofy',
      tree: newTree.sha,
      parents: [headSha],
    }),
  });
  if (!newCommitRes.ok) {
    const e = await newCommitRes.json().catch(() => ({}));
    throw new Error(e.message || 'Could not create the cleanup commit.');
  }
  const newCommit = await newCommitRes.json();

  const updateRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });
  if (!updateRefRes.ok) {
    const e = await updateRefRes.json().catch(() => ({}));
    throw new Error(e.message || 'Could not update the repository branch.');
  }
  return newCommit.sha;
}

export interface RepoTreeEntry {
  path: string;
  name: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url?: string;
}

export interface RepoCommit {
  sha: string;
  message: string;
  date: string;
  html_url: string;
  author?: { login?: string; avatar_url?: string };
  committer?: { login?: string; avatar_url?: string };
}

function githubHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json' };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}



interface GitHubResponseMeta {
  etag: string | null;
  remaining: number | null;
  limit: number | null;
  reset: number | null;
  retryAfter: number | null;
  notModified: boolean;
}

const etagCache = new Map<string, { etag: string; data: unknown; fetchedAt: number }>();
let rateLimitState: GitHubResponseMeta = { etag: null, remaining: null, limit: null, reset: null, retryAfter: null, notModified: false };

export function getGitHubRateLimitState(): GitHubResponseMeta { return { ...rateLimitState }; }

async function fetchGitHubJson<T>(url: string, token: string, options: RequestInit = {}): Promise<{ data: T; meta: GitHubResponseMeta }> {
  const key = url;
  const cached = etagCache.get(key);
  const headers = { ...githubHeaders(token), ...(options.headers || {}) } as Record<string, string>;
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  const res = await fetch(url, { ...options, headers });
  const meta: GitHubResponseMeta = {
    etag: res.headers.get('ETag'),
    remaining: Number.isFinite(Number(res.headers.get('X-RateLimit-Remaining'))) ? Number(res.headers.get('X-RateLimit-Remaining')) : null,
    limit: Number.isFinite(Number(res.headers.get('X-RateLimit-Limit'))) ? Number(res.headers.get('X-RateLimit-Limit')) : null,
    reset: Number.isFinite(Number(res.headers.get('X-RateLimit-Reset'))) ? Number(res.headers.get('X-RateLimit-Reset')) : null,
    retryAfter: Number.isFinite(Number(res.headers.get('Retry-After'))) ? Number(res.headers.get('Retry-After')) : null,
    notModified: res.status === 304,
  };
  rateLimitState = meta;
  if (res.status === 304 && cached) return { data: cached.data as T, meta };
  if (!res.ok) {
    if (res.status === 403 && meta.retryAfter) throw new Error(`GitHub rate limit/secondary limit. Retry after ${meta.retryAfter}s.`);
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `GitHub request failed (${res.status}).`);
  }
  const data = await res.json() as T;
  if (meta.etag) etagCache.set(key, { etag: meta.etag, data, fetchedAt: Date.now() });
  return { data, meta };
}

export async function fetchWorkflowRunWithMeta(owner: string, repo: string, runId: number, token: string): Promise<{ run: WorkflowRun; meta: GitHubResponseMeta }> {
  const { data: r, meta } = await fetchGitHubJson<any>(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, token);
  return { run: {
    id: r.id, name: r.name || r.workflow_name || 'GitHub Actions', workflow_id: r.workflow_id,
    head_branch: r.head_branch || '', head_sha: r.head_sha || '', event: r.event || '', status: r.status || 'queued',
    conclusion: r.conclusion, html_url: r.html_url || '', created_at: r.created_at || '', updated_at: r.updated_at || '',
    run_number: r.run_number || 0, actor: r.actor ? { login: r.actor.login, avatar_url: r.actor.avatar_url } : undefined,
    head_commit: r.head_commit ? { id: r.head_commit.id || '', message: r.head_commit.message || '', timestamp: r.head_commit.timestamp || '' } : undefined,
  } as WorkflowRun, meta };
}

export async function fetchWorkflowRunJobsWithMeta(owner: string, repo: string, runId: number, token: string): Promise<{ jobs: any[]; meta: GitHubResponseMeta }> {
  const { data, meta } = await fetchGitHubJson<any>(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`, token);
  return { jobs: Array.isArray(data.jobs) ? data.jobs.map((j: any) => ({
    id: j.id, name: j.name || 'Job', status: j.status || 'queued', conclusion: j.conclusion,
    started_at: j.started_at || null, completed_at: j.completed_at || null, runner_name: j.runner_name || null,
    steps: Array.isArray(j.steps) ? j.steps.map((step: any) => ({ number: step.number, name: step.name || 'Step', status: step.status || 'queued', conclusion: step.conclusion, started_at: step.started_at || null, completed_at: step.completed_at || null })) : [],
  })) : [], meta };
}

export async function cancelWorkflowRunDetailed(owner: string, repo: string, runId: number, token: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, { method: 'POST', headers: githubHeaders(token) });
  if (!res.ok && res.status !== 202) throw new Error(`Could not cancel run (${res.status}).`);
}

export async function rerunWorkflowRunDetailed(owner: string, repo: string, runId: number, token: string, failedOnly = false): Promise<void> {
  const endpoint = failedOnly ? 'rerun-failed-jobs' : 'rerun';
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/${endpoint}`, { method: 'POST', headers: githubHeaders(token) });
  if (!res.ok && res.status !== 201 && res.status !== 202) throw new Error(`Could not re-run workflow (${res.status}).`);
}

export async function fetchJobLogsIncremental(owner: string, repo: string, jobId: number, token: string): Promise<string> {
  return fetchJobLogs(owner, repo, jobId, token);
}

export async function fetchWorkflowRun(owner: string, repo: string, runId: number, token: string): Promise<WorkflowRun> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, { headers: githubHeaders(token) });
  if (!res.ok) throw new Error(`Could not load workflow run (${res.status}).`);
  const r = await res.json();
  return {
    id: r.id, name: r.name || r.workflow_name || 'GitHub Actions', workflow_id: r.workflow_id,
    head_branch: r.head_branch || '', head_sha: r.head_sha || '', event: r.event || '', status: r.status || 'queued',
    conclusion: r.conclusion, html_url: r.html_url || '', created_at: r.created_at || '', updated_at: r.updated_at || '',
    run_number: r.run_number || 0,
    actor: r.actor ? { login: r.actor.login, avatar_url: r.actor.avatar_url } : undefined,
    head_commit: r.head_commit ? { id: r.head_commit.id || '', message: r.head_commit.message || '', timestamp: r.head_commit.timestamp || '' } : undefined,
  } as WorkflowRun;
}

export async function fetchWorkflowRunJobs(owner: string, repo: string, runId: number, token: string): Promise<any[]> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`, { headers: githubHeaders(token) });
  if (!res.ok) throw new Error(`Could not load workflow jobs (${res.status}).`);
  const data = await res.json();
  return Array.isArray(data.jobs) ? data.jobs.map((j: any) => ({
    id: j.id, name: j.name || 'Job', status: j.status || 'queued', conclusion: j.conclusion,
    started_at: j.started_at || null, completed_at: j.completed_at || null,
    steps: Array.isArray(j.steps) ? j.steps.map((step: any) => ({ number: step.number, name: step.name || 'Step', status: step.status || 'queued', conclusion: step.conclusion, started_at: step.started_at || null, completed_at: step.completed_at || null })) : [],
  })) : [];
}

function readU16(bytes: Uint8Array, o: number) { return bytes[o] | (bytes[o+1] << 8); }
function readU32(bytes: Uint8Array, o: number) { return (bytes[o] | (bytes[o+1] << 8) | (bytes[o+2] << 16) | (bytes[o+3] << 24)) >>> 0; }

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This Android WebView cannot decompress GitHub job logs.');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractZipText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (readU32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return decoder.decode(bytes);
  const centralOffset = readU32(bytes, eocd + 16);
  const count = readU16(bytes, eocd + 10);
  let pos = centralOffset;
  const files: string[] = [];
  for (let i = 0; i < count; i++) {
    if (readU32(bytes, pos) !== 0x02014b50) break;
    const method = readU16(bytes, pos + 10);
    const compressedSize = readU32(bytes, pos + 20);
    const nameLen = readU16(bytes, pos + 28);
    const extraLen = readU16(bytes, pos + 30);
    const commentLen = readU16(bytes, pos + 32);
    const localOffset = readU32(bytes, pos + 42);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    const localNameLen = readU16(bytes, localOffset + 26);
    const localExtraLen = readU16(bytes, localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(start, start + compressedSize);
    let content: Uint8Array;
    if (method === 0) content = compressed;
    else if (method === 8) content = await inflateRaw(compressed);
    else { pos += 46 + nameLen + extraLen + commentLen; continue; }
    if (!name.endsWith('/')) files.push(`${name}\n${decoder.decode(content)}`);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return files.join('\n\n');
}

interface NativeTextBridge {
  githubGetText?: (url: string, token: string) => string;
}

export async function fetchJobLogs(owner: string, repo: string, jobId: number, token: string): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`;

  // Prefer the native bridge: the REST endpoint 302-redirects to a storage host
  // that does not send CORS headers, so a browser fetch from inside the WebView is
  // blocked by CORS and the logs never load. The native GET follows the redirect
  // without CORS. Falls back to fetch when the bridge is unavailable (browser/dev).
  const bridge = typeof window !== 'undefined'
    ? (window as unknown as { GitofyAndroid?: NativeTextBridge }).GitofyAndroid
    : undefined;
  if (bridge?.githubGetText) {
    let parsed: { status: number; body: string } | null = null;
    try {
      parsed = JSON.parse(bridge.githubGetText(url, token)) as { status: number; body: string };
    } catch {
      parsed = null;
    }
    if (parsed) {
      if (parsed.status >= 200 && parsed.status < 300) return parsed.body;
      if (parsed.status === 404) return ''; // logs not available yet
      if (parsed.status >= 400) throw new Error(`Could not load job logs (${parsed.status}).`);
    }
  }

  const res = await fetch(url, { headers: githubHeaders(token) });
  if (!res.ok) throw new Error(`Could not load job logs (${res.status}).`);
  const type = res.headers.get('content-type') || '';
  if (type.includes('text/plain') || type.includes('text/html')) return await res.text();
  return extractZipText(await res.arrayBuffer());
}

export async function fetchRepoTree(owner: string, repo: string, branch: string, token: string): Promise<RepoTreeEntry[]> {
  const ref = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: githubHeaders(token) });
  if (!ref.ok) throw new Error(`Could not load branch ${branch}.`);
  const refData = await ref.json();
  const commitSha = refData.object?.sha;
  if (!commitSha) throw new Error('Branch commit was not found.');
  const commit = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`, { headers: githubHeaders(token) });
  if (!commit.ok) throw new Error('Could not load repository tree.');
  const commitData = await commit.json();
  const treeSha = commitData.tree?.sha;
  if (!treeSha) return [];
  const tree = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`, { headers: githubHeaders(token) });
  if (!tree.ok) throw new Error('Could not load project structure.');
  const data = await tree.json();
  return (Array.isArray(data.tree) ? data.tree : []).filter((x: any) => x.type === 'blob' || x.type === 'tree').map((x: any) => ({ path: x.path, name: x.path.split('/').pop() || x.path, type: x.type, sha: x.sha, size: x.size, url: x.url }));
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  try { return new TextDecoder().decode(bytes); } catch { return binary; }
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export async function fetchRepoFile(owner: string, repo: string, path: string, token: string, branch = 'main'): Promise<{ content: string; sha: string }> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`, { headers: githubHeaders(token) });
  if (!res.ok) throw new Error(`Could not load ${path}.`);
  const data = await res.json();
  if (Array.isArray(data)) throw new Error('That path is a directory.');
  if (data.encoding === 'base64' && typeof data.content === 'string') return { content: decodeBase64Utf8(data.content), sha: data.sha };
  if (data.sha) {
    const blob = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${data.sha}`, { headers: githubHeaders(token) });
    if (!blob.ok) throw new Error(`Could not read ${path}.`);
    const blobData = await blob.json();
    return { content: blobData.encoding === 'base64' ? decodeBase64Utf8(blobData.content || '') : (blobData.content || ''), sha: data.sha };
  }
  throw new Error('GitHub did not return file content.');
}

export async function commitRepoFileChange(owner: string, repo: string, path: string, content: string, sha: string, message: string, branch: string, token: string): Promise<{ commitSha: string; contentSha: string }> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: githubHeaders(token, true), body: JSON.stringify({ message: message.trim() || 'Update file via Gitofy', content: encodeBase64Utf8(content), sha, branch }) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `GitHub returned ${res.status}.`); }
  const data = await res.json();
  return { commitSha: data.commit?.sha || '', contentSha: data.content?.sha || sha };
}

export async function fetchRepoCommits(owner: string, repo: string, branch: string, token: string): Promise<RepoCommit[]> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=50`, { headers: githubHeaders(token) });
  if (!res.ok) throw new Error('Could not load repository commits.');
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((c: any) => ({ sha: c.sha, message: c.commit?.message || 'Commit', date: c.commit?.author?.date || c.commit?.committer?.date || c.committer?.date || '', html_url: c.html_url, author: c.author ? { login: c.author.login, avatar_url: c.author.avatar_url } : undefined, committer: c.committer ? { login: c.committer.login, avatar_url: c.committer.avatar_url } : undefined }));
}

export async function addRepoCommitComment(owner: string, repo: string, commitSha: string, body: string, path: string, line: number, token: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}/comments`, { method: 'POST', headers: githubHeaders(token, true), body: JSON.stringify({ body, path, line: Math.max(1, line), side: 'RIGHT' }) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `Could not post comment (${res.status}).`); }
}
