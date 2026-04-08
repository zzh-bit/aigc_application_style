# PS²（Parallel Self 2.0）Web 应用功能清单与「网页 → 软件」打包总计划

> 文档目的：一次性说明 **Web 端全部规划/已实现能力**，以及将 **完整网页静态产物打包为 Android 应用（APK）** 的可靠流程、验收标准与风险边界。  
> 依据：`function.md`、`structure.md`、`plan.md` 与当前仓库实现（Next.js + 独立壳工程 `ps2shell`）。

---

## 一、产品定位与架构全景

| 层级 | 作用 |
|------|------|
| **Web 前端** | Next.js（App Router），单页式状态路由：`PS2App` 切换欢迎页 / 议会 / 记忆 / 导师 / 信件 / 洞察等。 |
| **BFF / API（开发或部署时）** | `app/api/*`：聊天、情绪、摘要、议会辩论与归档等；AI Key **仅服务端环境变量**。 |
| **本地持久化** | `lib/storage.ts`（IndexedDB / localStorage）：设置、记忆、信件等离线数据。 |
| **Android 壳** | Kotlin + WebView + **WebViewAssetLoader**：`assets/web/` 内嵌 `next build` 导出的静态站点；联网时请求真实后端 API。 |

**一句话**：UI 与静态逻辑进 APK；**大模型与动态 API** 需依赖你可访问的 **部署后 BFF**（或同机局域网服务），通过环境变量把前端请求指过去。

---

## 二、Web 应用功能全清单（目标能力 vs 工程映射）

以下按 `function.md` 的五大类归纳；括号内为代码/目录锚点，便于对照实现与排期。

### 1. 多维决策支持

| 功能 | 说明 | 主要落点 |
|------|------|----------|
| **决策议会** | 激进 / 保守 / 未来 / 主持人 多角色模拟辩论与总结 | `components/council/council-main.tsx`，`app/api/council/debate/route.ts` |
| **导师智库** | 虚拟导师列表与独立聊天 | `mentor-library.tsx`，`mentor-chat.tsx`，流式 `app/api/chat/route.ts`（规划中有独立 `mentor` 路由收口） |

### 2. 个性化数据融合

| 功能 | 说明 | 主要落点 |
|------|------|----------|
| **记忆锚点** | 个人材料入库、检索、摘要，向议会/导师提供上下文 | `memory-vault.tsx`，`memory-fragment.tsx`，`lib/storage.ts`；规划：`lib/rag/memory-retriever.ts` |
| **情绪感知** | 文本规则版情绪识别；高焦虑可触发冥想引导 | `app/api/emotion/route.ts`，`breathing-guide.tsx`，`mood-indicator.tsx`；声纹为规划增强 |

### 3. 时空对话系统

| 功能 | 说明 | 主要落点 |
|------|------|----------|
| **未来信件** | 写信、收信、触发与提醒 | `future-letters.tsx`；规划：`app/api/letters/*` |

### 4. 可视化决策引擎

| 功能 | 说明 | 主要落点 |
|------|------|----------|
| **叙事推演** | 决策路径可视化与对比 | `projection-view.tsx`，`decision-path.tsx`，`app/api/projection/route.ts` |
| **决策树探索** | 可交互路径 / 时间河（与推演数据联动） | 同上组件族；数据以 API + 本地状态扩展 |

### 5. 核心体验与系统

| 功能 | 说明 | 主要落点 |
|------|------|----------|
| **统一界面** | 深色玻璃态、欢迎页、主导航 | `welcome-screen.tsx`，`ps2-app.tsx`，`nebula-background.tsx` |
| **成长洞察** | 统计与 AI 总结类报告 | `data-insights.tsx`，`app/api/insights/route.ts`（静态导出下为已存在的 insights 页能力） |
| **深度定制** | 议会强度、回复风格、阈值、隐私与通知等 | `lib/app-settings.ts`，与 `ps2-app` 内设置流；可扩展独立设置中心页 |

**数据模型（统一类型）**：`lib/types/domain.ts` — `Conversation`、`DecisionRecord`、`MemoryItem`、`MentorSession`、`Letter`、`InsightReport` 等。

---

## 三、「完整网页 → 软件（APK）」打包总目标

### 3.1 交付定义

- **离线**：安装 APK 后 **无需网络** 可打开主 UI、浏览已缓存的本地数据（IndexedDB 等在 WebView 内可用）。
- **在线增强**：配置了 `NEXT_PUBLIC_API_BASE_URL` 的构建 **指向可访问后端** 时，议会、聊天、情绪等接口可用。
- **安全**：不在 APK 或前端硬编码 AI Key；密钥仅存服务器环境变量。

### 3.2 关键约束（必读）

1. **静态导出不等于带 Node API**  
   `output: "export"` 生成的 `out/` **不包含** 运行时的 `app/api/*` 服务。APK 内只能跑**静态文件**；所有 `/api/*` 请求必须发往 **你部署的 BFF**（或开发机+局域网 IP）。

2. **资源路径必须与 WebViewAssetLoader 一致**  
   页面加载地址为：  
   `https://appassets.androidplatform.net/assets/web/index.html`  
   因此构建 **必须** 使用相对资源前缀 `./_next/...`（见下文 `build:android`），否则会出现 **样式错乱、无法点击**（脚本/CSS 404）。

---

## 四、标准打包流水线（逐步执行）

### 阶段 A：Web 静态产物（带自检）

在 Web 工程根目录执行：

```bash
cd /path/to/aigc_application_style
npm install
npm run build:android
```

- `build:android` = 设置 `NEXT_STATIC_ASSET_PREFIX=./` + `next build` + **`scripts/verify-android-export.mjs`**（校验 `out/index.html` 无 `"/_next/` 绝对路径").
- **禁止**用普通 `npm run build` 的产物直接拷贝进 APK（会通过校验，但资源路径错误，APK 必挂）。

### 阶段 B：联调环境变量（联网 AI）

在构建前于 `.env.local`（或 CI 环境）配置：

```env
NEXT_PUBLIC_API_BASE_URL=https://你的域名或https://192.168.x.x:端口
```

- 导出时该值会打进前端bundle；**重新 `build:android` 后**再拷贝 `out/`。
- 勿使用 `localhost` 作为手机上的地址（除非用 `adb reverse` 等特殊桥接）。

### 阶段 C：拷贝到 Android 壳工程

将 **`out/` 目录下全部内容** 覆盖到壳工程：

```text
ps2shell/app/src/main/assets/web/
```

示例（PowerShell）：

```powershell
$webOut = "D:\yyh35\android_project\aigc_application\aigc_application_style\out"
$assets = "D:\yyh35\android_project\ps2shell\app\src\main\assets\web"
Remove-Item "$assets\*" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Copy-Item -Path "$webOut\*" -Destination $assets -Recurse -Force
```

### 阶段 D：编译 APK

在壳工程目录：

```powershell
cd D:\yyh35\android_project\ps2shell
.\gradlew.bat clean assembleDebug
```

- **Debug APK** 路径：`app/build/outputs/apk/debug/app-debug.apk`
- **发布版**：需配置 `signingConfig`、混淆策略等（本计划不展开密钥管理，按团队规范执行）。

### 阶段 E：安装与冒烟

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

**验收检查项**：

| 序号 | 检查项 | 期望 |
|------|--------|------|
| 1 | 断网打开应用 | 主界面、导航可进入，无整页白屏 |
| 2 | 联网 + 正确 `NEXT_PUBLIC_API_BASE_URL` | 至少一条核心链路（如议会或聊天）可返回内容 |
| 3 | 浏览器远程调试（可选） | Chrome `chrome://inspect` 查看有无 404（尤其 `./_next`） |

---

## 五、壳工程侧技术要点（与显示/触控相关）

- **加载 URL**：`https://appassets.androidplatform.net/assets/web/index.html`
- **WebViewAssetLoader**：`.addPathHandler("/assets/", AssetsPathHandler(this))`，映射至 `assets/` 根下的 `web/` 目录。
- **推荐 WebSettings**：`javaScriptEnabled`、`domStorageEnabled`、`useWideViewPort`、`loadWithOverviewMode`、混合内容策略按后端协议调整。
- **返回键**：使用 `OnBackPressedDispatcher` + WebView `canGoBack()`，兼容手势返回。

详细操作说明见同目录：`ANDROID_STUDIO.md`。

---

## 六、质量门禁与回归清单

每次发版前建议固定执行：

| 步骤 | 命令 / 动作 |
|------|-------------|
| Web Lint | `npm run lint` |
| Android 构建 | `.\gradlew.bat assembleDebug` |
| 静态导出合法性 | 仅通过 `npm run build:android`（含 verify 脚本） |
| 手测 | 欢迎页 → Council / Memory / Mentor 等主导航；断网+联网各一轮 |

---

## 七、功能演进与文档维护（与 `plan.md` 对齐）

中长期在 Web 侧按计划补齐：

- 正式 **RAG** 检索模块、`mentor` 独立 API、`letters` 触发与送达、insights 指标库等（见 `structure.md` 目标结构）。
- Android 侧可选：**分享/导出 JSON、通知、文件选择器** 等原生增强（`plan.md` 发布阶段）。

本文件侧重 **「功能全景 + 打包通路」**；逐日任务拆解仍以 `plan.md` 为准。

---

## 八、附录：若需「其他形态软件」

| 形态 | 说明 |
|------|------|
| **PWA** | 同一代码库可侧重 `manifest` + Service Worker（与当前 Next export 策略需单独评估）。 |
| **桌面封装（Tauri / Electron）** | 仍可用静态 `out/` + 系统 WebView/Chromium；API 指向同源或本地后端。 |
| **iOS WKWebView** | 思路同 Android：内置 www + 自定义 scheme/路径映射。 |

---

**文档路径**：`docs/WEB_APP_FEATURES_AND_PACKAGING_PLAN.md`  
**最后建议**：任何「拷贝进 APK 」的 `out/`，**必须**来自 `npm run build:android`，否则不要交付测试，避免重复踩「页面乱、点不动」的问题。
