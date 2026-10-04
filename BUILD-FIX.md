# Why the APK showed "Web page not available" — and what was fixed

## Symptom
Opening the app showed an Android WebView error page:

    Web page not available
    The web page at https://appassets.androidplatform.net/web/index.html
    could not be loaded because: net::ERR_INVALID_RESPONSE

## Cause
The app is a native Android shell (`MainActivity.kt`) that loads its UI from the
WebView at `https://appassets.androidplatform.net/web/index.html`, served by
`WebViewAssetLoader` out of `android/app/src/main/assets/web/`.

That folder was **empty**. The web bundle is only produced by the JavaScript
build (`npm run build` -> `dist/`) and then copied into `assets/web/`. When the
APK was assembled without running the JS build first, the Gradle task
`copyWebAssets` (a `Sync`) had no `dist/` to copy from and **wiped the
destination folder**, leaving the APK with no `index.html`. The WebView then
requested a file that did not exist and returned `ERR_INVALID_RESPONSE`.

## What was changed
1. The web bundle is now built and committed into
   `android/app/src/main/assets/web/` (index.html + assets + integrity.json),
   so the APK contains a real UI.
2. `android/app/src/main/res/raw/integrity_root.txt` is set to the matching
   bundle hash so the anti-tamper check passes on first launch.
3. `android/app/build.gradle` no longer lets a missing `dist/` silently empty
   the assets:
   - `copyWebAssets` only runs when `dist/` exists, and
   - a new `verifyWebAssets` task fails the build with a clear message if
     `assets/web/index.html` is absent.
4. Size: `src/assets/gitofy_icon.png` was a 4096x4096 image (2.39 MB) but the
   splash logo is only ever drawn at 54x54 px (`.splash-logo-mark`). It is now
   512x512 (about 165 KB), which is visually identical at that size and shrinks
   both the web bundle and the APK. The launcher icon
   (`res/drawable-nodpi/gitofy_icon.png`) is untouched. Restore the original
   4096x4096 file if you need it for something else.

## How to build a working APK

From the project root:

    npm install
    npm run build                     # writes dist/ and dist/integrity.json
    node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync('dist/integrity.json','utf8')).root;fs.writeFileSync('android/app/src/main/res/raw/integrity_root.txt', r);"
    rm -rf android/app/src/main/assets/web && mkdir -p android/app/src/main/assets/web
    cp -R dist/. android/app/src/main/assets/web/
    cd android && gradle assembleDebug

Or just run the included GitHub Actions workflow
(`.github/workflows/release-apk.yml`), which performs all of the above
automatically and produces a signed APK.

Because `assets/web/` is now pre-populated, a plain Android Studio / Gradle
build will also work even without running the JS build first.

## Native Android
This is already a native Android application (Kotlin `AppCompatActivity` with a
JS bridge, Custom Tabs for OAuth, biometrics, FileProvider, signed APK, launcher
icon). It installs and runs like any other native app. The UI inside is rendered
by a hardened WebView rather than Jetpack Compose.

## Offline
The UI bundle ships inside the APK, so the app now opens and shows its interface
with no internet connection. GitHub operations (login, repos, diffs, push,
Actions) still require a connection, because they call the GitHub API. There is
in-app handling for the offline state (e.g. the login screen shows
"Offline — we will continue when you are back online").

## Release workflow fix (release publishing)

`.github/workflows/release-apk.yml` was also fixed so a new release carries the
new signed APK instead of getting stuck with an old one:

- The version is stamped into `android/app/build.gradle` from the tag
  (v1.2.3 -> versionName "1.2.3", versionCode = run number). Previously
  versionName was hard-coded "1.0.0", so every APK was named
  `GITOFY-v1.0.0-release.apk` and the installed app kept reporting 1.0.0.
- Old `*.apk` assets are deleted from the release before the new APK is
  uploaded, so the release ends up with exactly one APK — the newest signed one.
- The release is created/updated for both a `v*` tag push and a manual
  "Run workflow"; `overwrite_files: true` is set explicitly.

Reminder: this workflow needs the four signing secrets
(ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS,
ANDROID_KEY_PASSWORD). Run the "Bootstrap signing secrets" workflow once to
create them, or the release job exits at its first step and no APK is published.
