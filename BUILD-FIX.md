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

## Workflow tap targets + compact update sheet (this revision)

1. **Tapping a workflow no longer jumps into the steps.** `handleSelectWorkflow`
   was setting `detailRun`/`detailWorkflow`, which made the screen render
   `WorkflowRunDetailScreen` immediately — so tapping a workflow card opened the
   steps/logs of its latest run. It now only selects the workflow and loads its
   runs into the EXECUTION RUNS list. The run detail (jobs + steps, and the
   per-step log filter) opens only when a specific run card is tapped.

2. **The update sheet no longer overflows.** It used a fixed `58vh` with a
   152px icon and 18px-padded buttons, so the content was clipped / had to
   scroll. It now hugs its content (`maxHeight: 88vh`, auto height), the icon
   ring is 124px with an 86px glyph, and the sheet buttons use 14px padding at
   0.95rem.

3. **Nicer update-sheet entrance.** Added `gsec-sheet-in` (spring slide-up with
   a small overshoot), `gsec-icon-pop` (the icon ring pops and un-rotates) and a
   five-step `gsec-item-*` stagger for the label, title, subtitle, version chip
   and the button block. Transform/opacity only, with reduced-motion handling.

## Debug identity, in-app downloads, splash, animations (this revision)

### Native
1. **Debug APK no longer overwrites the signed release.** The debug build type
   now also sets `resValue "string", "app_name", "Gitofy (Debug)"` (release keeps
   "Gitofy"), the manifest label reads `@string/app_name`, and the FileProvider
   authority is `${applicationId}.fileprovider` so the two apps never collide.
2. **Real in-app APK downloads.** The release-asset download now goes through the
   native bridge (`startDownload`), which streams the bytes itself (no CORS) and
   then opens the system package installer automatically. The old code faked the
   progress bar and finished by opening the browser.
3. **Download notifications.** A `gitofy_downloads` channel posts an ongoing
   notification titled with the file name and a live percentage while it
   downloads, replaced by a "Downloaded" notification when it finishes (and
   "Download failed" on error). `POST_NOTIFICATIONS` is requested on Android 13+.

### Web
4. **Splash page removed.** The app opens straight into the real UI; the native
   window background covers startup.
5. **FAB hide/show on scroll restored** (it follows the bottom nav again).
6. **Premium page entrances** (`gitofy-screen-in`, plus a bouncy variant for
   Home → Library) applied to the repo dashboard, GitHub Actions, Settings, the
   repo-action (delete) page and the Library page.
7. **NXT contrast fix**: filter chips and app-bar icon buttons get solid white
   surfaces, visible purple borders and ink (selected chips keep the gradient).
8. **iOS-style blur** under every popup, sheet and the FAB menu scrim.
9. **Search field** expands with a spring instead of dropping in.
10. **Refresh** holds the skeleton for at least 2 s, then the results fade in —
    no flicker.
11. **Repo cards** animate in as they scroll (the stagger wrapper that was
    forcing them all visible on mount was removed).
12. **Run detail restructured**: header shows the workflow name, then
    repo · @user · #N · branch, with a 3-dot button on the right opening a FAB
    menu — Refresh at the top, then Cancel run / Re-run all / Re-run failed.
    Refresh shows a 2 s skeleton over the jobs and steps, then fades them in.
    Tapping a workflow still only selects it; tapping a run opens the steps.
13. Upload screen: removed the per-stage background transition that pulsed the
    canvas on every stage change.

## Auto-run all workflows + single Continue (this revision)

1. **Every workflow starts automatically after an upload.** New
   `runAllRepoWorkflows(owner, repo, branch, token)` in `githubApi.ts` lists the
   repository's workflows and dispatches each one. It is called the moment the
   upload commits, so the user never has to trigger anything by hand. Workflows
   that do not declare `on: workflow_dispatch` cannot be started through the API
   by design — those are the ones that already fire from the push, so they are
   reported as "run on push" rather than counted as failures.

2. **The upload-success page has one button.** The "Run CI Workflows / Build APK"
   button and the separate "Done" button are gone. There is now a single
   **Continue** button that goes straight to the Workflows page, with a small
   line above it showing how many workflows were started automatically.

## Update sheet: smaller buttons, icon moved down (this revision)

- The **Update** and **Later** pills are smaller: padding `14px 22px` → `11px 20px`
  and label size `0.95rem` → `0.88rem`.
- The animated icon ring (orbits + glow + refresh glyph) sits lower: `mt-5` was
  added above it, so it is no longer crowded against the "Update available" label.

## FAB slide, run-detail skeleton/menu/back, repo skeleton, delete fix (this revision)

1. **The FAB never actually slid — real root cause found.** Tailwind v4 compiles
   `translate-x-24` to the CSS `translate` property, but the FAB's transition
   only listed `transform`. A `transform`-only transition never animates
   `translate`, so the FAB snapped in and out instead of sliding. It now uses an
   explicit inline `transform: translateX(104px)` / `translateX(0)` with a
   springy overshoot, so scrolling up brings it back with a real slide + bounce
   and scrolling down slides it away.

2. **Run detail shows a skeleton the moment it opens** (`loading && jobs.length
   === 0`), instead of an empty "Jobs & Steps · 0".

3. **The 3-dot menu now drops in from the top-right.** It was anchored to the
   bottom and sat behind a full-screen `backdrop-filter: blur(18px)` scrim, which
   is very expensive in a WebView and made it feel laggy. The blur is gone from
   that scrim and the menu unfolds under the button (`.gitofy-drop-in`).

4. **Back leaves immediately.** A `leavingRef` stops both pollers the instant
   Back is tapped, so no in-flight request can hold the screen open.

5. **Opening a repository shows a boot skeleton** (700 ms) then fades the real
   content in, instead of flashing an empty page.

6. **Repository cards no longer replay their entrance on return.** Revealed card
   ids are remembered in a session Set, so coming back from a repository keeps
   the list settled ("icons reload" fixed) while newly scrolled cards still
   animate in.

7. **Delete-contents hardened.** Each deletion entry now keeps its real file mode
   (100644 / 100755 / 160000) — GitHub rejects a tree entry whose mode does not
   match, which made the whole cleanup commit fail. Added `clearGitHubCache()`,
   called after a clear, so the next read shows the emptied repository instead of
   a cached 304.

## Onboarding entrance animation (this revision)

The onboarding carousel had no entrance at all — it simply appeared. It now has
a smooth, bouncy slide-up:

- `.gitofy-onboard-in` on the root: the whole screen slides up from 58px below
  with a springy overshoot (`cubic-bezier(.22,.95,.3,1)`, 640ms), so it settles
  into place rather than just appearing.
- `.gitofy-onboard-rise-1` / `-2` stagger the dots and the action buttons in
  just behind it (170ms / 270ms).
- Transform + opacity only, with reduced-motion handling.

## Universal full-screen page transition system (this revision)

Implemented the Page Transition PRD as ONE reusable system — every full-screen
page goes through `src/ui/transitions/PageTransition.tsx`, so the motion is
identical everywhere instead of each screen inventing its own.

- **Forward** (deeper screen): the new page enters from the right edge
  (X +100% → 0, opacity .92 → 1, scale .98 → 1).
- **Back** (shallower screen): the previous page is revealed from the left
  (X −26% → 0, opacity .92 → 1).
- **Tabs** (Home ⇄ Library): a lighter, faster cross-fade instead of the
  horizontal push, as the PRD requires.
- Direction is *derived*, never hard-coded: `SCREEN_DEPTH` in `App.tsx` gives
  every screen a stack depth, and going deeper is forward, shallower is back.
- **300 ms**, `cubic-bezier(.16,1,.3,1)` — fast start, smooth deceleration, soft
  settle. **No overshoot, no bounce, no rotation.**
- All values live in one `PAGE_TRANSITION` config object (duration, easing,
  offsets, scales, fade, tab timing, reduced-motion timing).
- No white/black flash: the transition container's background is the theme
  surface, so a page sliding in never reveals a blank frame.
- Taps are blocked while the page is still moving, so a double tap can never
  push two screens.
- Reduced motion → a short 140 ms fade with almost no travel.
- **Popups are untouched.** Dialogs, bottom sheets, the FAB menu and the update
  sheet keep their own animations and are never routed through this system.

Also fixed a real bug: the native shell already dispatched an `androidback`
window event from `MainActivity.onBackPressed`, but nothing in the web layer
listened for it — so the Android hardware back button did nothing at all. It now
walks the same stack (detail → repository → home) and therefore plays the
reverse page transition.

## Sign-in hand-off: "Signed in" page no longer strands the user (this revision)

Two real bugs, one on top of the other:

1. **The hand-off timer was cancelled and never re-armed.** `LoginScreen`'s
   success effect cleared its `setTimeout` in the effect cleanup, and its deps
   included `onLoggedIn` — an inline arrow in `App` whose identity changes on
   every render. Signing in guarantees a re-render, so the cleanup cancelled the
   timer, and the `navigatedRef` guard meant it was never scheduled again:
   `onLoggedIn()` never fired and the app stayed on the "Signed in" screen.
   The timer now lives in a ref and is only cleared when the screen unmounts.

2. **A brand-new session could be expired a second after signing in.**
   `validateActiveSession()` runs on foreground — exactly when the user returns
   from the browser having just logged in. A transient failure there (or a
   profile read racing the new token) threw `E_SESSION`, which expires the
   session, so `App` bounced back to the login screen — which then rendered its
   stale "Signed in" view and sat there. A token validated moments ago is now
   trusted for a 20 s grace period.

Also:
- The success view now fades out before the switch and the app's own page
  transition plays on its first appearance, so signing in ends with a smooth
  admission into Home rather than a hard cut.
- If the session genuinely did not stick, the success view now returns to the
  form instead of leaving the user stranded.

## Polling pill, language-section jump, tab-switcher bounce (this revision)

1. **The "Polling" label no longer flashes on every cycle.** `loadSnapshot` was
   setting `connection='polling'` at the start of every fetch and `'live'` when
   it finished, so the header pill flipped labels every couple of seconds. The
   pill now shows the real run status — "Running" — and a separate `polling`
   flag cross-fades it to "Polling" only while a request is genuinely in flight
   (220 ms opacity cross-fade on two overlaid spans, so nothing jumps).

2. **The Languages block no longer shifts the card.** The multi-language
   breakdown was rendered only once the data arrived, so the whole card (and
   everything under it) jumped down when it landed. The block is now always
   present: a skeleton bar holds exactly its space while loading, then the real
   bar and legend fade in. `langsLoading` tracks the fetch.

3. **The Overview ⇄ Releases pill stays inside its box.** The sliding indicator
   travelled edge-to-edge and its spring overshot past the container, so the
   coloured part appeared to leave the box. It is now inset by the 4px padding
   on both sides (`width: calc(50% - 8px)`, `translateX(calc(100% + 8px))`),
   the container clips, and the spring was softened — while the buttons use the
   same spring so the whole switcher moves in sync.

## Front-camera safe area, workflows refresh, run-header layout (this revision)

1. **Nothing sits under the front camera on any phone.** The app runs
   edge-to-edge, so on notched / punch-hole devices the WebView draws under the
   camera and `env(safe-area-inset-*)` reports 0. New native bridge
   `GitofyAndroid.getSafeAreaInsets()` measures the real display cutout + system
   bars and returns them in CSS px; `src/utils/safeArea.ts` publishes them as
   `--gitofy-safe-*` (re-measured on resize / rotation / foreground) and CSS
   derives `--gitofy-top-bar = top + 0.5cm`. Every full-screen top bar now
   carries a shared `gitofy-topbar` class, so all 12 headers sit 0.5 cm below
   the camera automatically — no per-device values anywhere.

2. **The Refresh link next to "Repository Workflows" now refreshes.** It only
   re-read the workflow list, so nothing visible changed. It now re-reads the
   workflows *and* the runs of the current workflow, and the workflow list shows
   a skeleton while it loads.

3. **Run-detail header.** The Success / Failure badge moved out of the top row
   to the right end of the "Live · Elapsed · GitHub" line, as requested.

## Onboarding, PAT link, device-flow resume, run-once, card animation (this revision)

1. **Onboarding entrance is slow and silky now** (it was far too quick):
   980 ms with a soft settle, dots at 320 ms, buttons at 440 ms, and a shorter
   travel so it glides instead of snapping.
2. **The long delay after the splash is gone.** The onboarding gate used to sit
   *after* the `ready` (auth-session) gate, so the carousel waited for the whole
   session read. The onboarding flag is read synchronously from localStorage, so
   that check now runs first.
3. **"Login with a Personal Access Token" works on the error screen.** The PAT
   sheet was only rendered in the idle branch, so tapping the link on the
   failed/DEVFLOW screen set state but rendered nothing — it only appeared once
   Cancel returned the screen to idle. The sheet is now rendered there too.
4. **Minimising no longer breaks an OTP login.** Returning from the browser
   re-requests nothing: `resumeDeviceFlow()` continues polling the SAME device
   code (a new code would have discarded the approval), and the foreground
   handler calls it automatically — so an interrupted login heals itself instead
   of parking on DEVFLOW_network_error.
5. **Every workflow now runs exactly once.** `runAllRepoWorkflows` dispatched
   every workflow after an upload, but a workflow that already listens for
   `push` had been started by the commit itself — so it ran twice. It now reads
   each workflow file and only dispatches the ones a push cannot start.
6. **Repo cards animate.** The reveal now distinguishes the cards already on
   screen when the list mounts (shown instantly — that was the "icons reload"
   flicker) from the ones that scroll into view or appear from a filter change
   (animated). The filter-chip pill is springier too (620 ms, overshoot).
7. **App version vs release version.** A manual workflow run used to build
   `1.0.<run number>` while a tag push built the tag, so the two could drift.
   A manual run now bumps the patch of the newest release tag, so versionName
   and the release tag are always the same string.

## DEVFLOW_network_error root cause, FAB scroll, home load (this revision)

1. **DEVFLOW_network_error after minimising + authorising — real root cause.**
   The native transport does not *throw* on a failed call; it returns
   `{status:0, json:{error:'network_error'}}`. The poll loop only handled
   *thrown* network errors, so that result fell through to
   `nextPollAction`'s default branch → `fromDeviceFlowError('network_error')` →
   a FATAL error → the "Something went wrong / DEVFLOW_network_error" screen.
   That is exactly why it appeared after returning from the browser, when the
   app had been backgrounded. `nextPollAction` now returns a `network` action
   that the loop treats like a thrown network error: back off (1.5 s → 15 s) and
   keep polling. The device-code request itself also retries up to 4 times with
   backoff instead of once.

2. **The FAB is no longer tied to the nav bar.** It has its own scroll rule now:
   scrolling up keeps/brings it back, scrolling down slides it away, and nothing
   else (screen changes, nav changes) moves it. The threshold is 8 px so it
   responds immediately.

3. **The home screen is no longer slow to open.** Every load held the skeleton
   for a minimum of 2 s, which is what the video shows (the repository list
   sitting on placeholders). That hold now applies to a manual Refresh only
   (900 ms); an automatic load returns as soon as the data arrives. The first
   batch of cards also fades in smoothly after a load, while cards already on
   screen when the list re-mounts still appear instantly (no reload flicker).

4. **The app's first appearance is a gentle fade+rise**, not a full-width slide
   — the slide was leaving a blank frame for a moment on cold start.

## Workflow runs list, repo fade-in, update popup, Settings Advanced (this revision)

1. **A dispatched run no longer disappears from the list.** `handleDispatch`
   prepended an optimistic run, then `loadRuns` and the 30 s poll REPLACED the
   whole list with GitHub's answer — which lags several seconds behind the
   dispatch — so the new run blinked out and Refresh did not bring it back.
   The pending run is now held in a ref and merged into every refresh until a
   real run with that timestamp actually arrives, and the app re-checks at
   2.5 s / 6 s / 12 s / 20 s after dispatching.

2. **Repository cards fade in after the skeleton.** The reveal effect only
   depended on `filter`, so the cards that mounted *after* the load were never
   observed — they only appeared via the 1.5 s safety net, i.e. instantly with
   no fade. `isLoading` and `repos.length` are now dependencies, so the freshly
   loaded cards animate in smoothly.

3. **The update popup is no longer laggy or preceded by a blank flash.** Its
   scrim used a full-screen `backdrop-filter: blur(14px)`, which is very
   expensive inside a WebView and was the lag. The blur is now applied only
   after the entrance has settled (same look, smooth open), and the overlay
   carries a dim base from the first frame so nothing flashes white.

4. **Settings → Advanced.** "Generate Token ↗" was a raw `<a target="_blank">`,
   which the WebView can swallow; it now goes through the app's external opener
   like every other link. The Web Flow switch was permanently disabled (no
   client secret is embedded) and just looked broken — it now shows a clear
   "Not available" state instead.

## Every workflow runs exactly once — the detector was broken (this revision)

The "run each workflow once" logic never actually worked. Its regexes had
DOUBLED backslashes, so `/\\n/` looked for a literal backslash-then-n instead of
a newline, and `/\\s/` for a literal backslash-then-s. Both regexes therefore
never matched anything, `workflowListensForPush` always returned `false`, and
EVERY workflow was dispatched — so any workflow that also listened for `push`
ran twice (once from the commit, once from the dispatch).

It is now an indentation-aware YAML trigger reader instead of one brittle
regex, and it answers a sharper question: *will the push we just made start this
workflow?*

- `push:` with no filters, or `branches` covering the branch we pushed →
  the push starts it, so we do NOT dispatch (runs once).
- `push:` filtered to other branches, or to `tags:` only → the push cannot
  start it, so we DO dispatch (runs once).
- `workflow_dispatch` only → dispatch (runs once).
- Handles all three YAML styles: `push:` (mapping), `[push, …]` (flow) and
  `- push` (sequence).

Verified against the project's own workflows and 9 synthetic cases (9/9 pass):
`android-ci.yml` → push-triggered (skip dispatch), `bootstrap-signing.yml` →
dispatch, `release-apk.yml` (tag-only push) → dispatch. So each runs once.

## Settings cleanup + real GitHub settings + smooth sign-in (this revision)

1. **Design & Motion Verification removed from the UI.** The "M3 Component
   Gallery (F-81)" and "Motion Lab (F-82)" entries, their Settings card and
   their screens are gone from the app (routes, imports, props and the
   `AppScreen` union all dropped). The screens' files are left in the tree
   unreferenced. **"Log out of all accounts" is kept** — it now lives in its own
   "Danger zone" card.

2. **Real GitHub settings, inside the app.**
   - New **GitHub account settings** screen (`PATCH /user`): name, bio, company,
     location, website, social account and "available for hire" — the same
     fields as github.com/settings/profile. Reachable from Settings.
   - New **Repository settings** screen (`PATCH /repos/{owner}/{repo}` plus
     `POST /repos/{owner}/{repo}/branches/{branch}/rename`): description,
     website, private/public visibility, Issues / Wikis / Projects / Downloads
     toggles, the three merge options, **archive**, and renaming the default
     branch. Reachable from a repository's ⋮ menu.
   - New API helpers in `githubApi.ts`: `fetchAuthenticatedUser`,
     `updateUserProfile`, `fetchRepoEditableSettings`,
     `updateRepoEditableSettings`, `renameRepoBranch`.

3. **A smooth "signing you in…" panel after GitHub authorises the device flow.**
   Returning from the browser used to land on a stalled screen for a couple of
   seconds. A full-screen panel now fades/scales in the moment the session
   becomes authenticated, holds ~0.9 s, then fades out smoothly to reveal Home.

## Release list: APK upload time (this revision)

Each release asset in "Releases & APKs" now shows when it was uploaded, not just
its size and download count: `12.34 MB · 5 downloads · Uploaded 5 Oct 2026,
6:57 pm`. It uses GitHub's `asset.created_at` (falling back to `updated_at`), so
it reflects the real publish time of every APK — including the release APK.
The release header now shows the publish date AND time too.

## Workflow-once, runs list, logout, top bars, live updates (this revision)

1. **Every workflow runs exactly once — one more case fixed.** `branches-ignore`
   was treated like `branches`, so a workflow that listens for `push` on every
   branch EXCEPT the one you pushed was considered "already triggered" and never
   dispatched — it did not run at all. `branches-ignore` now inverts the test,
   and a `tags:`-only push is still recognised. Verified with 10 synthetic cases
   (10/10) plus the project's own workflows.

2. **A dispatched run stays in the runs list.** The "has it arrived yet?" check
   treated any run created in the previous 60 s as the real one, so the pending
   entry was dropped almost immediately. It now only stands down for a run
   created at/after the dispatch, and gives up after two minutes.

3. **The app no longer signs you out after a long time away.** Two causes: a
   single `E_SESSION` from a background validation ended the session, and a
   transient storage-read failure during cold start looked identical to "no
   session". Expiry now needs two consecutive rejections, and the stored session
   is read with one retry.

4. **Top bars sit just below the camera again.** The 0.5 cm gap I added on top of
   the measured cutout pushed everything far too low; `--gitofy-cutout-gap` is
   now 0, so the bars clear the camera exactly like a normal app.

5. **Updates show up live.** The release was only re-checked when the app came
   back to the foreground, so a freshly uploaded APK appeared only after
   restarting. It is now also re-checked every 60 s while the app is open.

6. **Workflows page Back leaves immediately** — it sets a `leaving` flag that
   stops the background runs poll before navigating, so the transition is not
   competing with a fetch and re-render.

7. **The update can never download by itself.** `onDownload` now refuses unless a
   real touch happened while the sheet was visible, so no synthetic or automatic
   activation can start a download.

## Run menu, step logs, back, long-press run menu, FAB (this revision)

1. **Step logs actually show now.** The step filter looked for
   `##[group]...<step number>`, but GitHub writes the step NAME in the group
   marker — so it matched nothing and the log looked empty. It now finds the
   `##[group]<step name>` section and shows those lines (with a name-match
   fallback for older logs).

2. **Run-detail ⋮ menu.** The outside-tap scrim now closes on `pointerdown` as
   well as click, so tapping anywhere off the menu always dismisses it, and the
   menu items are no longer disabled while an action runs, so the ⋮ button and
   the menu stay usable throughout.

3. **Back on the step page navigates first**, then stops the pollers — so the
   exit is immediate and a second tap always works.

4. **Long-press a run for a quick menu** (Cancel workflow / Re-run workflow /
   Delete workflow run), each with its own icon. 700 ms hold; the popup closes on
   any outside touch. New API helper `deleteWorkflowRun`.
   (I used 0.7 s rather than a full 2 s — 2 s feels broken on a phone.)

5. **FAB reacts to scroll immediately** — it comes back the instant the finger
   moves up, and only slides away after 24 px of deliberate downward scroll.

## Light + Crimson defaults, NXT removed, settings applied, font changer (this revision)

1. **Defaults are Light UI with the Crimson M3 palette.** `defaultSettings` was
   `uiMode: 'nxt'` / `palette: 'pink'`; it is now `'light'` / `'crimson'`.

2. **NXT removed.** The UI-mode switch, every `uiMode === 'nxt'` branch (frame,
   page transition, signing-in overlay, palette gate) and all
   `html[data-ui-mode='nxt']` CSS rules are gone. The app is always Light and the
   M3 palette is always used.

3. **Settings that were stored but never applied now work.**
   - **Font** — a new real-time, app-wide typeface setting (see 4).
   - **Text size** (`fontScale`) — scales the root font size, so every rem-based
     size follows.
   - **Corner radius** — published as `--gitofy-radius` and applied to the card
     styles (`.rounded-3xl`, `.rounded-2xl`).
   - **UI density** — published as `data-density` and applied to the standard
     card paddings.
   - **FAB position** — the FAB now actually moves to the centre when chosen.
   - The palette list was missing Pink; all six palettes are offered now.

4. **Font changer.** Six choices — Josefin Sans, Poppins, Montserrat, Orbitron,
   Playfair Display and the device System font — shown as chip buttons rendered
   IN their own typeface, with the same press feel as the All/Private filters.
   Selecting one sets `--gitofy-font` immediately, so the whole app re-renders in
   the new face with no reload and no lag. Poppins, Montserrat, Orbitron and
   Playfair Display are now loaded from Google Fonts, and Bengali always falls
   back to Noto Sans Bengali.

## FAB opposite the nav + live M3 download progress (this revision)

1. **The FAB is now exactly opposite the nav bar.** When the nav bar hides, the
   FAB comes into its place and is visible; when the nav bar is visible, the FAB
   hides. (It was doing the same thing as the nav before — that was my
   misunderstanding of what you wanted.)

2. **The download progress is a real M3 readout, in sync with the download.**
   - The native downloader now reports the exact bytes written, the total size
     and the live speed (measured over a 500 ms window, so it tracks the phone's
     actual network throughput) with every progress event.
   - The M3 linear progress bar in the update sheet is driven by that real
     percentage, with the exact `12.3 MB / 45.6 MB` under it and the live
     `2.4 MB/s` beside it.
   - The release-asset download in a repository shows the same real speed
     instead of a placeholder.

## Durable session, premium sign-in, upload screen (this revision)

1. **Signed out after a long time — real cause found.** The session (and the
   AES key that decrypts it) lived in the WebView's **IndexedDB**, which Android
   evicts once an app has been unused for a while; the token then became
   undecryptable and the app treated it as "no session". The session is now also
   written to app-private native storage (`SharedPreferences`, and the app has
   `allowBackup="false"`), and read from there first. It survives eviction.
   New bridge methods: `setSecure` / `getSecure` / `removeSecure`.

2. **Nav bar + FAB no longer vanish on their own.** They could stay hidden
   because the screen they were left on had tucked them away. Returning to Home
   or the Library now always brings the nav (and therefore the FAB) back.

3. **The sign-in screen is premium and runs for 5 seconds**: a progress ring
   fills around the GitHub mark while it breathes, over a fade/scale entrance,
   then fades smoothly into Home.

4. **Uploading screen rebuilt.** Every changing value now lives inside the one
   card and swaps with a smooth `gitofy-text-swap` (no remount — the old
   `key={uploadFileRevision}` on the whole file block was the flicker), and the
   speed readout is now measured for real: bytes actually sent divided by the
   elapsed time, with the ETA derived from it.

## Ultra-smooth Create-repo sheet (this revision)

1. **The sheet's entrance was laggy because of the backdrop blur.** The scrim
   applied a full-screen `backdrop-filter: blur(18px)` from the very first
   frame, so the WebView repainted that blur on every frame of the slide. The
   blur is now switched on only AFTER the sheet has settled (470 ms), so the
   entrance itself is transform-only. The same fix is applied to `M3Dialog`.
2. **New springy, transform-only sheet motion** (`gitofy-sheet-in` /
   `gitofy-sheet-out`, 460 ms with a soft overshoot, `will-change: transform`,
   `backface-visibility: hidden`) replacing the old linear `slideUp`.
3. **The Create-repo form stopped re-rendering on every keystroke.** The
   availability check flipped its spinner on the first character, before the
   debounce fired, so typing re-rendered the whole sheet repeatedly. The spinner
   now starts only when the check actually runs, the debounce is 260 ms, and a
   cancelled flag prevents a stale response from touching state.

## Feature batch 1 of the 20-item list (this revision)

1. **Pull-to-refresh (#1).** Drag down on the home list and release — a
   transform-only indicator follows your finger and the list reloads with the
   existing skeleton, so it stays smooth.
2. **Real dark mode (#16).** The dark palettes already existed but were never
   used (`isDark` was hard-coded false). Theme is now Light / Dark / System in
   Settings, `system` follows the device, and the status-bar colour follows the
   theme.
3. **Star & follow (#12).** A star button on every repository card. It flips
   instantly (optimistic), writes to GitHub with the real
   `PUT/DELETE /user/starred/{owner}/{repo}` endpoints, and rolls back if GitHub
   refuses. The starred set is loaded once from `/user/starred`.
4. **Settings backup & restore (#15).** Export every setting to a JSON file and
   import one back. The personal access token is deliberately excluded from the
   export and is ignored on import.

Remaining from the list: offline cache, global search, run notifications,
widget, multi-repo upload, branch manager, issues & PRs, syntax-highlighted
editor, commit graph, gists, deep links, per-screen app lock, batch repo
actions, release creator, workflow editor, optional crash reporting.

## Feature batch 2 of the 20-item list (this revision)

5. **Global search (#3).** A search screen with three tabs — My repos (instant,
   offline, no network), All GitHub (the repositories search API) and Code (the
   code search API, scoped to you). Reachable from Settings → Search everything.
6. **Branch manager (#7).** List every branch, create a new one from the default
   branch, rename a branch and delete one (with a confirmation). Reachable from a
   repository's ⋮ menu → Branches.
7. **Gists (#11).** List, create and delete your gists, open one on GitHub, and
   mark a new gist public or secret. Reachable from Settings → Gists.
8. **Workflow editor (#19).** Open any workflow's YAML from the Workflows page
   ("Edit YAML"), read it with light YAML highlighting in Preview mode, edit it,
   and commit it straight to the default branch with your own commit message.
9. New API helpers: `fetchBranches`, `createBranch`, `deleteBranch`,
   `fetchFileForEdit`, `saveFileContent`, `fetchGists`, `createGist`,
   `deleteGist`, `searchRepositories`, `searchCode`.

Still remaining: offline cache (#2), run notifications (#4), home-screen widget
(#5), multi-repo upload (#6), issues & PRs (#8), syntax-highlighted editor for
every file (#9), commit graph (#10), deep links (#13), per-screen app lock
(#14), batch repo actions (#17), release creator (#18), optional crash
reporting (#20).

## Feature batch 3 (this revision)

10. **Release creator (#18).** A "New release" screen in a repository's ⋮ menu:
    tag, title, target branch, notes, draft and pre-release switches, and an
    optional file attachment (choose an APK from the device) that uploads as a
    release asset with a real byte-accurate progress bar. New API:
    `createRelease`, `uploadReleaseAsset`.
11. **Batch repository actions (#17).** The multi-select mode on the home list now
    does more than delete: "Make private", "Make public" and "Archive" run across
    every selected repository, then refresh the list. New API:
    `setRepoArchived`, `setRepoVisibility`.
12. **Commit graph (#10).** The Commits tab now draws a graph rail — a coloured
    node per commit with a connecting line and a stable colour derived from the
    commit SHA — instead of a plain list.

## Feature batch 4 (this revision)

13. **Syntax highlighting for every file (#9).** A dependency-free highlighter
    (`src/utils/syntax.ts`) covering JavaScript/TypeScript, JSON, Python, Kotlin,
    Java, C/C++/C#, CSS, HTML/XML, Markdown, shell, YAML, Go, Rust, SQL, Ruby and
    PHP, chosen from the file extension. It tokenises the whole file at once, so
    block comments and multi-line strings stay correct across lines. The file
    viewer and the workflow editor now render through `CodeBlock`, which adds
    line numbers and skips highlighting above 4000 lines so a big log never
    janks. Covered by `tests/syntax.test.ts` — 40 checks, including a byte-exact
    round-trip for every language, so highlighting can never alter the text.
14. **Offline cache (#2).** `src/utils/offlineCache.ts` keeps the repository
    list, each repository's file tree and its commits in localStorage with a
    timestamp. Screens show the saved copy immediately and replace it when the
    network answers, so the app opens to real content with no connection instead
    of a blank screen. When GitHub cannot be reached the home list shows
    "No connection — showing your saved list (saved 4 min ago)". The cache is
    wiped on sign-out, and it never stores a token.
15. **Deep links (#13).** `gitofy://repo/<owner>/<name>` (and the same
    `https://github.com/...` shape) opens that repository in the app. New
    `AndroidManifest.xml` intent filter for the `gitofy` scheme with host `repo`,
    plus `onNewIntent` handling in `MainActivity` for links that arrive while the
    app is already open; the web layer reads it once via `getInitialDeepLink()`
    and then listens for a `gitofy:deeplink` window event. Parsing lives in
    `src/utils/deepLinks.ts` and is covered by `tests/deeplinks.test.ts` — 10
    checks, including that the OAuth callback and GitHub's own pages are not
    mistaken for repositories.
16. **Per-screen app lock (#14).** On top of the existing whole-app lock, you can
    now choose individual screens (Settings, GitHub account settings, repository
    settings, Branches, New release, Gists, Workflows, files, commits, Upload)
    that ask for your fingerprint or face again on entry. Each screen asks once
    per session, and every unlock is discarded when the whole-app lock re-engages.

Still remaining: run notifications (#4), the home-screen widget (#5), multi-repo
upload (#6), issues & pull requests (#8), optional crash reporting (#20).

## Feature batch 5 (this revision)

17. **Issues & pull requests (#8).** A new screen in a repository's ⋮ menu.
    Issues and pull requests in separate tabs, with an open/closed filter; tap
    one to read the body, labels and the whole comment thread, post a comment,
    close or reopen it, and — for a pull request — merge it. You can also create
    a new issue from the + button. New API: `fetchRepoIssues`, `fetchRepoPulls`,
    `createIssue`, `setIssueState`, `fetchIssueComments`, `addIssueComment`,
    `mergePullRequest`.
18. **Multi-repo upload (#6).** The upload success page now offers "Send to more
    repositories", which lets you tick any number of repositories and pushes the
    same ZIP to each one in turn, with a per-repository result and a real
    progress percentage. Uploads run one at a time rather than in parallel, so
    several pushes never fight over one connection.
19. **Optional crash reporting (#20).** `src/utils/errorLog.ts` records the last
    50 failures — uncaught errors, rejected promises, native errors and React
    render crashes — in a ring buffer on the device. Nothing is ever uploaded:
    the log lives in Settings → "Error log", where you can read it, copy it or
    clear it. A new `ErrorBoundary` also replaces a crashed screen with a
    recovery card instead of a blank WebView. It is switched off completely by
    the existing `diagnosticsOptIn` setting, which now also clears what was
    stored.
20. **Run notifications (#4).** When a workflow run you are watching reaches
    "completed", the app posts a notification ("Workflow succeeded / failed —
    CI · #42 — me/app") through a new native `notify` bridge and a "Workflow
    runs" notification channel. Each run is announced at most once, so a poll
    loop cannot spam you. Covered by `tests/runnotifications.test.ts`.

Only the home-screen widget (#5) remains from the twenty. It needs a native
Android `AppWidgetProvider`, which cannot be built or tested in this
environment at all.

## Feature batch 6 — the last one (this revision)

21. **Home-screen widget (#5).** A real Android widget: `GitofyWidgetProvider`
    plus `res/layout/gitofy_widget.xml`, `res/xml/gitofy_widget_info.xml` and a
    rounded-card drawable, registered as a `receiver` in the manifest. It shows
    how many repositories the signed-in account has (with the public/private
    split) and the result of the most recent workflow run, and tapping it opens
    the app.

    It never touches the network. The web layer builds a short summary
    (`src/utils/widget.ts`) and pushes it up through a new `updateWidget`
    bridge; the provider stores it in SharedPreferences and redraws every placed
    instance. `updatePeriodMillis` is deliberately 0, so the widget does not
    wake the device on a timer of its own. Covered by `tests/widget.test.ts`.

That completes all twenty items on the list. The two caveats worth repeating:
no APK can be built or device-tested in this environment, so the widget and the
deep-link intent filter are the two things most worth checking on a real phone.

## App Store search surface (this revision)

22. **The Home search button now opens an App Store search surface** that slides
    **up from the bottom edge**, and slides back **down with the same motion**
    when it closes. `src/ui/SlideUpScreen.tsx` owns that motion: it animates only
    `transform` and `opacity` (so it runs on the compositor and never re-lays-out
    the page behind it), keeps its children mounted for the whole exit — which is
    why the close animation is actually visible — and stops accepting taps the
    moment it starts moving. It is deliberately not routed through the app's
    horizontal page transition; the two motions are different and mixing them
    makes navigation feel mushy.

23. **Three search sources behind one box.** The mode button cycles
    Store → Library → My repos, morphing between its icons rather than swapping
    abruptly. Store searches GitHub at large for repositories that publish an
    installable APK. Library searches what you have already downloaded. **My
    repos searches your own repositories — and tells you which of them publish
    an installable APK** — which is what one tap from Library lands on.

24. **APK discovery and install.** `src/utils/appStore.ts` finds the first
    `.apk` asset on a repository's newest releases; results appear immediately
    and are checked for an APK in the background, four at a time, so the list is
    never blocked. Installing streams the file through the existing native
    downloader (real byte counts and real speed) and then opens the Android
    package installer — the app never installs anything silently.

25. **The app icon shows a circular download indicator** (`AppIconProgress`).
    Below 10% and above 90% it is a plain ring; in between it becomes a genuine
    travelling wave — the ring's radius is displaced by a sine along its length
    and the phase advances over time — with the amplitude ramping in and out so
    the change is a morph, not a jump. The maths lives in `src/utils/wave.ts` and
    is covered by `tests/appstore.test.ts`, including a check that the amplitude
    never jumps between samples. The animation loop only runs while a download
    is actually in flight.

26. **Search history and the download library** persist on the device
    (`getHistory`/`pushHistory`, `getLibrary`/`addToLibrary`). The empty search
    state shows Recent searches and Recently downloaded, exactly as specified.
