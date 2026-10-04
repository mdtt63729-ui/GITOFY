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

## Additional fixes (this revision)

1. **Splash delay** — `src/App.tsx` showed the in-app splash for a fixed 1150 ms
   after the native splash, so the home screen felt very slow to appear. It now
   shows for a short 320 ms and hands over as soon as the session is ready.

2. **Workflow run steps** — in `src/screens/WorkflowsScreen.tsx` the run cards
   had no click handler, so tapping a completed / running / failed run did
   nothing. Each run card now opens `WorkflowRunDetailScreen` for that run
   (jobs + steps + live logs). The "Logs on GitHub" link still works.

3. **Build logs** — `fetchJobLogs` (`src/git/githubApi.ts`) fetched the job-log
   endpoint with a browser `fetch`. That endpoint 302-redirects to a storage host
   that sends no CORS headers, so the fetch was blocked inside the WebView and no
   log ever appeared. It now fetches through a new native bridge method
   `GitofyAndroid.githubGetText` (`MainActivity.kt`), which follows the redirect
   without CORS (and does not forward the Authorization header to the signed URL).
   Falls back to `fetch` when the bridge is unavailable.

4. **Upload into an empty repository** — GitHub returns
   `409 Conflict — "Git Repository is empty."` for every Git-database call
   (blobs / trees / commits / refs) until the repo has a first commit, which made
   the upload fail on a brand-new repo. `src/git/gitUploadEngine.ts` now detects
   this and initializes the repository first via `PUT /contents/README.md`
   (creating the initial commit and branch), then uploads normally. The
   placeholder file is not part of the final tree, so the repo ends up containing
   only the uploaded project.

## Fullscreen, scroll and filter-chip animation (this revision)

1. **True fullscreen / edge-to-edge** — the WebView `<meta viewport>` had no
   `viewport-fit=cover`, so on phones with a display cutout (notch / punch-hole)
   the layout was inset and the app looked like it was not fullscreen. Added
   `viewport-fit=cover`. `MainActivity.kt` now also re-applies immersive mode in
   `onWindowFocusChanged`, because Android re-shows the status/navigation bars
   after dialogs or the keyboard.

2. **Scroll animation** — the Home large app bar now collapses smoothly while
   you scroll down (padding shrinks, the subtitle fades/collapses, the wordmark
   scales down) and expands again when you scroll back to the top
   (`.gitofy-appbar` / `.gitofy-appbar-compact` in `index.css`, driven by
   `headerCompact` in `HomeScreen.tsx`). The bottom nav still hides/reveals on
   scroll as before.

3. **Filter chips (All / Private / Public / Pinned)** — they had only an instant
   background swap. Now a single pill (`.filter-chip-indicator`) slides and
   resizes between the chips with a springy animation, and the press animation is
   stronger (`M3Chip` `showSelectedBackground={false}` + a bouncier scale).

4. **Safe areas** — the Home header and the floating bottom nav now respect
   `env(safe-area-inset-top/bottom)` so nothing sits under the cutout or the
   gesture bar.

## Repository list, cards and FAB (this revision)

1. **Private / Public icons** — each repository box already showed a visibility
   badge next to the name; the Public icon is now a proper globe (circle + equator
   + meridian) and Private keeps the padlock, matching GitHub.

2. **Scroll animation for the repository boxes** — each `.repo-card` now fades and
   slides up as it scrolls into view (IntersectionObserver, `repo-card-revealed`).

3. **FAB menu fixed** — the quick-action FAB was only shown *after* you scrolled
   down (`visible={isFabVisible || repos.length <= 2}`), so at the top of the list
   it sat off-screen and tapping it did nothing. It is now always visible on the
   home screen. Its open/close animation also used `transition-all` (which makes
   the WebView animate every property, including expensive ones); it now
   transitions only `transform` / `opacity` / colours, which removes the lag. The
   FAB and the bottom nav also respect the safe-area inset.

## Splash, onboarding, animation and scroll (this revision)

1. **Black splash, no flash** — the in-app splash is now black (`#000`) and the
   native splash theme (`values/styles.xml`, `values-v31/styles.xml`) is black
   too, so native -> web splash is seamless. The splash now has an `exiting`
   phase: it fades out over 400ms into the app instead of cutting over, so there
   is no white flash between splash and the next screen.

2. **Proper onboarding** — `OnboardingScreen` was redesigned as a real 5-page
   carousel (one page per page-indicator dot) with: an animated page track you
   can swipe, an animated dot indicator, a **Skip** button top-right, a
   **Continue / Get Started** button, and tap-to-jump dots. It never
   auto-advances — the user always drives it. It is now wired into `App.tsx` and
   shown on first run only; finishing or skipping it writes
   `gitofy.onboarded` to localStorage, so it is not shown again (and it is not
   skipped before the user actually completes it).

3. **Smooth, no-flash transitions** — page changes keep the fluid
   `PageTransition`; the splash hands over with a fade. Nothing hard-cuts.

4. **Scroll getting stuck at the bottom / can't scroll back up** — the FAB
   container was a `fixed` box with `pointer-events-auto` that was sized to the
   full (closed) menu stack, so it covered a large region at the bottom-right
   and swallowed the touch, which stopped the list from scrolling when a drag
   started there. The container is now `pointer-events-none`, with
   `pointer-events-auto` only on the FAB button and on the menu items when open.
   A safety net also guarantees repository cards can never stay hidden.

## Never open GitHub in-app + native feel (this revision)

1. **Nothing external opens inside the app.** `MainActivity.kt` now overrides
   `shouldOverrideUrlLoading` (both overloads): any navigation whose host is not
   the local `appassets.androidplatform.net` host is sent to the system browser
   (Chrome Custom Tab) and blocked inside the WebView. So GitHub — repo pages,
   release pages, token pages, run pages — always opens in the browser, never
   inside Gitofy. On the web side a new `openExternal()` helper
   (`src/utils/external.ts`) routes the `window.open(...)` calls (repo, commit,
   run, releases page, OAuth verification URL) through the native Custom Tab too.

2. **Native feel** — the WebView no longer looks like a web page:
   - `settings.textZoom = 100` stops WebView "text autosizing", which otherwise
     rescales text and is the biggest give-away of a web app.
   - Global CSS removes the blue tap highlight, long-press callout, image drag
     ghost, double-tap zoom, focus outlines and every scrollbar; overscroll is
     disabled so there is no browser-style bounce. Text selection is kept only
     where it is useful (code, logs, inputs) via `.select-text`.

## Onboarding pages + smooth page change (this revision)

- All five onboarding pages now share the same rich layout as the first: an
  accent-tinted icon badge, title, body and a short list of feature bullets.
- The page change is smoother: the track uses a GPU-accelerated
  `translate3d(...)` with a softer spring curve, and each page cross-fades and
  slides (opacity + transform only — no blur, which is expensive in the WebView),
  so switching pages never flashes. The per-page accent glow also transitions.

## Login robustness (this revision)

- Tapping "Log in with Google" now starts the GitHub device login directly when
  there is no previously signed-in account, instead of opening an account
  chooser that would only contain "Use another account".
- Picking a stored account no longer fails silently: if the saved session cannot
  be restored it falls back to a fresh GitHub login.

## "Choose an account" now lists the device's Google accounts

- The Android app now exposes `GitofyAndroid.getGoogleAccounts()`, which lists the
  Google accounts present on the device (AccountManager, `com.google`), and the
  manifest requests `GET_ACCOUNTS` for exactly this.
- The "Choose an account" sheet is populated with those Google accounts (with the
  Google mark), plus any previously signed-in GitHub accounts, plus "Use another
  account" — so it opens like Google's own account picker instead of showing only
  "Use another account".
- Picking an account continues into the GitHub sign-in. Note: a Google account
  cannot authorise GitHub from a third-party app — GitHub's own "Sign in with
  Google" runs on GitHub's page — so the GitHub step opens in the browser.

## GitHub OAuth client id is configurable (this revision)

- The login always uses a GitHub OAuth client id — no Google OAuth is involved
  anywhere.
- Settings now has a "GitHub OAuth Client ID" field. Leave it empty to use the
  built-in client id, or paste your own GitHub OAuth App (`Ov23li…`) or GitHub
  App (`Iv23li…`) client id; it is stored and the app reloads to apply it.

## Device-flow login fix + label changes (this revision)

1. **GitHub device flow fixed (DEVFLOW_network_error).** The native OAuth call
   (`GitofyAndroid.oauthPost`) ran the HTTPS request on whatever thread the
   JavaScript interface was dispatched on. On devices that dispatch it on the UI
   thread, the call throws `NetworkOnMainThreadException`, which surfaced as
   `DEVFLOW_network_error` and broke the login. It now runs the request on a
   worker thread and waits (`runBlockingNetwork`), with a log line on failure.
   The job-logs bridge (`githubGetText`) is wrapped the same way.

2. **Labels** — "Log in with Google" is now **"Sign in with OTP"**, and "Use
   another account" is now **"Log in to your account"**. The Google logo is
   removed from the login button and from the account chooser rows.

## Calculating screen redesign + smooth open/close everywhere (this revision)

- The "Calculating" screen (shown after you pick a ZIP) was redesigned as a
  premium Material 3 page: a large M3 progress ring with two pulsing halos and a
  centred icon, the live status in a pill, an animated 5-step pipeline stepper
  (Reading archive -> Extracting files -> Indexing & hashing -> Comparing with
  GitHub -> Ready) that fills in as the real work progresses, an indeterminate
  M3 linear progress bar, animated count-up stat cards, and a Cancel button. Every
  block enters with a staggered spring animation (`.calc-in`).
- The analysis now reports finer statuses so the stepper advances smoothly.
- Dialog and bottom sheet now animate on CLOSE as well as open: `M3Dialog` and
  `M3BottomSheet` stay mounted briefly while they animate out (`dialog-out` /
  `sheet-out`, with a matching scrim fade), instead of disappearing instantly.

## Update popup + unofficial-app detection (this revision)

1. **Update popup.** The in-app update check now also re-runs whenever the app
   returns to the foreground, so a newly published APK is noticed without
   restarting. It also fires when the SAME release's APK asset was replaced (a
   re-uploaded build), not only when the version number increases — the app
   remembers the last APK asset id it saw. A version you tap "Later" on is not
   shown again.

2. **"This is an unofficial app" now actually appears.**
   - The debug-build bypass was removed: a modified bundle is flagged even if the
     app is debuggable (otherwise repackaging it as debug hid the warning).
   - A missing or empty `integrity.json` is now treated as tampering whenever a
     native anchor is baked into the APK, so deleting the manifest no longer
     silently disables the check.

## NXT theme from the reference + Josefin Sans everywhere (this revision)

- The NXT palette now matches the reference image: accent `#8A4BFF`, off-white
  `#F8F7FF` background, `#4A4A4A` text, `#A0A0A0` secondary text, white cards.
- The app-wide background is the reference gradient
  `linear-gradient(135deg, #D8C4F0, #F3ECFF 45%, #FFFFFF)`. In NXT mode the app
  frame and page transitions are transparent so that gradient actually shows.
- NXT styling: repository cards become white, 28px-radius cards with a soft
  lavender shadow; primary buttons become the reference's purple gradient pill;
  tonal buttons get a soft gradient; icon buttons get the soft gradient ring
  (`.nxt-ring` is available for reuse).
- Typography: Josefin Sans is now the app-wide font (weights 400-700), applied to
  every element so no other typeface is used. Noto Sans Bengali follows it in the
  stack because Josefin Sans has no Bengali glyphs.

## One onboarding only (this revision)

The in-app splash screen had its own page-indicator dots and carousel artwork, so
it read as a second onboarding right before the real one. It is now a minimal
splash — just the app mark and the wordmark on the black canvas, matching the
native splash — so the ONLY onboarding the user sees is the five-page
`OnboardingScreen`. The onboarding completion flag was also bumped
(`gitofy.onboarded.v2`) so the five pages are shown once after this update.

## Home screen fit (this revision)

- The filter chip row was clipped at the right edge (the "Pinned" chip showed as
  "Pinr"). The chips now use a dense layout (`M3Chip dense`) with a tighter gap
  and a small right padding, so all four fit on screen.
- The bottom padding of the repository list was increased (`pb-32` -> `pb-44`) so
  the floating bottom navigation and the FAB no longer cover the last card.

## OTP login: default browser, instant resume, fullscreen (this revision)

1. **GitHub opens in the DEFAULT browser.** The native `openCustomTab` bridge and
   `openExternalUrl` now launch a plain `ACTION_VIEW` intent (your default
   browser) instead of a Chrome Custom Tab; the Custom Tab is only a fallback.

2. **The app signs in the moment you come back.** When the app returns to the
   foreground (after you enter the code in the browser) it now wakes the
   device-flow poll loop immediately (`deviceFlowProvider.wake.nudge()`), instead
   of waiting for the next poll interval. So you no longer have to wait, or keep
   the app open.

3. **Device-flow diagnostics + retry.** If the native OAuth call fails it now
   returns the exception (`"detail": "SomeException: message"`) and the app shows
   it under the error code, and the device-code request is retried once. This
   makes the exact cause of any remaining `DEVFLOW_network_error` visible.

4. **Fullscreen.** Immersive mode is re-applied in `onResume` (so the bars stay
   hidden when returning from the browser), and a `values-v27` theme adds
   `windowLayoutInDisplayCutoutMode=shortEdges` so the content fills the screen on
   phones with a notch / punch-hole.

## Performance: scroll lag, step logs, workflow steps (this revision)

1. **The real cause of the workflow/step lag was an effect loop.** In
   `WorkflowRunDetailScreen` the polling callbacks (`loadSnapshot`, `loadLogs`)
   listed `run` / `selectedJob` / `rawLog` in their `useCallback` deps — the very
   state those callbacks write. Every fetch produced a new `run`/`rawLog` object,
   which recreated the callback, which re-ran the effect, which fetched again...
   an endless fetch + re-render loop. Both callbacks now read the latest values
   from refs, so they are stable and the effects only run on real changes.

2. **Scroll lag.** `backdrop-blur` on the sticky headers forces the WebView to
   re-blur the whole backdrop every frame. All `backdrop-blur-*` classes were
   removed app-wide (the headers were already ~95% opaque, so they look the same).

3. **Log payload + rendering.** The native bridge now caps a fetched log to its
   last ~1.2 MB (a multi-MB string is very slow to serialise across the JS
   bridge), the app keeps a 1.2 MB tail, only the last 1500 lines are rendered,
   and the log line elements are memoised so the once-a-second clock no longer
   re-renders the whole list. The clock now only ticks while a run is active.

## Skeletons, smooth reveal, delete crash, header + FAB (this revision)

1. **"Deletion failed — Cannot read properties of undefined (reading 'login')".**
   Some repository objects (newly created locally, or restored from older
   storage) have no `owner`, so every `repo.owner.login` read could throw.
   Added `src/utils/repo.ts` (`repoOwnerLogin` / `repoOwnerAvatar`) and routed
   every owner read through it; `Repository.owner` is now optional and the API
   mappings fall back to the first segment of `full_name`.

2. **Header animation was laggy while scrolling.** The collapsing app bar
   animated `padding` and `font-size`, which forces a full text re-layout every
   frame. It now animates only `transform`/`opacity` (the wordmark scales, the
   subtitle fades) and the bar height stays constant, so scrolling never shifts
   layout.

3. **Skeleton loading + smooth reveal.** New `.gitofy-skeleton` shimmer (a
   `transform`-only sweep, so it cannot jank) and `.gitofy-reveal` /
   `.gitofy-reveal-stagger` fade-in utilities, plus a reusable `SkeletonRows`
   component. Applied to: the repo list (Home), the Files tree, the Commits
   list and file-open (RepoCode), the Releases list (RepoDashboard) and the
   workflow runs list (Workflows). Results now fade in as they arrive; the
   skeleton runs until the data is there.

4. **FAB menu.** Its hit-testing is now set inline (`pointerEvents: none` on the
   container, `auto` on the button and on the open item stack) so no stylesheet
   rule can leave the button unclickable, and the container moved to `z-[70]`.
