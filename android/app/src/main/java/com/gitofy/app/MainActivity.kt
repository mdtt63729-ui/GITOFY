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

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    /**
     * Bridge exposed to the web layer as `window.GitofyAndroid`.
     *
     * The OAuth-related methods exist because GitHub's device-flow endpoints
     * (github.com/login/*) send no CORS headers, so a browser fetch is blocked
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

        /** Opens a URL in a Chrome Custom Tab (WebView is forbidden for OAuth, §10.1). */
        @JavascriptInterface
        fun openCustomTab(url: String) {
            runOnUiThread {
                try {
                    val intent = CustomTabsIntent.Builder()
                        .setShowTitle(true)
                        .build()
                    intent.launchUrl(this@MainActivity, Uri.parse(url))
                } catch (e: Exception) {
                    // Fall back to the default browser, then to a plain VIEW intent.
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (_: Exception) {
                        android.util.Log.e("GitofyWeb", "No browser available for $url")
                    }
                }
            }
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
            return try {
                val parsed = Uri.parse(url)
                if (parsed.host != "github.com") {
                    return JSONObject().put("status", 0).put("body", "{\"error\":\"host_not_allowed\"}").toString()
                }
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
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
                    setRequestProperty("User-Agent", "Gitufy-Android")
                }
                conn.outputStream.use { it.write(form.toString().toByteArray(Charsets.UTF_8)) }
                val status = conn.responseCode
                val stream = if (status in 200..299) conn.inputStream else conn.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
                JSONObject().put("status", status).put("body", text).toString()
            } catch (e: Exception) {
                JSONObject().put("status", 0).put("body", "{\"error\":\"network_error\"}").toString()
            }
        }
    }

    private val filePicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        fileChooserCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        fileChooserCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(com.gitofy.app.R.style.Theme_Gitofy)
        super.onCreate(savedInstanceState)

        // Immersive edge-to-edge: the WebView occupies the entire display.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/web/", WebViewAssetLoader.AssetsPathHandler(this))
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
