# Bundle integrity & in-app updates

Gitufy can tell when its own files have been modified (for example with a
file-manager/APK-editor such as MT Manager) and when a newer official release
exists, and it handles both with Material 3 popups.

## 1. Anti-tamper ("unofficial app") popup

At build time, `scripts/generate-integrity.mjs` walks the web bundle (`dist/`),
computes a SHA-256 for every file and writes `integrity.json`:

```json
{ "generatedAt": 0, "root": "<sha256>", "files": { "<path>": "<sha256>" } }
```

`root` is the SHA-256 of the newline-joined `path:sha256` lines, sorted by path.

CI then copies that `root` into `android/app/src/main/res/raw/integrity_root.txt`,
so the **native** layer carries an anchor the web layer cannot rewrite on its own.

At runtime, `src/security/integrity.ts` re-hashes every listed file, rebuilds the
root and compares it against **both** the manifest and the native anchor. Any
mismatch (or a missing file) marks the bundle as tampered and the app shows a
blocking **"This is an unofficial app — please download the original app"** sheet
with a Download button. Debug builds skip this check.

Because the anchor lives outside the hashed set, editing a JS/asset file *and*
updating `integrity.json` still fails the native-anchor comparison.

## 2. Update popup

On start, `src/security/updater.ts` reads the latest release of
`mdtt63729-ui/GITOFY` (with the user's token for a private repo, or anonymously
for a public one) and compares its version with the installed `versionName`. If
it is newer, the app shows a non-blocking **"A new version is ready"** sheet with
**Update** and **Later**.

## 3. In-app download & install

Both sheets download the release APK inside the app through the native bridge
(`GitofyAndroid.startDownload`), which streams the file to the cache directory and
reports progress back to the web layer via `gitofy-download` window events. The
sheet shows an M3 determinate progress bar with the percentage on the left, kept
in sync with the bar. When the download finishes, the bridge opens the system
installer for the downloaded APK (`GitofyAndroid.installApk`). Once the official
build is installed it passes the integrity check, so the unofficial popup no
longer appears.

If release metadata is unreachable (e.g. a private repo while signed out), the
Download button opens the releases page in a Custom Tab instead.

## CI wiring

Both workflows now, after `npm run build`:

1. write `dist/integrity.json`'s `root` into `res/raw/integrity_root.txt`;
2. run the secret-scan gate;
3. copy `dist/` into `android/app/src/main/assets/web/`.

## Warning sound

The unofficial-app popup uses the supplied danger design (ripples, red danger
rings, breathing glow, a shaking warning badge) and plays a cinematic warning
sound while it is visible: `src/security/dangerSound.ts` layers a deep sub
rumble, a two-tone klaxon, a piercing warbling alert, periodic impact hits, a
sweeping noise tension bed and a detuned metallic scrape, routed through a
generated convolution reverb and a compressor. The master level is capped so it
is powerful and unsettling without being deafening, and the sound stops as soon
as the popup goes away.

The Android WebView is configured with `mediaPlaybackRequiresUserGesture = false`,
so the sound starts on appearance; a one-time interaction listener retries if the
audio context is still suspended.
