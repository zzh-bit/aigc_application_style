# Android Studio 打开并打包本项目（Web → APK）操作手册

本项目是 **Next.js Web 应用**，在 Android 侧推荐用 **WebView + WebViewAssetLoader** 的方式做“壳工程”，实现：

- **离线**：APK 内置静态页面资源（不依赖网络也能打开 UI）
- **联网增强**：需要 AI 时再请求你的后端 API（无网则提示/降级）

> 适用系统：Windows 10/11 + Android Studio  
> Web 项目路径：`D:\yyh35\android_project\aigc_application\aigc_application_style\`  
> Android 壳工程路径：`D:\yyh35\android_project\ps2shell\`

### 本机 SDK 路径（Gradle）

Android Studio 会把 SDK 写到壳工程下的 `local.properties`，例如：

```properties
sdk.dir=D\:\\yyh35\\sdk
```

团队其他成员应在 **自己的** `ps2shell/local.properties` 里设置 `sdk.dir`，与 Android Studio → SDK Location 一致。打包或 Gradle 报错 “SDK location not found” 时优先检查此项。

---

## 1. 先在 Web 项目里导出静态资源（生成 `out/`）

1) 打开 PowerShell，进入你的 Web 项目目录：

```bash
cd "D:\yyh35\android_project\aigc_application\aigc_application_style"
```

2) 安装依赖（只需一次）：

```bash
npm install
```

3) **配置静态导出**（只做一次）

你需要在 `next.config.mjs` 中启用导出模式（我们后续会让你保持该配置），典型配置如下：

```js
// next.config.mjs (示例目标)
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
};
export default nextConfig;
```

4) 执行构建并导出（**打 APK 请务必用此命令**，否则 `/_next` 资源在 WebView 里会走错路径，出现样式乱、点不动）：

```bash
npm run build:android
```

`build:android` 会设置 `NEXT_STATIC_ASSET_PREFIX=./`，使脚本与样式引用为 `./_next/...`，与 `WebViewAssetLoader` 的 `/assets/web/` 目录一致。

如果只做网页预览仍可使用 `npm run build`。  
如果 `output: "export"` 生效，构建完成后会生成静态产物目录（通常是 `out/`）。

5) 验证 `out/` 是否存在：

- 你应该能看到 `out\index.html`、`out\_next\` 等文件夹/文件

---

## 2. 在 Android Studio 创建壳工程（Kotlin）

1) 打开 Android Studio  
2) 点击 **New Project**  
3) 选择 **Empty Views Activity**（建议用 Views，最简单稳定）  
4) 配置项目：

- **Name**：例如 `PS2Shell`
- **Package name**：例如 `com.example.ps2shell`
- **Language**：Kotlin
- **Minimum SDK**：建议 `API 24` 或更高（WebView 兼容更好）
- **Save location**：建议放到你的 Android 工程目录，例如：
  - `D:\yyh35\android_project\aigc_application\ps2_android_shell\`

5) 点击 **Finish**，等待 Gradle 同步完成

---

## 3. 把 Web 静态资源拷贝进 Android 工程

### 3.1 推荐目录结构（Assets）

把 `out/` 目录内的所有内容拷贝到 Android 工程的：

```
app/src/main/assets/web/
```

最后应该类似：

```
app/src/main/assets/web/index.html
app/src/main/assets/web/_next/...
app/src/main/assets/web/favicon.ico (如果有)
...
```

### 3.2 拷贝命令（PowerShell 示例，Day 2 标准流程）

假设你的 Android 工程在：
`D:\yyh35\android_project\ps2shell\`

**规则**：打进 APK 的静态资源必须来自 **`npm run build:android`** 生成的 `out/`（含相对路径 `./_next/` 校验）。不要用仅有 `npm run build` 且未设 `NEXT_STATIC_ASSET_PREFIX=./` 的产物，否则 WebView 里会 404 `/_next`，表现为白屏或「纯 HTML 无样式」。

执行：

```powershell
# 1) Web 项目：生成 out/（自动跑 verify-android-export）
cd "D:\yyh35\android_project\aigc_application\aigc_application_style"
npm run build:android

# 2) 清空旧资源，避免残留旧 hash 的 chunk
$assets = "D:\yyh35\android_project\ps2shell\app\src\main\assets\web"
Remove-Item "$assets\*" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $assets -Force | Out-Null

# 3) 全量复制 out/ → assets/web/
Copy-Item -Path ".\out\*" -Destination $assets -Recurse -Force
```

**验收（避免拷错目录）**：复制完成后，`out\index.html` 与 `assets\web\index.html` 的修改时间和内容应一致（可用资源管理器对比时间，或对两文件做 SHA256 比对）。

---

### 3.3 WebView 视口与点击（布局）

若页面**错位**或**点不动**，在壳工程 `MainActivity` 中应开启宽视口与概览模式（本项目已配置）：

- 路径：`ps2shell/app/src/main/java/com/example/ps2shell/MainActivity.kt`
- `WebSettings.useWideViewPort = true`
- `WebSettings.loadWithOverviewMode = true`

加载入口必须为：

`https://appassets.androidplatform.net/assets/web/index.html`

白屏或样式全丢时，用 Chrome 打开 **`chrome://inspect`** → Remote inspect 该 WebView，在 Network 里看是否仍有对 **`/_next`** 的绝对路径请求；若有，回到上文检查是否误用普通 `npm run build` 的 `out/`。

---

## 4. Android 端用 WebViewAssetLoader 离线加载

### 4.1 加依赖（AndroidX WebKit）

打开 Android 工程的 `app/build.gradle`（或 `build.gradle.kts`），加入依赖：

```gradle
dependencies {
  implementation("androidx.webkit:webkit:1.10.0")
}
```

然后点击 Android Studio 顶部提示的 **Sync Now**（或菜单 **File → Sync Project with Gradle Files**）。

### 4.2 AndroidManifest 权限（联网调用 API 需要）

打开 `app/src/main/AndroidManifest.xml`，在 `<manifest>` 内加入：

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

> 离线 UI 不依赖该权限，但你后续调用 `/api/*` 时需要它。

### 4.3 Activity 布局放一个 WebView

`app/src/main/res/layout/activity_main.xml` 示例：

```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="match_parent">

  <WebView
    android:id="@+id/webview"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />

</FrameLayout>
```

### 4.4 MainActivity 配置 WebView + AssetLoader

`app/src/main/java/.../MainActivity.kt` 示例（可直接替换核心逻辑）：

```kotlin
import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.webkit.WebViewAssetLoader

class MainActivity : ComponentActivity() {

  private lateinit var webView: WebView

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)

    webView = findViewById(R.id.webview)

    val assetLoader = WebViewAssetLoader.Builder()
      // 让 WebView 以 https://appassets.androidplatform.net/assets/... 的形式访问 assets
      .addPathHandler(
        "/assets/",
        WebViewAssetLoader.AssetsPathHandler(this)
      )
      .build()

    webView.webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest
      ): WebResourceResponse? {
        return assetLoader.shouldInterceptRequest(request.url)
      }
    }

    webView.settings.javaScriptEnabled = true
    webView.settings.domStorageEnabled = true
    webView.settings.allowFileAccess = false
    webView.settings.allowContentAccess = false

    // 加载你拷贝进 assets/web 的 index.html
    webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
  }

  override fun onBackPressed() {
    if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
  }
}
```

> **本仓库壳工程实况**：`ps2shell` 内为 `AppCompatActivity` 实现，已包含 `useWideViewPort`、`loadWithOverviewMode`、`mixedContentMode` 等与真机布局/触控相关的设置，**`loadUrl` 与上表一致**。新建工程时可参考上例，再对齐 **3.3** 与源码。

---

## 5. 运行验证（必须做完）

### 5.1 离线 UI 验证

1) 关闭模拟器/真机网络（或直接断网）  
2) 在 Android Studio 点击绿色 **Run ▶**  
3) App 打开后应能看到首页 UI，并能进入 `Council` 页面（离线也应可进入 UI 框架）

如果白屏，优先检查：

- `assets/web/index.html` 是否存在
- `loadUrl` 路径是否写对：`https://appassets.androidplatform.net/assets/web/index.html`
- `out/` 是否包含 `_next/` 目录（静态资源是否完整拷贝）

### 5.2 联网 API 验证（AI 功能）

你需要一个可访问的后端地址（例如你自己的服务器，或同局域网可访问的电脑 IP）。

建议做法：

- 在 Web 项目里用环境变量（例如 `NEXT_PUBLIC_API_BASE_URL`）指向你的后端
- **导出静态资源前**就设置好该变量，使前端在 APK 内请求正确的后端

然后：

1) 打开网络  
2) 在 `Council / Mentor` 里触发一次 API 调用  
3) 能返回数据即通过

---

## 6. 常见问题（排障）

### 6.1 Android 里白屏/资源 404

- **原因**：assets 拷贝不全，或 `output export` 没生效，或路径错误，或用了未带 `NEXT_STATIC_ASSET_PREFIX=./` 的构建产物（`/_next` 绝对路径）  
- **处理**：在 Web 根执行 `npm run build:android`，再按 **3.2** 清空并全量覆盖 `assets/web/`

### 6.2 WebView 打不开 JS/状态异常

- 确认开启：
  - `javaScriptEnabled = true`
  - `domStorageEnabled = true`

### 6.3 访问后端失败（联网时）

- 确认 `AndroidManifest.xml` 有 `INTERNET` 权限  
- 确认后端地址在手机上可访问（同网段/公网）  
- 若是 http 明文接口，Android 9+ 默认禁止：需要改成 https 或配置 network security（推荐直接用 https）

---

## 7. 每次更新 Web 代码后的发布流程（最短闭环）

1) Web 项目执行：

```bash
npm run build:android
```

2) 按 **3.2** 清空 `assets/web/` 后，将 `out/**` 全量复制到 `assets/web/`  
3) 壳工程：`.\gradlew.bat assembleDebug`（或在 Android Studio Run）重新安装 APK 验证

---

## 8. AVD（模拟器）稳定性与常见报错

**建议**：在 Android Studio **Device Manager** 中选定一套日常使用的 AVD，把 **AVD Name**、API Level、是否 Google Play 镜像记录在团队 wiki 或本页备注，新同事按同名镜像创建即可复现环境。

**冷启动与 Wipe**：

- 长时间异常时：**Device Manager** → 该 AVD 右侧 **▼** → **Cold Boot Now**（冷启动）。  
- 仍异常：**Wipe Data**（擦除用户数据后相当于新机，需重新安装 Debug APK）。

**常见现象与处理**：

| 现象 | 处理 |
|------|------|
| 模拟器约 5 分钟连不上 / 一直停在启动画面 | 退出 Android Studio；任务管理器结束 `qemu-system-*`、`emulator`、多余 `adb`；或对 AVD **Wipe Data**；换第二套 AVD 镜像 |
| 提示「已是 running process」/ 重复启动冲突 | Run 配置改为部署到 **已在运行的设备**，不要重复 Launch 同名 AVD |
| 仅真机可测 | 开启 USB 调试；同一 `adb install -r app-debug.apk` 流程；HTTP 明文接口需 network security 配置或改用 HTTPS（见 6.3） |

**ADB 路径**：优先使用 SDK 下 `platform-tools\adb.exe`，避免系统目录里过旧的 `adb.exe` 抢占 `5037` 端口。冲突时可：`taskkill /IM adb.exe /F`，再执行 `"%ANDROID_SDK_ROOT%\platform-tools\adb.exe" start-server`（未设置环境变量则写死本机 SDK 路径）。

### Day 2 离线 UI 验收（设备上自查）

在 **飞行模式或关闭 Wi‑Fi** 下冷启动 App，逐项确认：

- 无持续白屏、无明显「无 CSS 的纯 HTML」。  
- 欢迎页主要 CTA、底部或侧栏主导航可切换，至少能进入 **2 个**主界面区域。

