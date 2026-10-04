# Release signing (GitHub website + GitHub Actions only)

Everything happens on GitHub — you do **not** need a JDK, Android SDK, Gradle,
keytool, OpenSSL or any Termux package on your own device.

## Audit result (this project)

- Android module: **`app`** (root: `android/`), applicationId `com.gitofy.app`.
- Release task: **`assembleRelease`**.
- Existing keystore: **none** — a new signing system was created; no existing
  signing identity was replaced.
- `android/app/build.gradle` reads signing values from a temporary
  `signing.properties` file that CI writes from the secrets. There are **no
  hard-coded** `storeFile` / `storePassword` / `keyAlias` / `keyPassword` values.

## One-time setup — automatic

1. Create a token that may manage repository secrets:
   - **Fine-grained PAT** (recommended): github.com → Settings → Developer
     settings → Personal access tokens → Fine-grained tokens → *Generate new
     token*. Repository access: **only this repository**. Repository
     permissions → **Secrets: Read and write**.
   - **Classic PAT** alternative: scope **`repo`** (for a private repository).
2. Add it as a repository secret named **`GH_SECRETS_PAT`**
   (Settings → Secrets and variables → Actions → New repository secret).
3. Repo → **Actions** → **Bootstrap signing secrets** → **Run workflow**.

That run generates the keystore in the runner and then creates the four signing
secrets **automatically**:

```
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

It also uploads a **`gitofy-signing-backup`** artifact (the keystore file plus a
text file with the values). Download it and keep it somewhere safe — you need the
keystore forever, because every future release must be signed with the same key.
Then **delete the artifact**.

### The signing identity is permanent

- The four repository secrets **persist until you delete them** — they do not
  expire, and every future release build is signed with the same key.
- Re-running this workflow does **not** rotate anything: if
  `ANDROID_KEYSTORE_BASE64` already exists it stops with
  `✅ A signing keystore already exists in this repository. The signing identity is
  permanent — nothing to do.`
- To deliberately rotate (only if you accept that installed apps will stop
  receiving updates), run it again with the **force** input set to `true`.
- The keystore itself is valid for **10000 days** (~27 years).

> Why the `GH_SECRETS_PAT` step exists: GitHub does not allow the built-in
> `GITHUB_TOKEN` to write repository secrets. A token with secret-write access
> must therefore be supplied once. It is stored as a secret and is never placed
> in the code.

### If you skip `GH_SECRETS_PAT`

The same workflow still runs: it generates the keystore and uploads the backup
artifact, but prints instructions instead of provisioning. In that case add the
four secrets by hand from the artifact.

## Build a signed release

- **By tag:** bump `versionName`/`versionCode` in `android/app/build.gradle`, then
  ```
  git tag v1.0.1
  git push origin v1.0.1
  ```
- **Manually:** repo → **Actions** → **Build Signed Release APK** → **Run workflow**.

The **Build Signed Release APK** workflow (`release-apk.yml`):

1. validates that all four signing secrets exist (otherwise it stops with
   `❌ Android release signing secrets are incomplete.` and lists what is missing);
2. restores the keystore to `$RUNNER_TEMP/signing/release.jks` (chmod 600) and
   writes `$RUNNER_TEMP/signing/signing.properties` from the secrets — never into
   the repo;
3. builds the web bundle, writes the integrity anchor and runs the tests;
4. runs `gradle assembleRelease` with `SIGNING_PROPERTIES_FILE` pointing at that
   file (the project has no Gradle wrapper JAR, so the `gradle` binary is used
   instead of `./gradlew`);
5. **verifies** the APK exists, is non-empty and carries a signing certificate
   (`apksigner verify`); any signing problem fails with
   `BUILD FAILED — SIGNING CONFIGURATION ERROR`;
6. uploads the APK as an artifact and, on a tag, attaches
   `GITOFY-v<version>-release.apk` to the GitHub Release.

## Failure diagnostics

| Symptom | Meaning |
| :--- | :--- |
| `❌ Android release signing secrets are incomplete.` | one or more of the four secrets is missing |
| `BUILD FAILED — SIGNING CONFIGURATION ERROR: the APK is not signed.` | the keystore/passwords did not apply |
| `apksigner not found` | the runner's Android SDK build-tools were unavailable |
| `gh: Not Found` / `Resource not accessible` in Bootstrap | `GH_SECRETS_PAT` lacks secret-write permission |
| `A signing keystore already exists … nothing to do` | the permanent identity is already in place (expected) |

## Security notes

- The keystore, alias and passwords are **never** stored in the repository;
  `.gitignore` excludes `*.jks`, `*.keystore`, `keystore.properties` and
  `signing.properties`.
- The workflows never echo a password (values are masked).
- Signing credentials are **separate** from the GitHub OAuth app credentials
  (client id / secret); do not mix them.
- If you ever want to sign by hand, download the APK and use `apksigner` (not
  `jarsigner` — Android 11+ rejects v1-only signatures for `targetSdk 34`).
