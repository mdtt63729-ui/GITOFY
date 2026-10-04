/**
 * Scope map + just-in-time scope escalation (§4).
 * First login requests only the minimum viable set; the rest are requested
 * when the matching feature is actually used.
 */

export type ScopeKey =
  | 'read:user'
  | 'repo'
  | 'workflow'
  | 'delete_repo'
  | 'user:email'
  | 'admin:repo_hook';

export interface ScopeMeta {
  key: ScopeKey;
  /** Plain-language explanation shown on the Permissions screen (§12). */
  title: string;
  reason: string;
  /** Features this scope unlocks, in plain language. */
  features: string[];
}

export const SCOPE_CATALOG: Record<ScopeKey, ScopeMeta> = {
  'read:user': {
    key: 'read:user',
    title: 'Profile',
    reason: 'Show your name and avatar.',
    features: ['Profile header', 'Account switcher'],
  },
  repo: {
    key: 'repo',
    title: 'Repositories',
    reason: 'Read and write your public and private repositories, push ZIP diffs, run and view Actions.',
    features: ['Browse repos', 'ZIP smart-diff push', 'Run/view workflows', 'Create/clear repos'],
  },
  workflow: {
    key: 'workflow',
    title: 'Workflow files',
    reason: 'Push files under .github/workflows/.',
    features: ['Push workflow YAML'],
  },
  delete_repo: {
    key: 'delete_repo',
    title: 'Delete repositories',
    reason: 'Permanently delete a repository when you tap Delete.',
    features: ['Delete repository'],
  },
  'user:email': {
    key: 'user:email',
    title: 'Email',
    reason: 'Read your email to set the commit author.',
    features: ['Commit author email'],
  },
  'admin:repo_hook': {
    key: 'admin:repo_hook',
    title: 'Webhooks',
    reason: 'Create repository webhooks for real-time sync (Instant mode).',
    features: ['Instant mode webhooks'],
  },
};

/** The minimal set requested on first login (§4). */
export const BASE_SCOPES: ScopeKey[] = ['read:user', 'repo'];

/** Scope required per feature; used by just-in-time escalation. */
export const FEATURE_SCOPES: Record<string, ScopeKey[]> = {
  profile: ['read:user'],
  repos: ['repo'],
  push: ['repo'],
  push_workflow: ['repo', 'workflow'],
  delete_repo: ['delete_repo'],
  commit_email: ['user:email'],
  webhooks: ['admin:repo_hook'],
};

export function scopesToString(scopes: ScopeKey[] | string[]): string {
  return Array.from(new Set(scopes)).join(' ');
}

export function hasScope(granted: string[], required: ScopeKey | ScopeKey[]): boolean {
  const need = Array.isArray(required) ? required : [required];
  return need.every((s) => granted.includes(s));
}

/** Parse the space-separated X-OAuth-Scopes header into a clean list (§4). */
export function parseScopesHeader(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Merge an existing grant with a new required scope into a combined request. */
export function unionScopes(existing: string[], required: ScopeKey[]): ScopeKey[] {
  const set = new Set<string>([...existing, ...required]);
  return Array.from(set) as ScopeKey[];
}

export function scopeLabel(key: string): string {
  return (SCOPE_CATALOG as Record<string, ScopeMeta>)[key]?.title ?? key;
}
