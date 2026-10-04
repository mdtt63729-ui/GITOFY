import { AuthConfig } from './config';

/**
 * Transport for the two device-flow endpoints (§5, §10.1).
 *
 * GitHub's github.com/login/* endpoints send NO CORS headers, so a browser
 * fetch is blocked by the user agent. We therefore try, in order:
 *   1. native  — the Android WebView bridge performs the HTTPS call (no CORS).
 *   2. relay   — an optional stateless CORS relay for the browser build.
 *   3. direct  — plain fetch (works only where CORS is permitted).
 * The native and relay transports carry only the public client_id — never a
 * secret — so the "no secret in the APK" guarantee (§3.2) is preserved.
 */

export type OAuthTransport = 'native' | 'relay' | 'direct';

interface NativeBridge {
  oauthPost?: (url: string, bodyJson: string) => string;
}

function bridge(): NativeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { GitofyAndroid?: NativeBridge }).GitofyAndroid;
}

export function activeTransport(): OAuthTransport {
  const b = bridge();
  if (b?.oauthPost) return 'native';
  if (AuthConfig.oauthRelayUrl) return 'relay';
  return 'direct';
}

export interface OAuthHttpResult {
  status: number;
  json: Record<string, unknown>;
}

function encodeForm(body: Record<string, string>): string {
  return Object.entries(body)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * POSTs a form-encoded body and always returns parsed JSON (we set
 * Accept: application/json so GitHub never answers with form-encoding, §5.2).
 */
export async function oauthFormPost(
  url: string,
  body: Record<string, string>,
  signal?: AbortSignal
): Promise<OAuthHttpResult> {
  const transport = activeTransport();

  if (transport === 'native') {
    const b = bridge();
    if (b?.oauthPost) {
      const raw = b.oauthPost(url, JSON.stringify(body));
      const parsed = JSON.parse(raw) as { status: number; body: string };
      return { status: parsed.status, json: safeJson(parsed.body) };
    }
  }

  let target = url;
  if (transport === 'relay') {
    const relay = AuthConfig.oauthRelayUrl.replace(/\/$/, '');
    target = relay + new URL(url).pathname;
  }

  const res = await fetch(target, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeForm(body),
    signal,
  });

  const text = await res.text();
  return { status: res.status, json: safeJson(text) };
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // GitHub sometimes returns form-encoded even with Accept: json.
    const out: Record<string, unknown> = {};
    for (const pair of text.split('&')) {
      const [k, v] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    }
    return out;
  }
}

export function transportLabel(): string {
  const t = activeTransport();
  if (t === 'native') return 'Native bridge (OkHttp-equivalent)';
  if (t === 'relay') return `CORS relay (${AuthConfig.oauthRelayUrl})`;
  return 'Direct fetch (CORS-dependent)';
}
