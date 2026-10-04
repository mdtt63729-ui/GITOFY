/**
 * Central auth configuration (§11): client id, app id, scopes, flags, endpoints.
 * Values are baked at build time from VITE_* env vars and may be overridden at
 * runtime by window.GITUFY_CONFIG (handy for self-hosters).
 *
 * NOTE: `clientId` is PUBLIC and safe to ship. A `clientSecret` is a credential
 * and is NEVER hard-coded here — it is read only from build-time/runtime config
 * for the optional Web+PKCE flow (§10.1, docs/incident-secret-rotation.md).
 */

export type ClientType = 'oauth-app' | 'github-app';

export interface GitufyRuntimeConfig {
  clientId?: string;
  /** Optional web-flow secret — MUST come from CI/build injection, never committed (§10.1). */
  clientSecret?: string;
  appId?: string;
  /** Defaults to auto-detection from the client id prefix (Iv… ⇒ GitHub App). */
  clientType?: ClientType;
  /** Optional CORS relay base URL used by the browser build for the two device-flow endpoints. */
  oauthRelayUrl?: string;
  webFlowEnabled?: boolean;
  patFallbackEnabled?: boolean;
}

declare global {
  interface Window {
    GITUFY_CONFIG?: GitufyRuntimeConfig;
  }
}

function readEnv(): GitufyRuntimeConfig {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    clientId: env.VITE_GITHUB_CLIENT_ID,
    clientSecret: env.VITE_GITHUB_CLIENT_SECRET,
    appId: env.VITE_GITHUB_APP_ID,
    clientType: env.VITE_GITHUB_CLIENT_TYPE as ClientType | undefined,
    oauthRelayUrl: env.VITE_OAUTH_RELAY_URL,
    webFlowEnabled: env.VITE_ENABLE_WEB_FLOW === 'true',
    patFallbackEnabled: env.VITE_ENABLE_PAT_FALLBACK !== 'false',
  };
}

const runtime: GitufyRuntimeConfig =
  typeof window !== 'undefined' && window.GITUFY_CONFIG ? window.GITUFY_CONFIG : {};
const baked = readEnv();

const PLACEHOLDER = 'GITUFY_CLIENT_ID_PLACEHOLDER';

/** Public client id for the Gitufy GitHub App (owner @mdtt63729-ui). */
const DEFAULT_CLIENT_ID = 'Iv23liLESLFaJa3yzCdE';
const DEFAULT_APP_ID = '5182766';

const clientId = runtime.clientId || baked.clientId || DEFAULT_CLIENT_ID;

function detectClientType(id: string): ClientType {
  return id.startsWith('Iv') ? 'github-app' : 'oauth-app';
}

export const AuthConfig = {
  clientId,
  appId: runtime.appId || baked.appId || DEFAULT_APP_ID,
  /**
   * GitHub App client ids start with `Iv`. GitHub Apps use fine-grained app
   * permissions instead of OAuth `scope`s and do not return X-OAuth-Scopes, so
   * the device-flow request omits `scope` and scope-gating is relaxed.
   */
  clientType: runtime.clientType || baked.clientType || detectClientType(clientId),
  clientSecret: runtime.clientSecret || baked.clientSecret || '',
  oauthRelayUrl: runtime.oauthRelayUrl || baked.oauthRelayUrl || '',
  webFlowEnabled: runtime.webFlowEnabled ?? baked.webFlowEnabled ?? false,
  patFallbackEnabled: runtime.patFallbackEnabled ?? baked.patFallbackEnabled ?? true,

  /** Redirect used only by the optional Web + PKCE flow (§6). */
  redirectUri: 'gitofy://callback',
  callbackScheme: 'gitofy',
  callbackHost: 'callback',

  endpoints: {
    deviceCode: 'https://github.com/login/device/code',
    accessToken: 'https://github.com/login/oauth/access_token',
    authorize: 'https://github.com/login/oauth/authorize',
    deviceVerification: 'https://github.com/login/device',
    userApi: 'https://api.github.com/user',
    manageApps: 'https://github.com/settings/applications',
    manageInstallations: 'https://github.com/settings/installations',
  },

  /** OAuth App device flow: expires_in ~900s, interval ~5s (documented defaults). */
  defaults: { expiresIn: 900, interval: 5 },

  storageKeys: {
    db: 'gitofy_secure_v1',
    accountsIndex: 'accounts_index',
    activeAccount: 'active_account',
    deviceSession: 'device_session',
    webSession: 'web_session',
    diagnostics: 'diagnostics',
  },
} as const;

export function isClientConfigured(): boolean {
  return !!AuthConfig.clientId && AuthConfig.clientId !== PLACEHOLDER;
}

export function isGitHubApp(): boolean {
  return AuthConfig.clientType === 'github-app';
}

export function isWebFlowConfigured(): boolean {
  return AuthConfig.webFlowEnabled && isClientConfigured() && !!AuthConfig.clientSecret;
}
