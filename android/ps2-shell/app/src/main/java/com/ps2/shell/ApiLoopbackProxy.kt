package com.ps2.shell

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.net.InetAddress
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * 本地 HTTP 代理：WebView fetch → 127.0.0.1:port → OkHttp 访问 HTTPS API。
 * 对目标域名使用固定 IPv4，绕过错误 DNS。
 */
class ApiLoopbackProxy(
    listenHost: String,
    port: Int,
    private val forwardHost: String,
    private val pinnedIpv4: String,
) : NanoHTTPD(listenHost, port) {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .dns(
            object : Dns {
                override fun lookup(hostname: String): List<InetAddress> {
                    if (hostname.equals(forwardHost, ignoreCase = true)) {
                        return listOf(InetAddress.getByName(pinnedIpv4))
                    }
                    return Dns.SYSTEM.lookup(hostname)
                }
            },
        )
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    override fun serve(session: IHTTPSession): Response {
        val origin = session.headers["origin"]?.trim().orEmpty()
        val corsOrigin = when {
            origin.contains("appassets.androidplatform.net", ignoreCase = true) ->
                origin.ifEmpty { "https://appassets.androidplatform.net" }
            origin.isNotEmpty() -> origin
            else -> "*"
        }

        fun applyCors(r: Response) {
            r.addHeader("Access-Control-Allow-Origin", corsOrigin)
            r.addHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            r.addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
            r.addHeader("Vary", "Origin")
        }

        if (session.method == Method.OPTIONS) {
            return newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "").also(::applyCors)
        }

        var pathWithQuery = session.uri
        if (!pathWithQuery.startsWith("/")) {
            pathWithQuery = "/$pathWithQuery"
        }
        if (!pathWithQuery.startsWith("/api")) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "not api").also(::applyCors)
        }

        val url = "https://$forwardHost$pathWithQuery"
        val methodName = session.method.name

        val bodyBytes = readRequestBody(session)
        val contentType = session.headers["content-type"]
        val requestBody =
            if (bodyBytes.isEmpty() && methodName.equals("GET", ignoreCase = true)) {
                null
            } else {
                bodyBytes.toRequestBody(contentType?.toMediaTypeOrNull())
            }

        val rb = Request.Builder().url(url)
        session.headers.forEach { (key, value) ->
            val lk = key.lowercase(Locale.US)
            if (lk == "host" || lk == "connection" || lk == "content-length") return@forEach
            rb.header(key, value)
        }
        val req = rb.method(methodName, requestBody).build()

        return try {
            client.newCall(req).execute().use { resp ->
                val bytes = resp.body?.bytes() ?: ByteArray(0)
                val ct = resp.body?.contentType()?.toString()
                    ?: resp.header("Content-Type")
                    ?: "application/octet-stream"
                val status = nanoStatus(resp.code)
                val stream = ByteArrayInputStream(bytes)
                newFixedLengthResponse(status, ct, stream, bytes.size.toLong()).also { r ->
                    applyCors(r)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "forward failed: $url", e)
            val safe = e.message?.replace("\"", "'")?.take(200) ?: "error"
            val msg = "{\"error\":\"proxy\",\"message\":\"$safe\"}"
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json; charset=utf-8", msg).also(::applyCors)
        }
    }

    private fun nanoStatus(code: Int): Response.IStatus {
        Response.Status.values().forEach { s ->
            if (s.requestStatus == code) return s
        }
        return object : Response.IStatus {
            override fun getRequestStatus(): Int = code
            override fun getDescription(): String = "HTTP $code"
        }
    }

    private fun readRequestBody(session: IHTTPSession): ByteArray {
        val m = session.method
        if (m != Method.POST && m != Method.PUT && m != Method.PATCH) {
            return ByteArray(0)
        }
        val lenStr = session.headers["content-length"] ?: return ByteArray(0)
        val len = lenStr.toLongOrNull() ?: return ByteArray(0)
        if (len <= 0L || len > MAX_BODY_BYTES) {
            return ByteArray(0)
        }
        val buf = ByteArray(len.toInt())
        readFully(session.inputStream, buf)
        return buf
    }

    private fun readFully(input: InputStream, buf: ByteArray) {
        var off = 0
        while (off < buf.size) {
            val r = input.read(buf, off, buf.size - off)
            if (r <= 0) break
            off += r
        }
    }

    companion object {
        private const val TAG = "PS2ApiProxy"
        private const val MAX_BODY_BYTES = 6 * 1024 * 1024L
    }
}
