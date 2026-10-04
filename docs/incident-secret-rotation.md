# Incident playbook — Web-flow client-secret rotation

The **primary Device Flow carries no secret**, so this playbook only applies if
you enabled the optional **Web Flow + PKCE** (PRD §6), which embeds a client
secret in the app.

## When to rotate

Rotate immediately if you suspect the secret leaked: a decompiled APK shows a
`client_secret`, a build log/CI variable was exposed, or a report suggests
impersonation.

## Steps

1. **Rotate on GitHub**: OAuth App → **Reset client secret**. Copy the new value.
2. **Update the CI secret** (`VITE_GITHUB_CLIENT_SECRET`) — never commit it.
3. **Ship a new release**: bump `versionCode`/`versionName`, build, and publish.
4. **Invalidate old builds**: the old secret no longer works, so older builds
   that still embed it cannot complete the web flow. Encourage users to update.
5. **Notify** affected users if you believe tokens/credentials were used.
6. **Prevent recurrence**: keep the web flow disabled unless strictly needed; prefer
   the device flow, which has no secret to leak.

## Guardrails already in place

- The secret is read only from `VITE_GITHUB_CLIENT_SECRET` at build time
  (`src/auth/config.ts`); it is never hard-coded.
- CI runs a **secret-scan gate** on the built bundle and fails the build if a
  `client_secret`/token pattern is found (`.github/workflows/android-ci.yml`).
- All logging redacts `client_secret`, `device_code`, `code_verifier` and tokens
  (`src/auth/authFetch.ts`).
