/**
 * Deep-link parsing.
 *
 * The app understands two shapes and turns both into the same target:
 *
 *   gitofy://repo/<owner>/<name>[/tree/<branch>/<path>]
 *   https://github.com/<owner>/<name>[/tree/<branch>/<path>]
 *
 * Anything else — including GitHub pages that are not a repository — is
 * reported as "not a repo link" so the caller can hand it to the browser
 * instead of guessing.
 */

export interface DeepLinkTarget {
  owner: string;
  name: string;
  branch?: string;
  path?: string;
  /** The original string, kept for logging and for the browser fallback. */
  raw: string;
}

/** GitHub's own reserved top-level paths that are never a user name. */
const RESERVED = new Set([
  'about', 'pricing', 'features', 'enterprise', 'explore', 'topics', 'trending',
  'collections', 'events', 'sponsors', 'settings', 'notifications', 'issues',
  'pulls', 'marketplace', 'apps', 'login', 'logout', 'join', 'search', 'orgs',
  'users', 'new', 'organizations', 'account', 'dashboard', 'codespaces',
]);

const SEGMENT = /^[A-Za-z0-9._-]+$/;

export function parseDeepLink(raw: string | null | undefined): DeepLinkTarget | null {
  if (!raw || typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const isCustom = url.protocol === 'gitofy:';
  const isGitHub = url.protocol === 'https:' && /^(www\.)?github\.com$/i.test(url.hostname);
  if (!isCustom && !isGitHub) return null;

  // gitofy://repo/owner/name → host "repo", path "/owner/name".
  // github.com/owner/name   → host "github.com", path "/owner/name".
  let parts: string[];
  if (isCustom) {
    if (url.hostname !== 'repo') return null;
    parts = url.pathname.split('/').filter(Boolean);
  } else {
    parts = url.pathname.split('/').filter(Boolean);
  }

  const [owner, name, kind, branch, ...rest] = parts;
  if (!owner || !name) return null;
  if (!SEGMENT.test(owner) || !SEGMENT.test(name)) return null;
  if (isGitHub && RESERVED.has(owner.toLowerCase())) return null;

  const target: DeepLinkTarget = { owner, name, raw: raw.trim() };
  if (kind === 'tree' && branch) {
    target.branch = branch;
    if (rest.length) target.path = rest.join('/');
  }
  return target;
}

/** "owner/name" — the key the repository list is indexed by. */
export function deepLinkKey(target: DeepLinkTarget): string {
  return `${target.owner}/${target.name}`.toLowerCase();
}
