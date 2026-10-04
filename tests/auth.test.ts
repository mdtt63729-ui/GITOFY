/**
 * Gitufy OAuth unit + integration tests (PRD v2.0 §15).
 * Run with:  npm test   (tsx tests/auth.test.ts)
 *
 * Covers: error taxonomy mapping, scope helpers, log redaction, the device-flow
 * poll decision table, the poll loop itself (with a stubbed transport), PKCE
 * generation/validation, and a "no secret in logs" gate.
 */
import assert from 'node:assert';

// The sandbox runs Node with a fetch implementation whose WASM parser cannot
// initialise; we stub the transport ourselves, so disable the built-in fetch
// (see package.json "test") and provide a minimal Headers when it is absent.
if (typeof (globalThis as unknown as { Headers?: unknown }).Headers === 'undefined') {
  class SimpleHeaders {
    private store: Record<string, string>;
    constructor(init?: Record<string, string>) {
      this.store = {};
      for (const [k, v] of Object.entries(init ?? {})) this.store[k.toLowerCase()] = v;
    }
    get(name: string): string | null {
      return this.store[name.toLowerCase()] ?? null;
    }
  }
  (globalThis as unknown as { Headers: unknown }).Headers = SimpleHeaders;
}
import { fromDeviceFlowError, classifyHttpStatus, makeError } from '../src/auth/errors';
import { parseScopesHeader, unionScopes, hasScope, scopesToString, BASE_SCOPES } from '../src/auth/scopes';
import { redact, containsSecret, assertNoSecrets } from '../src/auth/authFetch';
import { createWebSession, buildAuthorizeUrl, validateCallback } from '../src/auth/webPkce';
import { nextPollAction, GitHubDeviceFlowProvider, DeviceFlowCancelled } from '../src/auth/deviceFlow';
import { AuthConfig, isGitHubApp } from '../src/auth/config';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ok  ${name}`); })
    .catch((err) => { failed++; console.error(`FAIL  ${name}\n      ${err?.message ?? err}`); });
}

async function main() {
  console.log('error taxonomy');
  await test('expired_token -> E_CODE_EXPIRED', () => {
    assert.strictEqual(fromDeviceFlowError('expired_token').code, 'E_CODE_EXPIRED');
  });
  await test('access_denied -> E_DENIED', () => {
    assert.strictEqual(fromDeviceFlowError('access_denied').code, 'E_DENIED');
  });
  await test('device_flow_disabled -> E_CONFIG/DEVFLOW_DISABLED', () => {
    const e = fromDeviceFlowError('device_flow_disabled');
    assert.strictEqual(e.code, 'E_CONFIG');
    assert.strictEqual(e.diagnostic, 'DEVFLOW_DISABLED');
  });
  await test('HTTP 401 -> E_SESSION', () => {
    assert.strictEqual(classifyHttpStatus(401, new Headers())?.code, 'E_SESSION');
  });
  await test('HTTP 403 remaining 0 -> E_RATE', () => {
    const h = new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120) });
    assert.strictEqual(classifyHttpStatus(403, h)?.code, 'E_RATE');
  });
  await test('HTTP 403 otherwise -> E_ORG', () => {
    assert.strictEqual(classifyHttpStatus(403, new Headers())?.code, 'E_ORG');
  });
  await test('HTTP 404 -> E_SCOPE', () => {
    assert.strictEqual(classifyHttpStatus(404, new Headers())?.code, 'E_SCOPE');
  });
  await test('HTTP 200 -> null', () => {
    assert.strictEqual(classifyHttpStatus(200, new Headers()), null);
  });
  await test('diagnostics never contain a token', () => {
    const e = makeError('E_CONFIG');
    assert.ok(!containsSecret(e.diagnostic));
  });

  console.log('scopes');
  await test('parseScopesHeader splits and trims', () => {
    assert.deepStrictEqual(parseScopesHeader('repo, workflow ,delete_repo'), ['repo', 'workflow', 'delete_repo']);
  });
  await test('parseScopesHeader(null) -> []', () => {
    assert.deepStrictEqual(parseScopesHeader(null), []);
  });
  await test('hasScope checks all required', () => {
    assert.ok(hasScope(['repo', 'workflow'], ['repo', 'workflow']));
    assert.ok(!hasScope(['repo'], ['repo', 'workflow']));
  });
  await test('unionScopes dedups', () => {
    assert.deepStrictEqual(unionScopes(['repo'], ['repo', 'workflow']).sort(), ['repo', 'workflow']);
  });
  await test('BASE_SCOPES string is the minimal set', () => {
    assert.strictEqual(scopesToString(BASE_SCOPES), 'read:user repo');
  });

  console.log('log redaction');
  await test('redacts classic + fine-grained PATs and device codes', () => {
    const blob = `auth ghp_${'a'.repeat(36)} pat github_pat_${'b'.repeat(30)} device_code=abcdef123 code_verifier=zzz`;
    const clean = redact(blob);
    assert.ok(!clean.includes(`ghp_${'a'.repeat(36)}`));
    assert.ok(!clean.includes(`github_pat_${'b'.repeat(30)}`));
    assert.ok(clean.includes('***'));
  });
  await test('assertNoSecrets throws when a secret is present', () => {
    assert.throws(() => assertNoSecrets(`token=ghp_${'c'.repeat(36)}`));
    assert.doesNotThrow(() => assertNoSecrets('nothing sensitive here'));
  });

  console.log('device-flow decision table');
  await test('access_token -> token action', () => {
    assert.deepStrictEqual(nextPollAction({ access_token: 'x' }, 5), { kind: 'token', token: 'x' });
  });
  await test('authorization_pending -> continue', () => {
    assert.strictEqual(nextPollAction({ error: 'authorization_pending' }, 5).kind, 'continue');
  });
  await test('slow_down adds exactly 5 seconds', () => {
    const a = nextPollAction({ error: 'slow_down' }, 5);
    assert.deepStrictEqual(a, { kind: 'slow_down', interval: 10 });
  });
  await test('expired_token -> E_CODE_EXPIRED error', () => {
    const a = nextPollAction({ error: 'expired_token' }, 5);
    assert.strictEqual(a.kind, 'error');
    if (a.kind === 'error') assert.strictEqual(a.error.code, 'E_CODE_EXPIRED');
  });
  await test('incorrect_device_code -> E_CONFIG error', () => {
    const a = nextPollAction({ error: 'incorrect_device_code' }, 5);
    if (a.kind === 'error') assert.strictEqual(a.error.code, 'E_CONFIG');
    else throw new Error('expected error');
  });

  console.log('poll loop (stubbed transport)');
  await test('returns the token after pending then success', async () => {
    let calls = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls++;
      const body = calls === 1 ? { error: 'authorization_pending' } : { access_token: 'tok_123' };
      // Minimal fetch Response stub — avoids pulling in undici's WASM parser.
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify(body),
      } as unknown as Response;
    }) as typeof fetch;
    try {
      const provider = new GitHubDeviceFlowProvider();
      const token = await provider.pollForToken(
        { deviceCode: 'd', interval: 0.05, expiresAt: Date.now() + 5000 },
        {}
      );
      assert.strictEqual(token, 'tok_123');
      assert.ok(calls >= 2);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
  await test('expired code throws E_CODE_EXPIRED before polling', async () => {
    const provider = new GitHubDeviceFlowProvider();
    await assert.rejects(
      () => provider.pollForToken({ deviceCode: 'd', interval: 0.05, expiresAt: Date.now() - 1 }, {}),
      (e: unknown) => (e as { code?: string }).code === 'E_CODE_EXPIRED'
    );
  });
  await test('abort rejects with DeviceFlowCancelled', async () => {
    const provider = new GitHubDeviceFlowProvider();
    const controller = new AbortController();
    const p = provider.pollForToken(
      { deviceCode: 'd', interval: 5, expiresAt: Date.now() + 100000 },
      {},
      controller.signal
    );
    controller.abort();
    await assert.rejects(() => p, (e: unknown) => e instanceof DeviceFlowCancelled);
  });

  console.log('GitHub App handling');
  await test('client type is auto-detected from the Iv client-id prefix', () => {
    assert.strictEqual(AuthConfig.clientId, 'Iv23liLESLFaJa3yzCdE');
    assert.strictEqual(AuthConfig.clientType, 'github-app');
    assert.strictEqual(isGitHubApp(), true);
    assert.strictEqual(AuthConfig.appId, '5182766');
  });
  await test('device-code request omits `scope` for a GitHub App', async () => {
    const orig = globalThis.fetch;
    let captured = '';
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      captured = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            device_code: 'd',
            user_code: 'WDJB-MJHT',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          }),
      } as unknown as Response;
    }) as typeof fetch;
    try {
      const provider = new GitHubDeviceFlowProvider();
      const res = await provider.requestDeviceCode('repo read:user');
      assert.ok(!captured.includes('scope='), `scope must be omitted, got: ${captured}`);
      assert.ok(captured.includes('client_id=Iv23liLESLFaJa3yzCdE'));
      assert.strictEqual(res.userCode, 'WDJB-MJHT');
    } finally {
      globalThis.fetch = orig;
    }
  });

  console.log('PKCE (web flow)');
  await test('verifier is 43-128 chars; state carries >=128 bits', async () => {
    const s = await createWebSession('read:user repo');
    assert.ok(s.codeVerifier.length >= 43 && s.codeVerifier.length <= 128, `verifier len ${s.codeVerifier.length}`);
    // 16 random bytes -> 22 base64url chars -> 132 bits.
    assert.ok(s.state.length >= 22, `state len ${s.state.length}`);
  });
  await test('authorize URL uses S256 + carries state', async () => {
    const s = await createWebSession('read:user');
    const url = await buildAuthorizeUrl(s);
    assert.ok(url.includes('code_challenge_method=S256'));
    assert.ok(url.includes(`state=${s.state}`));
    assert.ok(url.includes('code_challenge='));
  });
  await test('validateCallback accepts a matching state', async () => {
    const s = await createWebSession('read:user');
    const res = validateCallback(`gitufy://oauth/callback?code=abc&state=${s.state}`, s);
    assert.strictEqual(res.code, 'abc');
  });
  await test('validateCallback rejects a mismatched state', async () => {
    const s = await createWebSession('read:user');
    assert.throws(() => validateCallback('gitufy://oauth/callback?code=abc&state=wrong', s));
  });
  await test('validateCallback rejects a stale (>10 min) session', async () => {
    const s = await createWebSession('read:user');
    const stale = { ...s, createdAt: Date.now() - 11 * 60 * 1000 };
    assert.throws(() => validateCallback(`gitufy://oauth/callback?code=abc&state=${s.state}`, stale), (e: unknown) => (e as { code?: string }).code === 'E_SESSION');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
