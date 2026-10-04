# Gitufy

Fast Android GitHub client (React + TypeScript in a hardened WebView shell) with
Smart Diff, ZIP push, Material 3 UI, and GitHub Actions workflows.

This repository also implements the **GitHub OAuth 2.0 login & session system**
described in `Gitufy_GitHub_OAuth_PRD_v2.md`.

## Running locally

```bash
npm install
npm run dev        # dev server (tsx server.ts)
npm run lint       # tsc --noEmit type-check
npm test           # auth unit + integration tests
npm run build      # production bundle (vite build)
```

The Gitufy GitHub App (client id `Iv23liLESLFaJa3yzCdE`, app id `5182766`) is
pre-configured in `src/auth/config.ts`. Override via `VITE_GITHUB_CLIENT_ID` /
`window.GITUFY_CONFIG` if needed. Full setup: **`docs/oauth-setup.md`**.

## OAuth implementation (PRD v2.0)

Primary flow is the **Device Flow** — no client secret ever ships in the app.

| PRD area | Where |
| :--- | :--- |
| Sealed auth state machine, accounts, scopes | `src/auth/types.ts`, `src/auth/sessionManager.ts` |
| Device Flow provider (pending/slow_down/backoff/resume) | `src/auth/deviceFlow.ts` |
| Optional Web + PKCE flow | `src/auth/webPkce.ts` |
| Token/session orchestration + profile/scope fetch | `src/auth/authRepository.ts` |
| Encrypted storage (Web Crypto AES-GCM + IndexedDB) | `src/auth/crypto.ts`, `src/auth/secureStore.ts`, `src/auth/tokenRepository.ts` |
| 401/403 AuthInterceptor + log redaction | `src/auth/authFetch.ts` |
| CORS-free transport (native → relay → direct) | `src/auth/oauthHttp.ts` |
| Login UX (Idle → Code screen → Success/Failed) | `src/screens/login/` |
| Permissions / Accounts / Diagnostics / App lock | `src/screens/PermissionsScreen.tsx`, `AccountSwitcherSheet.tsx`, `LoginDiagnosticsScreen.tsx`, `AppLockScreen.tsx` |
| Bengali + English strings | `src/i18n/strings.ts` |
| Native bridge (Custom Tabs, clipboard, FLAG_SECURE, biometric, OAuth POST, deep link) | `android/app/src/main/java/com/gitofy/app/MainActivity.kt` |
| Tests | `tests/auth.test.ts` |
| Docs | `docs/oauth-setup.md`, `docs/security.md`, `docs/privacy.md`, `docs/incident-secret-rotation.md`, `docs/oauth-relay-worker.js` |

### Why a native transport for the device flow

GitHub's `github.com/login/device/code` and `/login/oauth/access_token` send no
CORS headers, so a browser fetch is blocked. The app therefore performs those two
calls through the Android bridge (`GitofyAndroid.oauthPost`), which needs no CORS
and carries only the public client id. A browser build can use the optional
stateless CORS relay instead. See `docs/oauth-setup.md` §4.
