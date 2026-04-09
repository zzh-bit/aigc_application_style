package com.ps2.shell

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView.setWebContentsDebuggingEnabled
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import java.io.InputStream

class MainActivity : AppCompatActivity() {
    private val tag = "PS2WebView"

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING)

        webView = WebView(this)
        setContentView(webView)
        setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? {
                val url = request.url.toString()
                val marker = "/assets/web/_next/"
                if (url.contains(marker)) {
                    val suffix = url.substringAfter(marker)
                    val path = "web/next/$suffix"
                    return loadAssetResponse(path)
                }
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                Log.i(tag, "Page started: $url")
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    Log.e(
                        tag,
                        "Main frame load error: code=${error?.errorCode}, desc=${error?.description}, url=${request.url}",
                    )
                } else {
                    Log.w(
                        tag,
                        "Subresource load error: code=${error?.errorCode}, desc=${error?.description}, url=${request?.url}",
                    )
                }
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?,
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                Log.w(
                    tag,
                    "HTTP error: status=${errorResponse?.statusCode}, reason=${errorResponse?.reasonPhrase}, url=${request?.url}",
                )
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    private fun loadAssetResponse(assetPath: String): WebResourceResponse? {
        return try {
            val stream: InputStream = assets.open(assetPath)
            val mime = guessMime(assetPath)
            WebResourceResponse(mime, "utf-8", stream)
        } catch (_: Exception) {
            null
        }
    }

    private fun guessMime(path: String): String = when {
        path.endsWith(".js") -> "application/javascript"
        path.endsWith(".css") -> "text/css"
        path.endsWith(".html") -> "text/html"
        path.endsWith(".json") -> "application/json"
        path.endsWith(".woff2") -> "font/woff2"
        path.endsWith(".woff") -> "font/woff"
        path.endsWith(".png") -> "image/png"
        path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
        path.endsWith(".svg") -> "image/svg+xml"
        path.endsWith(".ico") -> "image/x-icon"
        path.endsWith(".txt") -> "text/plain"
        path.endsWith(".map") -> "application/json"
        else -> "application/octet-stream"
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }
}
