package com.gitofy.app

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    /**
     * A gitofy://repo/<owner>/<name> link that arrived before the WebView was
     * ready. The web layer pulls it once with getInitialDeepLink().
     */
    private var pendingDeepLink: String? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    /**
     * Bridge exposed to the web layer as `window.GitofyAndroid`.
     *
     * The OAuth-related methods exist because GitHub's device-flow endpoints
     * (github.com/login/... ) send no CORS headers, so a browser fetch is blocked
     * by the WebView. Performing those two calls here — with only the public
     * client_id, never a secret — keeps the flow secret-free (PRD v2.0 §3.2).
     */
    private inner class AndroidBridge {
        @JavascriptInterface
        fun exitApp() {
            runOnUiThread { finishAffinity() }
        }

        @JavascriptInterface
        fun shareText(title: String, text: String) {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_SUBJECT, title)
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                startActivity(Intent.createChooser(intent, title))
            }
        }

        /** Opens a URL in the user's DEFAULT browser (not a Custom Tab). */
        @JavascriptInterface
        fun openCustomTab(url: String) {
            runOnUiThread { openExternalUrl(url) }
        }

        /** Copies text, marking it sensitive and auto-clearing it after 2 minutes (§10.1). */
        @JavascriptInterface
        fun copyText(text: String, sensitive: Boolean) {
            runOnUiThread {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("Gitufy", text)
                if (sensitive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    clip.description.extras = android.os.PersistableBundle().apply {
                        putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
                    }
                }
                clipboard.setPrimaryClip(clip)
                if (sensitive) {
                    Handler(Looper.getMainLooper()).postDelayed({
                        val current = clipboard.primaryClip
                        if (current != null && current.itemCount > 0 && current.getItemAt(0).text.toString() == text) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                clipboard.clearPrimaryClip()
                            } else {
                                clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
                            }
                        }
                    }, 120_000)
                }
            }
        }

        /** Toggles FLAG_SECURE so the app preview is hidden in Recents (§7.6). */
        @JavascriptInterface
        fun setSecureFlag(on: Boolean) {
            runOnUiThread {
                if (on) {
                    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
            }
        }

        /**
         * Shows a BiometricPrompt (with device-credential fallback) and blocks the
         * calling bridge thread until the user responds. Returns true on success.
         */
        @JavascriptInterface
        fun authenticateBiometric(): Boolean {
            val latch = CountDownLatch(1)
            var ok = false
            val executor = ContextCompat.getMainExecutor(this@MainActivity)
            runOnUiThread {
                val canUseBiometric = BiometricManager.from(this@MainActivity)
                    .canAuthenticate(
                        BiometricManager.Authenticators.BIOMETRIC_WEAK or
                            BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    ) == BiometricManager.BIOMETRIC_SUCCESS
                if (!canUseBiometric) {
                    ok = true // No lock available on this device — do not trap the user.
                    latch.countDown()
                    return@runOnUiThread
                }
                val prompt = BiometricPrompt(
                    this@MainActivity,
                    executor,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            ok = true
                            latch.countDown()
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            latch.countDown()
                        }
                    }
                )
                val info = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Unlock Gitufy")
                    .setSubtitle("Confirm your identity to continue")
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_WEAK or
                            BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    )
                    .build()
                prompt.authenticate(info)
            }
            latch.await(90, TimeUnit.SECONDS)
            return ok
        }

        /**
         * Performs a form-encoded HTTPS POST on behalf of the web layer and returns
         * JSON: {"status": <int>, "body": "<raw response text>"}. Restricted to the
         * GitHub OAuth host to keep this a narrow, auditable tunnel.
         */
        @JavascriptInterface
        fun oauthPost(url: String, bodyJson: String): String {
            if (Uri.parse(url).host != "github.com") {
                return JSONObject().put("status", 0).put("body", "{\"error\":\"host_not_allowed\"}").toString()
            }
            return runBlockingNetwork { performOauthPost(url, bodyJson) }
        }

        private fun performOauthPost(url: String, bodyJson: String): String {
            return try {
                val bodyObj = JSONObject(bodyJson)
                val form = StringBuilder()
                val keys = bodyObj.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    if (form.isNotEmpty()) form.append('&')
                    form.append(URLEncoder.encode(k, "UTF-8"))
                    form.append('=')
                    form.append(URLEncoder.encode(bodyObj.getString(k), "UTF-8"))
                }
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 20_000
                    readTimeout = 30_000
                    doOutput = true
                    instanceFollowRedirects = true
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
                    setRequestProperty("User-Agent", "Gitofy-Android")
                }
                conn.outputStream.use { it.write(form.toString().toByteArray(Charsets.UTF_8)) }
                val status = conn.responseCode
                val stream = if (status in 200..299) conn.inputStream else conn.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
                JSONObject().put("status", status).put("body", text).toString()
            } catch (e: Exception) {
                android.util.Log.e("GitofyWeb", "oauthPost failed: ${e.javaClass.simpleName} ${e.message}", e)
                JSONObject()
                    .put("status", 0)
                    .put(
                        "body",
                        JSONObject()
                            .put("error", "network_error")
                            .put("detail", "${e.javaClass.simpleName}: ${e.message ?: ""}")
                            .toString()
                    )
                    .toString()
            }
        }

        /**
         * Authenticated HTTPS GET performed natively, returning
         * {"status": <int>, "body": "<raw response text>"}.
         *
         * Used for GitHub Actions job logs: the REST endpoint answers with a 302
         * redirect to a storage host that does not send CORS headers, so a browser
         * `fetch` from the WebView is blocked by CORS. Doing it here follows the
         * redirect without CORS. The Authorization header is deliberately NOT
         * forwarded to the redirected (signed) URL, because storage backends reject
         * requests that carry both a SAS signature and an Authorization header.
         * Restricted to api.github.com to keep this a narrow, auditable tunnel.
         */
        @JavascriptInterface
        fun githubGetText(url: String, token: String): String {
            if (Uri.parse(url).host != "api.github.com") {
                return JSONObject().put("status", 0).put("body", "{\"error\":\"host_not_allowed\"}").toString()
            }
            return runBlockingNetwork { performGithubGetText(url, token) }
        }

        private fun performGithubGetText(url: String, token: String): String {
            return try {
                var conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 20_000
                    readTimeout = 30_000
                    instanceFollowRedirects = false
                    setRequestProperty("Accept", "application/vnd.github+json")
                    setRequestProperty("User-Agent", "Gitufy-Android")
                    if (token.isNotBlank()) setRequestProperty("Authorization", "Bearer $token")
                }
                var status = conn.responseCode
                if (status in 300..399) {
                    val location = conn.getHeaderField("Location")
                    conn.disconnect()
                    if (!location.isNullOrBlank()) {
                        conn = (URL(location).openConnection() as HttpURLConnection).apply {
                            requestMethod = "GET"
                            connectTimeout = 20_000
                            readTimeout = 30_000
                            instanceFollowRedirects = true
                            setRequestProperty("User-Agent", "Gitufy-Android")
                        }
                        status = conn.responseCode
                    }
                }
                val stream = if (status in 200..299) conn.inputStream else conn.errorStream
                val raw = stream?.bufferedReader()?.use { it.readText() } ?: ""
                // Cap the payload that crosses the JS bridge — a multi-megabyte job
                // log is very slow to serialise and transfer, which made the log
                // viewer lag. The app only ever shows a tail anyway.
                val text = if (raw.length > 1_200_000) raw.substring(raw.length - 1_200_000) else raw
                JSONObject().put("status", status).put("body", text).toString()
            } catch (e: Exception) {
                JSONObject().put("status", 0).put("body", "{\"error\":\"network_error\"}").toString()
            }
        }

        /**
         * Lists the Google accounts present on this device, as a JSON array of
         * {"name": "<email>", "label": "<display name>"}. Used to populate the
         * "Choose an account" chooser so it shows the user's real accounts, like
         * Google's own account picker. Never throws; returns "[]" on any failure.
         */
        @JavascriptInterface
        fun getGoogleAccounts(): String {
            val out = org.json.JSONArray()
            try {
                val am = android.accounts.AccountManager.get(this@MainActivity)
                for (account in am.getAccountsByType("com.google")) {
                    out.put(JSONObject().put("name", account.name).put("label", account.name))
                }
            } catch (_: Exception) {
                // Permission missing or no accounts — return what we have.
            }
            return out.toString()
        }

        /** Expected bundle root hash (anchor) baked into the APK by CI. */
        @JavascriptInterface
        fun getExpectedIntegrityRoot(): String {
            return try {
                resources.openRawResource(R.raw.integrity_root)
                    .bufferedReader().use { it.readText() }.trim()
            } catch (e: Exception) {
                ""
            }
        }

        /**
         * Real safe-area insets in CSS px (dp), measured from the display
         * cutout and the system bars. The app is edge-to-edge, so
         * env(safe-area-inset-*) is 0 inside the WebView on notched phones —
         * this is how the web layer learns where the front camera actually is.
         */
        /** Durable, app-private storage for the session (survives WebView eviction). */
        @JavascriptInterface
        fun setSecure(key: String, value: String) {
            try {
                getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE)
                    .edit().putString(key, value).apply()
            } catch (_: Exception) {
                // Best effort — the web layer keeps its own copy too.
            }
        }

        @JavascriptInterface
        fun getSecure(key: String): String {
            return try {
                getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE).getString(key, "") ?: ""
            } catch (_: Exception) {
                ""
            }
        }

        @JavascriptInterface
        fun removeSecure(key: String) {
            try {
                getSharedPreferences(SECURE_PREFS, Context.MODE_PRIVATE).edit().remove(key).apply()
            } catch (_: Exception) {
                // Best effort.
            }
        }

        @JavascriptInterface
        fun getSafeAreaInsets(): String {
            return try {
                val density = resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
                var top = 0
                var bottom = 0
                var left = 0
                var right = 0
                val decor = window.decorView
                val insets = androidx.core.view.ViewCompat.getRootWindowInsets(decor)
                if (insets != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                        val cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
                        top = maxOf(bars.top, cut.top)
                        bottom = maxOf(bars.bottom, cut.bottom)
                        left = maxOf(bars.left, cut.left)
                        right = maxOf(bars.right, cut.right)
                    } else {
                        @Suppress("DEPRECATION")
                        top = insets.systemWindowInsetTop
                        @Suppress("DEPRECATION")
                        bottom = insets.systemWindowInsetBottom
                        @Suppress("DEPRECATION")
                        left = insets.systemWindowInsetLeft
                        @Suppress("DEPRECATION")
                        right = insets.systemWindowInsetRight
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            val cut = insets.displayCutout
                            if (cut != null) {
                                top = maxOf(top, cut.safeInsetTop)
                                bottom = maxOf(bottom, cut.safeInsetBottom)
                                left = maxOf(left, cut.safeInsetLeft)
                                right = maxOf(right, cut.safeInsetRight)
                            }
                        }
                    }
                }
                if (top == 0) {
                    val id = resources.getIdentifier("status_bar_height", "dimen", "android")
                    if (id > 0) top = resources.getDimensionPixelSize(id)
                }
                JSONObject()
                    .put("top", top / density)
                    .put("bottom", bottom / density)
                    .put("left", left / density)
                    .put("right", right / density)
                    .toString()
            } catch (e: Exception) {
                "{\"top\":0,\"bottom\":0,\"left\":0,\"right\":0}"
            }
        }

        @JavascriptInterface
        /**
         * The deep link that launched the app, consumed exactly once so a
         * rotation or a resume does not navigate again.
         */
        @JavascriptInterface
        fun getInitialDeepLink(): String {
            val link = pendingDeepLink ?: return ""
            pendingDeepLink = null
            return link
        }

        /**
         * The web layer pushes a short summary here — how many repositories the
         * account has and the latest workflow result — and every placed
         * home-screen widget redraws from it.
         */
        @JavascriptInterface
        fun updateWidget(json: String) {
            try {
                GitofyWidgetProvider.saveAndRefresh(this@MainActivity, json)
            } catch (_: Exception) {
                // A widget that fails to redraw must never disturb the app.
            }
        }

        fun getAppVersion(): String {
            return try {
                packageManager.getPackageInfo(packageName, 0).versionName ?: ""
            } catch (e: Exception) {
                ""
            }
        }

        @JavascriptInterface
        fun getAppVersionCode(): Int {
            return try {
                val info = packageManager.getPackageInfo(packageName, 0)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    info.longVersionCode.toInt()
                } else {
                    @Suppress("DEPRECATION")
                    info.versionCode
                }
            } catch (e: Exception) {
                0
            }
        }

        @JavascriptInterface
        fun isDebugBuild(): Boolean {
            return (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        }

        /** SHA-256 of the installed APK file, exposed for diagnostics. */
        @JavascriptInterface
        fun getApkDigest(): String {
            return try {
                val md = MessageDigest.getInstance("SHA-256")
                File(applicationInfo.sourceDir).inputStream().use { input ->
                    val buf = ByteArray(65536)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        md.update(buf, 0, n)
                    }
                }
                md.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
            } catch (e: Exception) {
                ""
            }
        }

        private fun ensureDownloadChannel() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (mgr.getNotificationChannel(DOWNLOAD_CHANNEL_ID) == null) {
                    val channel = NotificationChannel(
                        DOWNLOAD_CHANNEL_ID,
                        "Downloads",
                        NotificationManager.IMPORTANCE_LOW
                    ).apply {
                        description = "APK download progress"
                        setShowBadge(false)
                    }
                    mgr.createNotificationChannel(channel)
                }
            }
        }

        /**
         * One ongoing notification while a file is downloading (title = the file
         * name, with a real percentage), replaced by a "Downloaded" notification
         * when it finishes.
         */
        private fun notifyDownload(title: String, text: String, percent: Int) {
            try {
                ensureDownloadChannel()
                val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val ongoing = percent in 0..99
                val builder = NotificationCompat.Builder(this@MainActivity, DOWNLOAD_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_sys_download)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setOnlyAlertOnce(true)
                    .setOngoing(ongoing)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                if (ongoing) builder.setProgress(100, percent, false) else builder.setProgress(0, 0, false)
                mgr.notify(DOWNLOAD_NOTIFICATION_ID, builder.build())
            } catch (_: Exception) {
                // Notifications are best-effort; never break the download for them.
            }
        }

        /**
         * A plain notification for events the user asked to be told about —
         * currently "a workflow run finished". Tapping it opens the app.
         */
        @JavascriptInterface
        fun notify(title: String, text: String) {
            try {
                val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && mgr.getNotificationChannel(RUN_CHANNEL_ID) == null) {
                    mgr.createNotificationChannel(
                        NotificationChannel(
                            RUN_CHANNEL_ID,
                            "Workflow runs",
                            NotificationManager.IMPORTANCE_DEFAULT
                        ).apply { description = "Tells you when a workflow run finishes" }
                    )
                }
                val open = packageManager.getLaunchIntentForPackage(packageName)
                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                else android.app.PendingIntent.FLAG_UPDATE_CURRENT
                val pending = open?.let { android.app.PendingIntent.getActivity(this@MainActivity, 0, it, flags) }
                val builder = NotificationCompat.Builder(this@MainActivity, RUN_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_notify_sync)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                if (pending != null) builder.setContentIntent(pending)
                // A stable id per event kind keeps the shade tidy instead of stacking.
                mgr.notify(RUN_NOTIFICATION_ID, builder.build())
            } catch (_: Exception) {
                // A notification is a nicety; never let it break the run view.
            }
        }

        private fun emitDownload(payload: String) {
            runOnUiThread {
                if (::webView.isInitialized) {
                    webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('gitofy-download',{detail:$payload}))",
                        null
                    )
                }
            }
        }

        /** Streams an APK to cache and reports progress via gitofy-download events. */
        @JavascriptInterface
        fun startDownload(url: String, fileName: String, token: String) {
            Thread {
                var conn: HttpURLConnection? = null
                try {
                    conn = (URL(url).openConnection() as HttpURLConnection).apply {
                        connectTimeout = 20_000
                        readTimeout = 60_000
                        instanceFollowRedirects = true
                        setRequestProperty("Accept", "application/octet-stream")
                        setRequestProperty("User-Agent", "Gitufy-Android")
                        if (token.isNotBlank()) setRequestProperty("Authorization", "Bearer $token")
                    }
                    val code = conn.responseCode
                    if (code < 200 || code > 299) {
                        emitDownload("{\"type\":\"error\",\"error\":\"HTTP $code\"}")
                    } else {
                        val total = conn.contentLengthLong
                        val dir = File(cacheDir, "updates")
                        if (!dir.exists()) dir.mkdirs()
                        val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
                        val outFile = File(dir, safeName)
                        var lastPct = -1
                        var speedWindowStart = System.currentTimeMillis()
                        var speedWindowBytes = 0L
                        var speedBps = 0L
                        notifyDownload(fileName, "Starting…", 0)
                        conn.inputStream.use { input ->
                            FileOutputStream(outFile).use { output ->
                                val buf = ByteArray(65536)
                                var read = 0L
                                while (true) {
                                    val n = input.read(buf)
                                    if (n < 0) break
                                    output.write(buf, 0, n)
                                    read += n
                                    // Live speed over a short window, so it tracks
                                    // the phone's real network throughput.
                                    speedWindowBytes += n
                                    val nowMs = System.currentTimeMillis()
                                    if (nowMs - speedWindowStart >= 500) {
                                        speedBps = speedWindowBytes * 1000L / (nowMs - speedWindowStart)
                                        speedWindowStart = nowMs
                                        speedWindowBytes = 0L
                                    }
                                    if (total > 0) {
                                        val pct = ((read * 100) / total).toInt()
                                        if (pct != lastPct) {
                                            lastPct = pct
                                            emitDownload("{\"type\":\"progress\",\"percent\":$pct,\"received\":$read,\"total\":$total,\"speed\":$speedBps}")
                                            notifyDownload(
                                                fileName,
                                                "$pct%  ·  ${read / (1024 * 1024)} MB / ${total / (1024 * 1024)} MB  ·  ${speedBps / (1024 * 1024)} MB/s",
                                                pct
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        emitDownload("{\"type\":\"done\",\"path\":${JSONObject.quote(outFile.absolutePath)}}")
                        notifyDownload("Downloaded", fileName, 100)
                    }
                } catch (e: Exception) {
                    emitDownload("{\"type\":\"error\",\"error\":${JSONObject.quote(e.message ?: "download failed")}}")
                    notifyDownload("Download failed", fileName, -1)
                } finally {
                    conn?.disconnect()
                }
            }.start()
        }

        /** Launches the system installer for a previously downloaded APK. */
        @JavascriptInterface
        fun installApk(path: String): Boolean {
            return try {
                val file = File(path)
                if (!file.exists()) {
                    false
                } else {
                    val uri = FileProvider.getUriForFile(this@MainActivity, packageName + ".fileprovider", file)
                    runOnUiThread {
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, "application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(intent)
                    }
                    true
                }
            } catch (e: Exception) {
                false
            }
        }
    }

    private val SECURE_PREFS = "gitofy_secure"

    private val DOWNLOAD_CHANNEL_ID = "gitofy_downloads"
    private val RUN_CHANNEL_ID = "gitofy_runs"
    private val DOWNLOAD_NOTIFICATION_ID = 4201
    private val RUN_NOTIFICATION_ID = 7102

    private val filePicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        fileChooserCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        fileChooserCallback = null
    }

    /**
     * Runs a blocking network call off the UI thread and waits for the result.
     *
     * Some Android/WebView versions dispatch JavaScript-interface methods on the
     * main thread, where any network call throws NetworkOnMainThreadException —
     * which surfaced in the app as "DEVFLOW_network_error" and broke the GitHub
     * device-flow login. Doing the work on a worker thread fixes that.
     */
    private fun runBlockingNetwork(block: () -> String): String {
        if (android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) return block()
        var out = "{\"status\":0,\"body\":\"{\\\"error\\\":\\\"network_error\\\"}\"}"
        val latch = CountDownLatch(1)
        Thread {
            out = block()
            latch.countDown()
        }.start()
        latch.await(30, TimeUnit.SECONDS)
        return out
    }

    /** Opens a URL in the user's DEFAULT browser (Custom Tab only as a fallback). */
    private fun openExternalUrl(url: String) {
        if (url.isBlank()) return
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            try {
                val tab = CustomTabsIntent.Builder().setShowTitle(true).build()
                tab.launchUrl(this, Uri.parse(url))
            } catch (_: Exception) {
                android.util.Log.e("GitofyWeb", "No browser available for $url")
            }
        }
    }

    /** Hides the status and navigation bars so the WebView is truly fullscreen. */
    private fun applyImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    // Android re-shows the system bars after a dialog, the keyboard, or a focus
    // change; re-hide them whenever the window regains focus so the app stays
    // fullscreen instead of drifting back to a status-bar layout.
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersiveMode()
    }

    /**
     * The activity is singleTask, so a deep link that arrives while the app is
     * already open comes through here rather than a fresh onCreate.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val uri = intent.data ?: return
        if (uri.scheme != "gitofy" || uri.host != "repo") return
        emitDeepLink(uri.toString())
    }

    /** Hands a deep link to the web layer as a window event. */
    private fun emitDeepLink(url: String) {
        if (!::webView.isInitialized) {
            pendingDeepLink = url
            return
        }
        val payload = JSONObject.quote(url)
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('gitofy:deeplink',{detail:$payload}));",
                null
            )
        }
    }

    override fun onResume() {
        super.onResume()
        // Re-assert fullscreen when returning from the browser (after entering the
        // GitHub device code), where the system bars may have reappeared.
        applyImmersiveMode()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(com.gitofy.app.R.style.Theme_Gitofy)
        super.onCreate(savedInstanceState)

        // A gitofy://repo/... link may have launched the app. The OAuth callback
        // also uses the gitofy scheme, so only the "repo" host is treated as a
        // deep link; everything else is left alone.
        intent?.data?.let { uri ->
            if (uri.scheme == "gitofy" && uri.host == "repo") {
                pendingDeepLink = uri.toString()
            }
        }

        // Immersive edge-to-edge: the WebView occupies the entire display.
        applyImmersiveMode()

        // Android 13+ needs runtime consent before we may post the download
        // progress / "Downloaded" notifications.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            try {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 9001)
            } catch (_: Exception) {
                // Ignore — downloads still work, only the notification is skipped.
            }
        }

        // NOTE: WebViewAssetLoader strips the registered prefix and then opens the
        // *remainder* relative to the assets root. So a "/web/" handler maps
        // /web/index.html to assets/index.html (missing) -> ERR_INVALID_RESPONSE.
        // Registering "/" makes /web/index.html resolve to assets/web/index.html,
        // which is where the bundle actually lives.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            addJavascriptInterface(AndroidBridge(), "GitofyAndroid")
            setBackgroundColor(android.graphics.Color.rgb(241, 242, 252))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = false
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            settings.javaScriptCanOpenWindowsAutomatically = true
            // Keep text at the CSS-specified size: WebView "text autosizing" rescales
            // text and makes the UI look like a web page rather than a native app.
            settings.textZoom = 100
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = WebView.OVER_SCROLL_NEVER
            setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
                    ?: super.shouldInterceptRequest(view, request)

                @Deprecated("Deprecated in Java")
                override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(Uri.parse(url))
                        ?: super.shouldInterceptRequest(view, url)

                // The app is fully offline-capable, so ANY navigation that is not to
                // the local app-asset host must leave the app and open in the system
                // browser (Chrome Custom Tab). This keeps GitHub — and every other
                // link — out of the in-app WebView, so the app never feels like a
                // web page and never opens GitHub inside itself.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == "appassets.androidplatform.net") return false
                    openExternalUrl(request.url.toString())
                    return true
                }

                @Deprecated("Deprecated in Java")
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                    if (Uri.parse(url).host == "appassets.androidplatform.net") return false
                    openExternalUrl(url)
                    return true
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    android.util.Log.e("GitofyWeb", "Load error ${error.errorCode}: ${error.description} ${request.url}")
                    super.onReceivedError(view, request, error)
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    fileChooserParams: FileChooserParams
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = filePathCallback
                    filePicker.launch(arrayOf("application/zip", "application/octet-stream", "*/*"))
                    return true
                }

                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    android.util.Log.d("GitofyWeb", "${message.message()} @ ${message.sourceId()}:${message.lineNumber()}")
                    return true
                }
            }
        }

        setContentView(webView)
        webView.loadUrl("https://appassets.androidplatform.net/web/index.html")

        // If launched via the OAuth deep link, forward the callback to the web layer.
        handleDeepLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "gitofy" && data.host == "callback") {
            val escaped = data.toString().replace("'", "\\'")
            if (::webView.isInitialized) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('gitofydeeplink',{detail:'$escaped'}))",
                    null
                )
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('androidback'))", null)
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.clearHistory()
            webView.removeAllViews()
            webView.destroy()
        }
        super.onDestroy()
    }
}
