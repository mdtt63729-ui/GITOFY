import { AuthConfig } from './config';
import { base64Url, randomBytes, sha256Base64Url } from './crypto';
import { oauthFormPost } from './oauthHttp';
import { makeError } from './errors';
import type { WebPkceSession } from './types';

/**
 * Optional Web Flow + PKCE (§6). Off by default. Note the mandatory risk
 * disclosure: this flow embeds a client_secret in the app. PKCE here uses only
 * S256, with a single-use `state`, a strict callback match and a 10-minute
 * timeout. The verifier/state are wiped the moment they are consumed.
 */

export const WEB_FLOW_RISK_NOTICE =
  'This experimental flow embeds a client secret in the app. Anyone who extracts ' +
  'it could impersonate Gitufy. If you suspect a leak, rotate the secret on GitHub ' +
  'and ship a new release (see docs/incident-secret-rotation.md).';

function randomVerifier(): string {
  // 64 random bytes -> 86 base64url chars, within the required 43-128 range.
  return base64Url(randomBytes(64));
}

export async function createWebSession(scope: string): Promise<WebPkceSession> {
  const codeVerifier = randomVerifier();
  const state = base64Url(randomBytes(16)); // >= 128 bits
  return {
    state,
    codeVerifier,
    redirectUri: AuthConfig.redirectUri,
    scope,
    createdAt: Date.now(),
  };
}

export async function buildAuthorizeUrl(session: WebPkceSession): Promise<string> {
  const challenge = await sha256Base64Url(session.codeVerifier);
  const params = new URLSearchParams({
    client_id: AuthConfig.clientId,
    redirect_uri: session.redirectUri,
    scope: session.scope,
    state: session.state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AuthConfig.endpoints.authorize}?${params.toString()}`;
}

export interface CallbackResult {
  code: string;
}

/**
 * Validates the redirect: exact `state` match, single-use, and < 10 minutes old.
 * Unknown parameters are ignored.
 */
export function validateCallback(rawUrl: string, session: WebPkceSession | null): CallbackResult {
  if (!session) throw makeError('E_CONFIG', { diagnostic: 'PKCE_NO_SESSION' });
  if (Date.now() - session.createdAt > 10 * 60 * 1000) {
    throw makeError('E_SESSION', { diagnostic: 'PKCE_STALE' });
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw makeError('E_CONFIG', { diagnostic: 'PKCE_BAD_URL' });
  }
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error === 'access_denied') throw makeError('E_DENIED');
  if (error) throw makeError('E_CONFIG', { diagnostic: `PKCE_${error}` });
  if (!state || state !== session.state) throw makeError('E_CONFIG', { diagnostic: 'PKCE_STATE_MISMATCH' });
  if (!code) throw makeError('E_CONFIG', { diagnostic: 'PKCE_NO_CODE' });
  return { code };
}

export async function exchangeCodeForToken(
  code: string,
  session: WebPkceSession
): Promise<string> {
  if (!AuthConfig.clientSecret) {
    throw makeError('E_CONFIG', { diagnostic: 'PKCE_NO_SECRET' });
  }
  const res = await oauthFormPost(AuthConfig.endpoints.accessToken, {
    client_id: AuthConfig.clientId,
    client_secret: AuthConfig.clientSecret,
    code,
    redirect_uri: session.redirectUri,
    code_verifier: session.codeVerifier,
  });
  const data = res.json as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw makeError('E_CONFIG', { diagnostic: `PKCE_${data.error || 'no_token'}` });
  }
  return data.access_token;
}
