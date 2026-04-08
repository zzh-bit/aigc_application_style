# 真机有网但仍显示“无法连接网络”——可能原因与修改建议

适用场景：本项目 **Next.js 静态导出（`output: "export"`）** + **Android WebView 壳（`WebViewAssetLoader`）** + **Route2 独立后端 API**。

你在手机端“明明有网络，但应用内仍提示网络连接失败”，通常不是“手机没网”，而是 **WebView 发起的 API 请求无法到达后端** 或 **被安全策略/CORS 拦截**。下面按优先级给出排查与可落地修改方案。

---

## 0. 先确认你的 APK 现在到底在请求哪个后端

本项目 Route2 的关键点是：前端把 `/api/*` 改写为 `NEXT_PUBLIC_API_BASE_URL + /api/*`。

### 常见误区

- 你曾在 `.env.local` 里配置过：
  - `NEXT_PUBLIC_API_BASE_URL=http://10.0.2.2:3000`
- **`10.0.2.2` 只对 Android 模拟器有效**，真机上它不是你的电脑。
- 因此真机一定会请求失败，进而显示“网络连接失败”。

### 修改建议（最直接）

- 真机要么指向 **公网域名**：
  - `NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com`
- 要么指向 **同一局域网内可访问的电脑 IP**（手机和电脑同 Wi-Fi）：
  - `NEXT_PUBLIC_API_BASE_URL=http://192.168.x.x:3000`
  - 并确保你电脑的防火墙允许该端口对局域网开放。

> 注意：`NEXT_PUBLIC_*` 变量会被打进前端 bundle，**必须在打包 APK 前设置正确**，仅改手机环境不会生效。

---

## 1) CORS 被拦截（最常见的“有网但报错”）

你的 WebView 页面来源是：

- `https://appassets.androidplatform.net/assets/web/index.html`

这意味着前端发请求到你的独立后端时，会带一个 **跨域 Origin**（通常就是 `https://appassets.androidplatform.net`）。

如果后端没有放行该 Origin（或没有正确处理 preflight），浏览器/ WebView 会直接拦截，前端就会认为“网络失败”。

### 你需要后端做什么

在后端 CORS 中至少放行：

- **Origin**：`https://appassets.androidplatform.net`
- **Methods**：`GET,POST,OPTIONS`
- **Headers**：`Content-Type, Authorization`（以及你实际使用的自定义 Header）
- **Credentials**：如果你用 cookie/session，需要 `Access-Control-Allow-Credentials: true` 且不能用 `*`

### 修改建议（后端）

- 若后端是 Node/Express：配置 CORS allowlist（不要只写 `localhost`）。
- 若后端是 Nginx：补全 `OPTIONS` 返回与 `Access-Control-Allow-*`。

### 如何验证（真机）

用 `adb logcat` 看 WebView 控制台是否出现类似：

- `Access to fetch at ... from origin ... has been blocked by CORS policy`

---

## 2) HTTP 明文被禁止 / Mixed content 被阻止

如果你的 `NEXT_PUBLIC_API_BASE_URL` 是 `http://...`（明文），Android 9+ 默认可能阻止明文流量。

你已做过：

- `AndroidManifest.xml`：`android:usesCleartextTraffic="true"`
- `MainActivity.kt`：`mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE`

但在某些 ROM/策略下仍可能需要 **Network Security Config** 指定允许的域名。

### 修改建议（Android）

1) 创建 `ps2shell/app/src/main/res/xml/network_security_config.xml`

示例（按需替换域名/IP）：

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">192.168.1.10</domain>
    <domain includeSubdomains="true">api.your-domain.com</domain>
  </domain-config>
</network-security-config>
```

2) 在 `AndroidManifest.xml` 的 `<application>` 添加：

```xml
android:networkSecurityConfig="@xml/network_security_config"
```

> 最推荐做法：后端使用 HTTPS（避免各类明文策略问题）。

---

## 3) 后端不可达：局域网/防火墙/DNS/证书

即使手机“能上网”，也不代表能访问你的后端：

- **局域网 IP**：手机和电脑不在同一 Wi-Fi / 电脑防火墙阻止
- **公司 Wi-Fi**：隔离了同网段设备互访
- **HTTPS 证书**：证书链不完整、SNI 问题、过期，WebView 拒绝
- **IPv6-only 网络**：后端域名无 AAAA 解析，部分网络会失败

### 修改建议

- **公网服务**：优先用可公开访问的 HTTPS 域名
- **局域网服务**：确保端口开放、同网段互通
- **证书**：用正规 CA（Let’s Encrypt 等），避免自签名
- **IPv6**：给域名补 AAAA 或使用双栈/仅 IPv4 的网络环境测试

---

## 4) 前端“看起来像网络错误”，其实是请求 URL 仍然是 `/api/*`

如果 `NEXT_PUBLIC_API_BASE_URL` 没有正确打进 APK 对应的前端 bundle，前端会继续请求同源的 `/api/*`：

- 但静态导出没有 Next.js server，因此会 404
- UI 会表现为“网络连接失败”

### 修改建议（前端：增强可观测性）

建议在 `lib/api-client.ts` 里加一个仅开发/调试可见的日志：

- 把最终 resolve 后的 URL 输出到 `console.log`（真机可用 `chrome://inspect` 或 logcat 看）

同时建议在 UI 的错误提示里区分：

- DNS/TLS/超时（真正网络问题）
- HTTP 404/500（后端或路径问题）
- CORS（策略问题）

---

## 5) WebView 相关设置导致的异常（概率较低）

一些机型/系统可能对 WebView 有限制：

- 数据节省模式/后台数据限制
- 系统级 VPN/代理
- WebView 组件版本过旧

### 修改建议（Android）

在 `MainActivity.kt` 可临时打开调试与增强容错（上线前再评估）：

- `WebView.setWebContentsDebuggingEnabled(true)`（debug 用）
- 在 `WebViewClient` 覆写 `onReceivedError / onReceivedHttpError` 打日志

---

## 推荐的“最终方案”（最稳）

1) 使用 **HTTPS 公网域名后端**
2) 后端 CORS 放行 `https://appassets.androidplatform.net`
3) APK 构建前把 `NEXT_PUBLIC_API_BASE_URL` 设置为该公网域名
4) 前端错误提示区分 CORS/超时/HTTP 状态码，便于快速定位

---

## 本仓库已完成的对应修改（实现 2/3 的落地）

> 说明：第 1 点（“HTTPS 公网域名后端”）取决于你部署到哪里；本仓库侧已把前端配置改为 HTTPS 形式，并把 API 路由加上 CORS 放行，便于你把后端单独部署后直接可用。

- **前端**：`.env.local` 已将 `NEXT_PUBLIC_API_BASE_URL` 改为 HTTPS 形式（请替换为你的真实域名）。
- **后端（本仓库的 Next Route Handlers）**：已为以下路由增加：
  - `OPTIONS` 预检响应（204）
  - `Access-Control-Allow-Origin: https://appassets.androidplatform.net`
  - `Access-Control-Allow-Methods/Headers` 等
  - 涉及文件：
    - `app/api/_cors.ts`
    - `app/api/chat/route.ts`
    - `app/api/emotion/route.ts`
    - `app/api/summarize/route.ts`
    - `app/api/insights/route.ts`
    - `app/api/projection/route.ts`
    - `app/api/council/debate/route.ts`
    - `app/api/council/archive/route.ts`

### 本地模拟验证（已完成）

- 已通过本机 `next dev` 对 `/api/emotion` 发起带 `Origin: https://appassets.androidplatform.net` 的请求验证：
  - 返回 `200`
  - 响应头包含 `Access-Control-Allow-Origin: https://appassets.androidplatform.net`


## 最小改动清单（你可以按顺序做）

1) 把 `.env.local` 的 `NEXT_PUBLIC_API_BASE_URL` 改成真机可达的地址（不要用 `10.0.2.2`）
2) 重新执行：
   - `npm run build:android`
   - 同步 `out/` → `ps2shell/app/src/main/assets/web`
   - `./gradlew assembleDebug`
3) 后端加 CORS allowlist：`https://appassets.androidplatform.net`
4) 若仍用 HTTP：增加 `networkSecurityConfig` 放行域名/IP

