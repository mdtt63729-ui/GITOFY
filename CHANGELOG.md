# Changelog

## Unreleased

### Added
- Bundle-integrity (anti-tamper) system: `scripts/generate-integrity.mjs` emits a
  signed-by-anchor `integrity.json`, the CI writes its root into
  `res/raw/integrity_root.txt`, and `src/security/integrity.ts` verifies the
  bundle at runtime. A modified/repackaged app shows a blocking
  "This is an unofficial app" popup.
- In-app update system: `src/security/updater.ts` reads the latest GitHub release
  of the app's own repo and shows an M3 "A new version is ready" popup with
  Update/Later; the APK downloads and installs inside the app with an M3 progress
  bar + percentage.
- Native bridge additions: `getExpectedIntegrityRoot`, `getAppVersion`,
  `getAppVersionCode`, `isDebugBuild`, `getApkDigest`, `startDownload`
  (streamed with progress), `installApk`.
- Material 3 `SecuritySheet` (slide-up, full-width, lower-half sheet with a
  blurred, non-interactive scrim).
- Security tests (`tests/security.test.ts`) and `docs/security-integrity.md`.
- Unofficial-app (danger) popup rebuilt from the supplied M3 danger reference:
  expanding ripples, red danger rings, breathing glow, a shaking warning badge,
  a "Security risk detected" chip and a "Download Official App" button.
- Cinematic multi-layer danger sound (`src/security/dangerSound.ts`) that starts
  with the warning popup: sub rumble, two-tone klaxon, piercing alert, impact
  hits, sweeping tension bed and a detuned metallic scrape, through a generated
  convolution reverb and a compressor (master level capped).
- Update popup now shows the fetched release version and the fetched APK file
  name from the latest release.
- The two security sheets now use the exact fixed palettes from the supplied
  reference screens (dark M3 surfaces, lavender gradient primary pill, outlined
  secondary pill, red danger accents) so they look like the originals rather than
  following the app theme.
- The signing identity is permanent: the bootstrap workflow refuses to overwrite
  an existing keystore unless the `force` input is set, and the keystore backup
  artifact is retained for 90 days (keystore validity 10000 days).
- Release workflow renamed to `release-apk.yml` and signing now flows through a
  temporary `signing.properties` file (`SIGNING_PROPERTIES_FILE`), matching the
  supplied spec. `android/gradlew` has no wrapper JAR, so the CI uses the `gradle`
  binary from `gradle/actions/setup-gradle`.
- `bootstrap-signing.yml`: generates the release keystore in Actions and, when
  the `GH_SECRETS_PAT` secret is present, creates the four signing secrets in the
  repository automatically via `gh secret set` (falls back to manual instructions
  otherwise). Uploads a keystore backup artifact.
- GitHub-website-only release signing: `release.yml` validates the four signing
  secrets, restores the keystore from `ANDROID_KEYSTORE_BASE64` to a temp path,
  builds `assembleRelease`, verifies the APK is signed, and attaches
  `GITOFY-v<version>-release.apk` to the Release. `generate-keystore.yml` creates
  the keystore once inside Actions (no local installs). Gradle signing is fully
  environment-driven. See `docs/signing.md`.

### Added
- GitHub OAuth 2.0 login & session system (PRD v2.0): Device Flow (primary, no
  client secret), optional Web + PKCE flow, PAT fallback.
- Encrypted token storage (Web Crypto AES-256-GCM key in IndexedDB); the token is
  never written to `localStorage`.
- Sealed auth state machine, central 401/403 interceptor, session-expired
  handling, multi-account switcher, just-in-time scope escalation.
- Material 3 login UX (idle → code screen → success/failed) with a Google-style
  in-app account chooser, QR, countdown ring, and Bengali + English strings.
- Permissions, Login diagnostics and App-lock screens.
- Native bridge additions: Custom Tabs, sensitive-flagged clipboard, FLAG_SECURE,
  biometric unlock, the CORS-free OAuth POST transport, and the OAuth deep link.
- Auth unit + integration tests (31) and a CI secret-scan gate.
- `scripts/check-kotlin-comments.mjs` — a CI guard that fails the build on nested
  or unbalanced Kotlin block comments.

### Fixed
- **CI build failure** (`:app:compileReleaseKotlin`): a documentation comment in
  `MainActivity.kt` contained `github.com/login/*`. Because Kotlin block comments
  nest, the `/*` opened a nested comment that swallowed the bridge functions
  below it, producing `Expecting member declaration` /
  `Modifier 'override' is not applicable to 'top level function'` /
  `Unresolved reference: webView`. The comment now reads `github.com/login/... `.
- Pre-existing TypeScript errors (strict `BufferSource`/`BlobPart` typing and a
  `View` union narrowing in `RepoCodeScreen.tsx`).
