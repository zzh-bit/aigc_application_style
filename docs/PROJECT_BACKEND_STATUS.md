# PS² 项目后端完成情况说明

本文档说明当前仓库 **Next.js App Router 服务端（`app/api/*`）** 已实现的能力、与 **APK / WebView** 的对接方式，以及上线验证方式。适用于已部署到香港服务器并通过域名 `https://api.wdzsyyh.cloud` 对外提供 HTTPS 的场景。

---

## 1. 部署与基础设施（已完成项）

| 能力 | 说明 |
|------|------|
| 运行形态 | 服务器使用 **`npm run build:server` + `next start`**（Node 生产模式），**不是** `build:android` 静态导出。 |
| 进程守护 | 推荐使用 **PM2** 托管（进程名示例：`ps2-api`），`exec cwd` 须为应用根目录（如 `/srv/ps2-api`）。 |
| 反向代理 | **Nginx** 监听 `80/443`，将流量反代到本机 **`127.0.0.1:3000`**。 |
| TLS | **Let’s Encrypt（certbot）** 为 `api.wdzsyyh.cloud` 签发证书；HTTP 自动跳转 HTTPS（由 certbot `--redirect` 配置）。 |
| 健康检查 | `GET /api/health` 返回 JSON：`ok`、`service: ps2-api`、`now`（ISO 时间）。 |
| CORS（APK） | 已为 Android WebView 来源 **`https://appassets.androidplatform.net`**（及同源 http 变体）配置跨域；预检 `OPTIONS` 正常。 |

---

## 2. 环境变量（服务端，勿写入 APK）

在服务器环境或 PM2 配置中需要（示例名称，具体以你部署为准）：

- **`DEEPSEEK_API_KEY`**：调用大模型时使用（勿提交到 Git、勿打进前端包）。
- **`DEEPSEEK_BASE_URL`**（可选）：默认兼容 DeepSeek OpenAI 风格接口。
- **`DEEPSEEK_MODEL`**（可选）：如 `deepseek-chat`。
- 其余限流、对话长度等：见仓库内 `PS2_*` 等变量（若你在 `.env.local` 中配置，服务器侧可同步）。

客户端（静态导出 APK）仅通过 **`NEXT_PUBLIC_API_BASE_URL`** 指向上述 HTTPS 域名，**不包含任何模型 Key**。

---

## 3. 已实现 API 一览

以下路由均在 `app/api/` 下，均已配合 CORS，供 **APK 内 fetch** 或 **浏览器** 在正确 Origin 下调用。

| 路径 | 方法 | 作用摘要 |
|------|------|----------|
| `/api/health` | `GET`, `OPTIONS` | 存活探测与时间戳。 |
| `/api/chat` | `POST`, `OPTIONS` | 主聊天；支持流式与非流式；在配置 `DEEPSEEK_API_KEY` 时走在线模型，否则有降级逻辑（见实现）。 |
| `/api/emotion` | `POST`, `OPTIONS` | 情绪相关（文本规则等，供前端仪表盘/议会联动）。 |
| `/api/summarize` | `POST`, `OPTIONS` | 文本摘要（当前为 **mock 规则摘要**，非大模型长文理解）。 |
| `/api/council/debate` | `POST`, `OPTIONS` | 决策议会多角色辩论；在服务端聚合多角色回复（可调用 DeepSeek）。 |
| `/api/council/archive` | `POST`, `OPTIONS` | 将本轮议会对话 **归档到服务器磁盘**（`data/council-chat-archives.json`，相对进程 `cwd`）。 |
| `/api/insights` | `GET`, `OPTIONS` | 基于已归档数据生成 **成长洞察** 类统计（读上述 JSON）。 |
| `/api/projection` | `POST`, `OPTIONS` | 叙事推演 / 分支结构；实现中含 **可选 DeepSeek** 增强路径（无 Key 时有结构化降级，见代码）。 |

---

## 4. 与 Android APK 的对接（已完成项）

| 项 | 说明 |
|----|------|
| 前端 API 基址 | 构建 APK 时通过 **`.env.production`** 注入 `NEXT_PUBLIC_API_BASE_URL=https://api.wdzsyyh.cloud`。 |
| 请求路径 | 业务代码使用相对路径 `/api/...`，由 `lib/api-client.ts` 在运行时拼接到上述基址。 |
| WebView 壳 | `android/ps2-shell` 通过 `WebViewAssetLoader` 加载离线静态资源；**API 请求**在检测到 `appassets.androidplatform.net` 时走 **`http://127.0.0.1:37123` 回环代理**（`ApiLoopbackProxy` + OkHttp 固定 IPv4 连 `https://api.*`），避免手机 DNS 污染；浏览器 / 非该域名仍用 `NEXT_PUBLIC_API_BASE_URL`。 |
| 换服务器 IP | 修改 `android/ps2-shell/app/build.gradle.kts` 中 `PS2_API_PINNED_IPV4`，并与 `lib/api-client.ts` 的 `PS2_LOOPBACK_PROXY_PORT`（默认 `37123`）及 `BuildConfig.PS2_LOOPBACK_PROXY_PORT` 保持一致。 |
| 屏幕方向 | `MainActivity` 在 `AndroidManifest.xml` 中设置 **`android:screenOrientation="landscape"`**，进入应用强制横屏。 |

---

## 5. 本地/CI 验证命令

在项目根目录（Windows PowerShell）：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-phone-api.ps1 -ApiBaseUrl "https://api.wdzsyyh.cloud"
```

期望：`GET /api/health`、`OPTIONS /api/chat`、`POST /api/chat` 均为 `[OK]`。

重新打包并安装到已连接 USB 调试的手机：

```powershell
npm run rebuild
```

脚本会优先选择 **USB 真机**（在同时连接模拟器时排除 `emulator-*`）。

---

## 6. 数据与持久化说明

- **议会归档**：写入服务器 **`data/council-chat-archives.json`**（需保证进程对应用目录有写权限；备份与迁移时请包含该文件）。
- **记忆锚点 / 信件 / 本地设置**：主要仍在前端 **IndexedDB / localStorage**（见 `lib/storage.ts`），与服务器归档是不同维度；完整「云端记忆 RAG」若未单独部署向量库，则当前仓库仍以客户端与上述归档为主。

---

## 7. 已知边界与后续可增强点（非「未完成」清单，仅供产品预期对齐）

- `/api/summarize` 为 **mock 级**摘要，若需真 RAG/长文摘要，需扩展实现或接模型。
- 归档为 **单机 JSON 文件**；多实例部署需改为共享存储或数据库。
- 域名 DNS 须指向实际运行 Nginx 的服务器；若使用 CDN/代理，证书申请阶段需保证 **HTTP-01 校验** 可达或改用 DNS-01。

---

## 8. Android WebView 真机「网络连接失败」排查（已实现于工程）

若真机提示「网络连接失败」而后端 `curl`/脚本验证正常，常见原因与当前仓库对策如下：

| 原因 | 对策 |
|------|------|
| `shouldInterceptRequest` 将公网 `https://api…` 误交给 `WebViewAssetLoader` | `MainActivity` 中对 **非** `appassets.androidplatform.net` 的请求 **直接 `return null`**，由系统网络栈发起 HTTPS。 |
| 离线页使用 `http://appassets…` 与文档/安全策略不一致 | 入口改为 **`https://appassets.androidplatform.net/assets/web/index.html`**。 |
| 导师聊天使用 SSE + `ReadableStream`，部分 WebView 抛 `TypeError` 被误判为网络错误 | `mentor-chat` 对 `/api/chat` 使用 **`stream: false`**，走一次性 JSON 响应。 |
| `fetch` 未显式声明跨域模式 | `lib/api-client.ts` 中为请求增加 **`mode: "cors"`、`credentials: "omit"`、`cache: "no-store"`**。 |
| 手机 DNS 把 `api.*` 解析到**错误 IP**（PC `nslookup`/公网 DNS 为 A，手机为 B；`curl` 报 `Connection refused`） | 在手机 Wi‑Fi 上改 DNS 为 **`223.5.5.5` / `223.6.6.6`** 或开启 **私人 DNS**（如 `one.one.one.one`、`dns.alidns.com`）；并到域名控制台确认 **`api` 子域只有正确 A 记录**、去掉陈旧记录。可用 `adb shell` 执行 `curl --resolve api.wdzsyyh.cloud:443:正确IP https://api.wdzsyyh.cloud/api/health` 对比验证。 |

---

## 9. 文档修订记录（摘要）

- **2026-04-10**：补充 HTTPS 域名 `api.wdzsyyh.cloud`、Nginx + Let’s Encrypt、`verify-phone-api` 与 `npm run rebuild` 真机安装流程说明。
- **2026-04-10**：补充 Android WebView 网络与流式请求相关修复说明。
- **2026-04-10**：补充真机「DNS 解析错误 IP 导致 Connection refused」排查与 `curl --resolve` 验证说明。
- **2026-04-10**：补充 **MainActivity 强制横屏**；汇总类文档见 **`docs/PS2_COMPLETED_WORK.md`**。
