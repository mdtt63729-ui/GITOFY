export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  languages?: Array<{ name: string; percentage: number; color: string }>;
  updated_at: string;
  size?: number;
  // Optional: repositories created locally, or restored from older storage,
  // may not carry an owner. Use repoOwnerLogin()/repoOwnerAvatar() to read it.
  owner?: {
    login: string;
    avatar_url: string;
  };
  last_commit?: {
    sha: string;
    message: string;
    date: string;
  };
  action_status?: 'success' | 'failure' | 'running' | 'queued' | null;
  pinned?: boolean;
}

export type DiffStatus = 'added' | 'modified' | 'deleted' | 'unchanged';

export interface DiffItem {
  path: string;
  status: DiffStatus;
  size: number;
  blobSha?: string;
  remoteSha?: string;
  linesAdded?: number;
  linesRemoved?: number;
  content?: string;
  oldContent?: string;
}

export interface DiffSummary {
  added: number;
  modified: number;
  deleted: number;
  unchanged: number;
  totalFiles: number;
  totalSize: number;
  items: DiffItem[];
}

export type UploadPhase =
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
  | 'paused'
  | 'error'
  | 'cancelled';

export interface UploadState {
  phase: UploadPhase;
  progress: number; // 0 to 100
  currentFile: string;
  completedFiles: number;
  totalFiles: number;
  uploadedBytes?: number;
  totalBytes?: number;
  speed: string;
  eta?: string;
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
  commitSha?: string | null;
  verified?: boolean;
  errorMessage: string | null;
}

export interface WorkflowRun {
  id: number;
  name: string;
  workflow_id: number;
  head_branch: string;
  head_sha: string;
  event: string;
  status: 'queued' | 'in_progress' | 'completed' | 'waiting';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_number: number;
  actor?: {
    login: string;
    avatar_url: string;
  };
  head_commit?: {
    id: string;
    message: string;
    timestamp: string;
  };
}

export interface WorkflowItem {
  id: number;
  name: string;
  path: string;
  state: string;
  badge?: string;
  html_url?: string;
  last_run_status?: 'success' | 'failure' | 'in_progress' | 'queued';
  last_run_at?: string;
  runs?: WorkflowRun[];
}

export interface InboxItem {
  id: string;
  title: string;
  repo: string;
  summary: string;
  type: 'push' | 'workflow' | 'repo_action' | 'github';
  status?: 'success' | 'failure' | 'info';
  timestamp: string;
  read: boolean;
  details?: string;
  commitSha?: string;
  branch?: string;
  linkUrl?: string;
}

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
  content_type: string;
  created_at: string;
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  html_url: string;
  author: {
    login: string;
    avatar_url: string;
  };
  assets: ReleaseAsset[];
}

export type AppScreen =
  | 'onboarding'
  | 'login'
  | 'permissions'
  | 'login_diagnostics'
  | 'app_lock'
  | 'home'
  | 'inbox'
  | 'repo_dashboard'
  | 'zip_analysis'
  | 'upload'
  | 'upload_flow'
  | 'result'
  | 'workflows'
  | 'workflow_run_detail'
  | 'settings'
  | 'github_settings'
  | 'repo_settings'
  | 'delete_repo'
  | 'repo_action'
  | 'repo_files'
  | 'repo_commits'
  | 'branch_manager'
  | 'gists'
  | 'global_search'
  | 'workflow_editor'
  | 'release_creator'
  | 'issues'
  | 'multi_upload'
  | 'error_log';
