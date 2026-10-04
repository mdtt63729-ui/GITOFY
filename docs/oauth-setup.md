# Gitufy — GitHub OAuth setup (PRD v2.0)

Gitufy signs users in with GitHub's **OAuth Device Flow** as the primary path.
The device flow needs **no client secret**, so nothing sensitive ships inside the
APK (PRD §3).

## 1. The app registration

Gitufy works with either a **GitHub App** (what this repo is configured for) or a
classic **OAuth App**. The registered values are:

| Field | Value |
| :--- | :--- |
| Client ID | `Iv23liLESLFaJa3yzCdE` |
| App ID | `5182766` |
| Owner | `@mdtt63729-ui` |
| Homepage URL | `https://github.com/mdtt63729-ui/GITOFY` |
| Authorization callback URL | `gitofy://callback` |

Create/edit it under **GitHub → Settings → Developer settings**:

- **GitHub App** → *GitHub Apps → New GitHub App* (or edit the existing one).
- **OAuth App** → *OAuth Apps → New OAuth App*.

Copy the **Client ID** (public, not a secret).

> **GitHub App vs OAuth App.** The device flow works with both, with one
difference: GitHub Apps use **fine-grained app permissions** instead of OAuth
`scope`s, and they do **not** return an `X-OAuth-Scopes` header. Gitufy detects a
GitHub App from the `Iv…` client-id prefix, omits the `scope` parameter for it,
and does not hard-gate features on scopes it cannot see (the app's own permissions
govern access). With an OAuth App, the §4 scope map applies as written.

## 2. Enable the Device Flow

- **GitHub App**: open the app → *Optional features* → tick **Device flow**, save.
- **OAuth App**: open the app → tick **Enable Device Flow**, save.

If you skip this, GitHub returns `device_flow_disabled` and Gitufy shows a
developer-configuration error with a PAT fallback (PRD §5.3).

## 3. Configure the client id

The client id and app id are already baked into `src/auth/config.ts` as defaults.
Override them if needed, two ways:

- **Build time** — set `VITE_GITHUB_CLIENT_ID` / `VITE_GITHUB_APP_ID` (see `.env.example`). Vite bakes them into the bundle.
- **Runtime** — define `window.GITUFY_CONFIG = { clientId: "..." }` before the bundle loads (handy for self-hosted builds).

> The client id is public and may live in the repo/CI variables. A **client
> secret must never be committed** (see `incident-secret-rotation.md`).

## 4. The two device-flow endpoints and CORS

GitHub's `github.com/login/device/code` and `github.com/login/oauth/access_token`
send **no CORS headers**, so a browser `fetch` is blocked. Gitufy resolves this
with a transport preference order (`src/auth/oauthHttp.ts`):

1. **native** — the Android WebView bridge (`GitofyAndroid.oauthPost`) performs the
   HTTPS call. No CORS applies. This is what the shipped app uses.
2. **relay** — a stateless CORS relay for the browser build. Set
   `VITE_OAUTH_RELAY_URL` to its base URL. A ready-to-deploy Cloudflare Worker is
   in `docs/oauth-relay-worker.js`.
3. **direct** — plain `fetch` (works only where CORS is permitted).

Only the public `client_id` ever travels over any of these.

## 5. Optional Web Flow + PKCE

Off by default. To enable: set `VITE_ENABLE_WEB_FLOW=true` **and** inject a client
secret at build time (`VITE_GITHUB_CLIENT_SECRET`, CI secret only). Read the
mandatory risk notice in the app (Settings → Advanced) and
`incident-secret-rotation.md` first.

## 6. Verify

```
npm run lint    # type-check
npm test        # auth unit + integration tests
npm run build   # production bundle
```
