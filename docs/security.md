# Gitufy auth — security notes (PRD v2.0 §7, §10)

## Token storage

- Tokens live in an **encrypted IndexedDB store** (`src/auth/secureStore.ts`).
  Values are AES-256-GCM encrypted with a **non-extractable** Web Crypto key
  persisted in IndexedDB (`src/auth/crypto.ts`). If the engine cannot store a
  `CryptoKey`, it falls back to a JWK-stored key and reports the reduced guarantee
  on the diagnostics screen.
- The token is **never** written to `localStorage`. `ThemeContext` strips
  `personalAccessToken` before persisting settings, and also deletes any legacy
  plaintext token left by older builds.
- `android:allowBackup="false"` is set, so nothing rides along in a cloud backup.
- The token is held in memory only while the app runs; logout destroys both the
  account records and the master key, making any residual ciphertext unreadable.

## Transport

- HTTPS only. The device-flow HTTP is performed either natively (no CORS) or via a
  CORS relay; only the public `client_id` is sent.
- The AuthInterceptor (`src/auth/authFetch.ts`) classifies `401/403/404` into a
  single session/org/scope/rate signal and redacts secrets from anything loggable.

## Browser

- OAuth pages open in **Chrome Custom Tabs / the system browser** — never a WebView.
- The Web+PKCE callback uses `gitofy://callback`, validated with an exact
  `state` match, single-use semantics and a 10-minute timeout.

## App lock & privacy

- Optional biometric/device-PIN lock via the native bridge (`FLAG_SECURE` hides the
  Recents preview). Five failures fall back to the device credential; account data
  is never wiped by a failed unlock.
- Crash/analytics are PII-free; the funnel is anonymous and opt-in.

## Secret-scan gate

CI decompiles-scans the built bundle for `client_secret`/token patterns and fails
the build on a hit (`.github/workflows/android-ci.yml`).
