import { classifyHttpStatus, makeError } from './errors';
import type { AuthError } from './types';

/**
 * AuthInterceptor (§11, §7.3). Wraps window.fetch to:
 *   - optionally inject the active token for api.github.com calls,
 *   - classify 401 / 403 / 404 into a central session/org/scope/rate signal,
 *   - redact secrets from anything that might be logged.
 * It never logs request bodies or Authorization headers.
 */

interface InterceptorHooks {
  getActiveToken?: () => string | null;
  onAuthError?: (error: AuthError) => void;
}

const SENSITIVE_HEADERS = ['authorization'];
const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/(gh[pousr]_[A-Za-z0-9]{20,})/g, '***'],
  [/(github_pat_[A-Za-z0-9_]{20,})/g, '***'],
  [/(access_token=)[^&"'\s]+/gi, '$1***'],
  [/(device_code=)[^&"'\s]+/gi, '$1***'],
  [/(client_secret=)[^&"'\s]+/gi, '$1***'],
  [/(code_verifier=)[^&"'\s]+/gi, '$1***'],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, rep] of REDACT_PATTERNS) out = out.replace(re, rep);
  return out;
}

/** CI/test gate: assert a blob of text contains no token pattern (§15.1). */
export function containsSecret(text: string): boolean {
  return redact(text) !== text;
}

let installed = false;

export function installAuthInterceptor(hooks: InterceptorHooks = {}): () => void {
  if (typeof window === 'undefined' || installed) return () => undefined;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isGitHubApi = url.startsWith('https://api.github.com/');

    let finalInit = init;
    if (isGitHubApi && hooks.getActiveToken) {
      const headers = new Headers(init?.headers || (typeof input !== 'string' && !(input instanceof URL) ? input.headers : undefined));
      if (!headers.has('Authorization')) {
        const token = hooks.getActiveToken();
        if (token) headers.set('Authorization', `Bearer ${token}`);
      }
      finalInit = { ...init, headers };
    }

    const res = await originalFetch(input, finalInit);

    if (isGitHubApi) {
      const err = classifyHttpStatus(res.status, res.headers);
      if (err) hooks.onAuthError?.(err);
    }
    return res;
  };

  return () => {
    window.fetch = originalFetch;
    installed = false;
  };
}

export function describeSensitiveHeaders(): string[] {
  return [...SENSITIVE_HEADERS];
}

export function assertNoSecrets(text: string): void {
  if (containsSecret(text)) {
    throw makeError('E_CONFIG', { diagnostic: 'SECRET_IN_LOG' });
  }
}
