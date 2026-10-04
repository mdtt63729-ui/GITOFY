# Why the APK showed "Web page not available" — root cause and fixes

## Symptom
Opening the app shows an Android WebView error page:

    Web page not available
    The web page at https://appassets.androidplatform.net/web/index.html
    could not be loaded because: net::ERR_INVALID_RESPONSE

## Root cause (the real one)
The app loads its UI from a `WebView` at
`https://appassets.androidplatform.net/web/index.html`, served from the APK's
`assets/` folder by `WebViewAssetLoader` in `MainActivity.kt`.

`WebViewAssetLoader` maps a URL to a file like this:

1. it strips the **registered prefix** from the URL path, then
2. opens the **remainder relative to the assets root**.

The code registered the prefix `"/web/"`. So `/web/index.html` had `/web/`
stripped, leaving `index.html`, which was then opened as `assets/index.html`.
But the bundle actually lives at `assets/web/index.html`. The file was therefore
never found, the loader returned an empty response, and WebView showed
`net::ERR_INVALID_RESPONSE`.

(For reference, the AndroidX docs example registers `"/assets/"` and loads
`/assets/www/index.html`, which resolves to `assets/www/index.html` — the prefix
is dropped and the rest is asset-relative. A `"/web/"` prefix therefore does
**not** mean the `assets/web/` directory.)

## The fix
In `android/app/src/main/java/com/gitofy/app/MainActivity.kt` the path handler
was changed from `"/web/"` to `"/"`:

    val assetLoader = WebViewAssetLoader.Builder()
        .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
        .build()

Now `/web/index.html` resolves to `assets/web/index.html`, and every subresource
(`/web/assets/index-*.js`, `/web/assets/index-*.css`, `/web/assets/gitofy_icon-*.png`)
resolves correctly too. The load URL is unchanged.

## Other fixes bundled in this project
1. The built web UI is present inside `android/app/src/main/assets/web/`
   (index.html + assets + integrity.json), so the APK ships a real UI.
2. `android/app/build.gradle` no longer lets a missing `dist/` silently empty
   that folder: `copyWebAssets` only runs when `dist/` exists, and a new
   `verifyWebAssets` task fails the build if `assets/web/index.html` is absent.
3. `android/app/src/main/res/raw/integrity_root.txt` holds the matching bundle
   hash so the anti-tamper check passes on first launch.
4. Size: `src/assets/gitofy_icon.png` was 4096x4096 (2.39 MB) but the splash
   logo is only drawn at 54x54 px; it is now 512x512 (~165 KB).
5. `.github/workflows/release-apk.yml` stamps the version from the tag, deletes
   old `*.apk` assets from the release before uploading the new one, and
   publishes on both a tag push and a manual run.

## How to build
    npm install
    npm run build
    node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync('dist/integrity.json','utf8')).root;fs.writeFileSync('android/app/src/main/res/raw/integrity_root.txt', r);"
    rm -rf android/app/src/main/assets/web && mkdir -p android/app/src/main/assets/web
    cp -R dist/. android/app/src/main/assets/web/
    cd android && gradle assembleDebug

Or run the GitHub Actions workflow (`.github/workflows/release-apk.yml`), which
does all of the above and produces a signed APK. Because `assets/web/` is now
pre-populated, a plain Android Studio / Gradle build also works.
