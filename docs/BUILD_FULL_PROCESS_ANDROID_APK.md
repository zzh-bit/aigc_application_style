# Web（Next.js）→ Android APK 构建全过程

本文档描述：如何把本项目的 Next.js Web 应用构建为 **静态导出**，并使用 **Android Studio WebView 壳**打包成 APK；同时说明“路线2（独立后端 API）”下的联调方式与常见坑位。

> 约定：本仓库为 Web 工程；Android 壳工程目录在 `D:\yyh35\android_project\ps2shell`（按你的本机路径为准）。

## 前置条件

- **Node.js**：建议 18+（与 Next.js 版本匹配）
- **Android Studio + SDK**：可正常运行 Emulator 或连接真机
- **adb**：能在命令行使用
- **依赖安装**

```bash
npm install
```

## 路线选择说明（关键）

本项目使用 Next.js 的 `output: "export"` 做静态导出，因此：

- **`app/api/*` 这类 Next.js Server API 路由在静态导出里不会存在**
- 若 APK 内是离线打开静态页面，则 `/api/*` 会 404

因此选择 **路线2：独立后端 API**：

- 前端代码仍然调用 `/api/*`
- 运行时通过 `NEXT_PUBLIC_API_BASE_URL` 把这些请求指向“独立后端”

## 配置环境变量（路线2：独立后端 API）

在 Web 工程的 `.env.local` 添加（示例：模拟器访问宿主机 dev server）：

```env
NEXT_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
```

- `10.0.2.2` 是 Android 模拟器访问宿主机 `localhost` 的固定地址
- 若你使用线上后端，则改为 `https://your-domain.com`

## Web 静态导出（为 Android 打包准备）

执行 Android 专用构建脚本：

```bash
npm run build:android
```

预期结果：

- 生成静态站点目录：`out/`
- `scripts/verify-android-export.mjs` 会做导出校验（例如资源路径等）

## 静态资源同步到 Android 壳工程

Android 壳工程使用 `WebViewAssetLoader` 从 `assets/` 里加载页面资源。

### 1）拷贝导出产物

把 Web 工程的 `out/` 内容复制到：

- `ps2shell/app/src/main/assets/web/`

### 2）处理 `_next` 目录（非常关键）

某些 Android 构建链对 `assets/` 下以下划线开头目录（如 `_next`）的打包行为不稳定，可能导致 WebView 加载静态资源 404。

本项目采用的策略是：

- 构建/同步阶段把 `out/_next` **重命名为** `out/next`
- Android 侧对请求路径做映射：`/assets/web/_next/...` → `assets/web/next/...`

对应原生端实现位置：

- `ps2shell/app/src/main/java/.../MainActivity.kt`

## Android 壳工程设置

### 1）允许网络访问（路线2需要）

确认 `AndroidManifest.xml` 内具备：

- `<uses-permission android:name="android.permission.INTERNET" />`
- 若后端是 HTTP（非 HTTPS），需要 `android:usesCleartextTraffic="true"`

### 2）WebViewAssetLoader 路径

壳工程应将入口页面指向类似：

- `https://appassets.androidplatform.net/assets/web/index.html`

并通过 `WebViewAssetLoader` 把 `/assets/` 映射到 `assets/` 目录。

## 生成 APK（Debug）

在 `ps2shell` 工程目录执行：

```bash
./gradlew assembleDebug
```

产物通常在：

- `ps2shell/app/build/outputs/apk/debug/app-debug.apk`

## 安装到模拟器/真机

```bash
adb install -r "ps2shell/app/build/outputs/apk/debug/app-debug.apk"
```

如需要查看日志（推荐）：

```bash
adb logcat
```

## 开发联调（推荐流程）

### 1）启动独立后端（示例：宿主机 Next dev）

在 Web 工程执行：

```bash
npm run dev
```

### 2）在 APK 内发起 `/api/*` 请求

前端会把 `/api/*` 自动解析为：

- `NEXT_PUBLIC_API_BASE_URL + "/api/*"`

从而让静态导出 + WebView 仍能正常调用后端 API。

## 常见问题排查

### 1）APK 白屏/样式错乱

Android WebView 对部分现代 CSS（例如 `oklch()`）支持不稳定。项目已在 `app/globals.css` 提供 HEX fallback + `@supports` 覆盖。

### 2）静态资源 404（`/_next/...`）

优先检查：

- `assets/web/next/` 是否存在（而不是 `assets/web/_next/`）
- `MainActivity.kt` 的 `_next → next` 映射是否仍在

### 3）API 请求失败

优先检查：

- `.env.local` 是否设置了 `NEXT_PUBLIC_API_BASE_URL`
- 后端是否允许 CORS（WebView 的 origin 可能不是标准 http(s) origin）
- 是否因为明文 HTTP 被禁止（需要 `usesCleartextTraffic` 或改用 HTTPS）

