/**
 * Safe accessors for a repository's owner.
 *
 * Some repositories in the app are built locally (just after creation) or are
 * older objects restored from storage, and they do not always carry an `owner`
 * object. Reading `repo.owner.login` directly therefore threw
 * "Cannot read properties of undefined (reading 'login')" — for example while
 * clearing a repository's contents. Always go through these helpers.
 */

interface OwnerLike {
  owner?: { login?: string; avatar_url?: string } | null;
  full_name?: string;
}

export function repoOwnerLogin(repo: OwnerLike | null | undefined): string {
  const login = repo?.owner?.login;
  if (login) return login;
  const fromFullName = repo?.full_name ? repo.full_name.split('/')[0] : '';
  return fromFullName || 'user';
}

export function repoOwnerAvatar(repo: OwnerLike | null | undefined, fallback = ''): string {
  return repo?.owner?.avatar_url || fallback;
}
