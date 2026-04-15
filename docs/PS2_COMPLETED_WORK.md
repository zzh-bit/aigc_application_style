# PS²（Parallel Self 2.0）已完成工作汇总

本文档整理当前阶段**已落地**的后端部署、Android 壳工程、联网与体验类改动，便于交接与后续迭代。更细的后端接口与运维说明见同目录下的 [`PROJECT_BACKEND_STATUS.md`](./PROJECT_BACKEND_STATUS.md)。

---

## 1. 云端 API 与部署

- **运行方式**：服务器使用 **`npm run build:server` + `next start`**（Node 生产模式），经 **Nginx** 反代至 **`127.0.0.1:3000`**，**HTTPS**（如 Let’s Encrypt）对外提供服务。
- **域名示例**：`https://api.wdzsyyh.cloud`（以你实际域名为准）。
- **健康检查**：`GET /api/health`。
- **密钥**：`DEEPSEEK_API_KEY` 等仅配置在服务端环境 / PM2，**不写入 APK、不提交 Git**。
- **客户端基址**：静态 Web / APK 通过 **`NEXT_PUBLIC_API_BASE_URL`**（如 `.env.production`）指向上述 HTTPS 域名；业务代码统一走相对路径 `/api/*`，由 `lib/api-client.ts` 拼接。

已实现的主要路由包括：`/api/chat`、`/api/council/debate`、`/api/council/archive`、`/api/emotion`、`/api/insights`、`/api/projection`、`/api/summarize`、`/api/health` 等（详见 `PROJECT_BACKEND_STATUS.md`）。

---

## 2. Android APK（WebView 壳）

### 2.1 工程位置

- 壳工程：**`android/ps2-shell`**，`applicationId`：`com.ps2.shell`。
- 离线资源：**`app/src/main/assets/web/`**，由脚本将 Next **`out/`** 同步而来（见 `scripts/sync-web-to-android-assets.ps1`）。

### 2.2 资源加载与公网请求

- 使用 **`WebViewAssetLoader`**，入口 **`https://appassets.androidplatform.net/assets/web/index.html`**。
- **`shouldInterceptRequest`**：仅拦截 `appassets.androidplatform.net`；**公网 API 域名必须 `return null`**，由系统网络栈发起 HTTPS，避免误走 AssetLoader。

### 2.3 手机 DNS 污染与回环代理（已解决「能连 PC 不能连手机」类问题）

- 现象：部分网络下手机将 `api.*` 解析到**错误 IP**，导致 WebView 内请求失败。
- 方案：
  - **`ApiLoopbackProxy`**（NanoHTTPD + OkHttp）：监听 **`127.0.0.1:37123`**，将 `/api/*` 转发到 **`https://<PS2_API_FORWARD_HOST>`**，并用 **`PS2_API_PINNED_IPV4`** 做固定 IPv4 解析，TLS 仍校验证书域名。
  - **`lib/api-client.ts`**：在 **`appassets.androidplatform.net`** 下优先使用 **`http://127.0.0.1:37123`** 作为 API 基址。
- 配置位置：**`android/ps2-shell/app/build.gradle.kts`** 的 `buildConfigField`；端口须与 TS 中 **`PS2_LOOPBACK_PROXY_PORT`**（默认 `37123`）一致。
- WebView **`mixedContentMode`**：**`MIXED_CONTENT_ALWAYS_ALLOW`**（HTTPS 离线页访问 HTTP 本机代理）。

### 2.4 强制横屏（当前需求）

- 在 **`AndroidManifest.xml`** 的 `MainActivity` 上设置 **`android:screenOrientation="landscape"`**，进入应用即锁定横屏。
- **`configChanges`** 补充 **`screenLayout|smallestScreenSize`**，减少配置变更时的非必要重建。

### 2.5 CORS

- 服务端 **`app/api/_cors.ts`** 已允许 WebView 来源（含 `https://appassets.androidplatform.net`），与前端 **`fetch` 的 `mode: "cors"`、`credentials: "omit"`** 配合使用。

---

## 3. 前端体验与数据逻辑（近期迭代）

### 3.1 叙事推演 · 决策树

- **`components/council/decision-path.tsx`**：放大树形整体比例、分支展开与端点标签，加粗路径与点击热区；单分支时避免角度除零。
- **`components/council/projection-view.tsx`**：为树形区域增加 **最小高度**（如 `min-h-[46vh]` / sm 下更高），避免竖屏或窄屏下树被压得过扁。

### 3.2 数据洞察 · 决策主题与情绪

- **`app/api/insights/route.ts`**：
  - **决策主题**：按**归档场次**统计——同一归档记录内同一关键词只计一次，再跨场次汇总，并返回占比；避免单条长对话刷高词频。
  - **情绪分布百分比**：按**全部情绪标签条数**归一，与条形图、偏见卡片中的焦虑/平静描述一致。
- **`components/council/data-insights.tsx`**：主题区展示「场数 + 百分比 + 条形图」，并附简短统计说明。

### 3.3 记忆库 · 返回议会

- **`components/council/memory-vault.tsx`**：左上角「返回议会」**下移**（含 **safe-area**）、**加大触控区域**与视觉反馈，避免贴顶难点击。

---

## 4. 构建与安装命令（Windows / PowerShell）

在项目根目录：

```powershell
# 静态导出 Web 并同步到 Android assets，再编 debug APK（不自动安装）
npm run build:android
powershell -ExecutionPolicy Bypass -File .\scripts\sync-web-to-android-assets.ps1
cd android\ps2-shell
.\gradlew.bat assembleDebug
```

一键导出、同步、编 APK、可选安装到已连接设备：

```powershell
cd <项目根>
npm run rebuild
# 或仅编包不安装：npm run rebuild:export:apk
```

产物路径示例：

- **`android/ps2-shell/app/build/outputs/apk/debug/app-debug.apk`**
- 备份拷贝：**`apk-exports/ps2-app-debug-<时间戳>.apk`**（若使用 `rebuild-export-apk.ps1` 脚本）

验证公网 API（本机）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-phone-api.ps1 -ApiBaseUrl "https://api.wdzsyyh.cloud"
```

---

## 5. 关键文件索引

| 区域 | 路径 |
|------|------|
| API 基址与 WebView 回环 | `lib/api-client.ts` |
| 本地 API 代理（Kotlin） | `android/ps2-shell/app/src/main/java/com/ps2/shell/ApiLoopbackProxy.kt` |
| WebView 与代理启动 | `android/ps2-shell/app/src/main/java/com/ps2/shell/MainActivity.kt` |
| 横屏与权限 | `android/ps2-shell/app/src/main/AndroidManifest.xml` |
| 代理 / 固定 IP 配置 | `android/ps2-shell/app/build.gradle.kts`（`PS2_*` BuildConfig） |
| 洞察统计 | `app/api/insights/route.ts` |
| 决策树 UI | `components/council/decision-path.tsx`、`projection-view.tsx` |
| 记忆库返回 | `components/council/memory-vault.tsx` |
| 议会归档 | `lib/server/council-archive.ts`、`data/council-chat-archives.json`（服务器运行时） |

---

## 6. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-04-10 | 汇总后端、APK、DNS 回环代理、决策树/洞察/记忆库改动；**MainActivity 强制横屏**；构建 APK 流程写入本文档。 |
| 2026-04-10 | **叙事推演**决策树区域高度 **`60dvh`（约 3/5 视口）**；`/api/emotion` 多组词加权 + 否定/语气微调；议会 **MoodIndicator** 同步快乐/兴奋/难过并渐衰回平静。 |
