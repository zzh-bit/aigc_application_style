# 手机端 AI 对话“网络无法连接”0 基础实操手册

本文是可直接照做的执行版，目标是让你在 Android 真机上稳定跑通 `AI 对话`。

## 1. 先确认一件最关键的事

`NEXT_PUBLIC_API_BASE_URL` 是构建时写死到 APK 前端资源里的。

这意味着：
- 你改了环境变量后，必须重新构建 Web 并重新打包 APK。
- 仅修改手机设置或只重启 App，不会生效。

## 2. 第 0 步（5 分钟）：检查基础配置

1. 打开 `.env.production`，确认：
   - `NEXT_PUBLIC_API_BASE_URL=https://你的后端域名`
2. 不要使用这些值作为真机最终配置：
   - `http://10.0.2.2:xxxx`（只适合模拟器）
   - 本机 localhost 地址
3. 建议优先 HTTPS 域名，避免 Android 明文网络策略影响。

## 3. 第 1 步（10 分钟）：先验证后端是否可达

新增了一个健康检查接口：`GET /api/health`。

先在电脑执行：

```powershell
npm run verify:phone-api
```

或指定你的地址：

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/verify-phone-api.ps1 -ApiBaseUrl "https://your-domain.com"
```

该脚本会连续检查：
- `GET /api/health`（后端是否在线）
- `OPTIONS /api/chat`（CORS 预检是否通过）
- `POST /api/chat`（聊天链路是否可用）

只要这 3 项不是 2xx，先修后端，不要急着重打 APK。

## 4. 第 2 步（10 分钟）：检查 CORS（真机 WebView 必做）

真机 WebView 的页面 Origin 是：
- `https://appassets.androidplatform.net`

后端必须允许这个 Origin。

本项目统一 CORS 逻辑在 `app/api/_cors.ts`，已经放行该 Origin。

如果你把 API 独立部署到其它服务，也要同步以下规则：
- Allow-Origin：`https://appassets.androidplatform.net`
- Allow-Methods：`GET,POST,OPTIONS`
- Allow-Headers：`Content-Type, Authorization`
- OPTIONS 预检返回 200/204

## 5. 第 3 步（5 分钟）：Android 网络策略

已新增：
- `android/ps2-shell/app/src/main/res/xml/network_security_config.xml`
- `AndroidManifest.xml` 的 `android:networkSecurityConfig`

作用：
- 当你临时使用 HTTP 或某些 ROM 对网络策略更严格时，提供兜底。

生产建议仍是：
- 后端统一 HTTPS，尽量不依赖明文策略。

## 6. 第 4 步（15~25 分钟）：重新构建并安装

按顺序执行（不要跳）：

```powershell
npm run build:android
npm run sync:android
```

然后进入 Android 工程构建 APK（或用一键脚本）：

```powershell
npm run rebuild:export:apk
```

建议安装前先卸载旧包，避免缓存旧静态资源。

## 7. 第 5 步（真机验证）

最少做 3 次对话验证：
1. 打开 App，进入 AI 对话页。
2. 连续发送 3 个问题。
3. 每次都要确认有回复返回，不是离线 fallback。

同时验证两个接口链路：
- 议会：`/api/council/debate`
- 情绪：`/api/emotion`

## 8. 失败时怎么判因（最常用）

- `网络连接失败/Failed to fetch`：
  - API 地址不通、CORS、证书/TLS、HTTP 明文策略。
- `404`：
  - 前端还在请求同源 `/api/*`，通常是 baseUrl 没打进新包。
- `429`：
  - 后端限流，先降频再测。
- `5xx`：
  - 后端服务异常。

## 9. 新增的调试能力（你可以直接用）

1. 前端会输出最终请求地址日志（方便确认实际打到哪里）：
   - 代码：`lib/api-client.ts`
2. WebView 增加了错误日志：
   - 代码：`android/.../MainActivity.kt`
   - 可用 `adb logcat | findstr PS2WebView` 查看
3. 新增健康接口：
   - `app/api/health/route.ts`

## 10. 最终验收标准

满足以下全部条件即可认为问题关闭：
- `npm run verify:phone-api` 三项检查通过
- 真机安装新 APK 后，AI 对话连续 3 次成功
- 无“网络无法连接”通用报错
- 错误出现时能从日志区分是 CORS、HTTP 状态、还是证书/网络问题
