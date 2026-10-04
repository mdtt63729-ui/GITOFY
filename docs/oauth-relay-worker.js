/**
 * Gitufy OAuth CORS relay (optional).
 *
 * A stateless Cloudflare Worker that forwards ONLY GitHub's two device-flow
 * endpoints and attaches CORS headers, so the browser build can run the device
 * flow without a client secret. The Android app uses the native transport
 * instead and does not need this.
 *
 * Deploy:
 *   npx wrangler deploy docs/oauth-relay-worker.js --name gitufy-oauth-relay \
 *     --var ALLOWED_ORIGINS:"https://your.app,http://localhost:3000"
 *
 * Then set VITE_OAUTH_RELAY_URL to the worker URL.
 */
export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, accept',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(request.url);
    const allowedPaths = ['/login/device/code', '/login/oauth/access_token'];
    if (request.method !== 'POST' || !allowedPaths.includes(pathname)) {
      return new Response('forbidden', { status: 403, headers: cors });
    }
    if (!allowed.includes(origin)) return new Response('origin not allowed', { status: 403, headers: cors });

    const upstream = await fetch('https://github.com' + pathname, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: await request.text(),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
