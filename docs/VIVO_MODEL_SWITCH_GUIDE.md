# 切换到 vivo 大模型（全流程手册）

本文是“从本地开发到线上发布再到手机验证”的完整流程。  
目标：将模型供应商切换为 vivo，并确保 Web 与 APK 链路都可用。

---

## 1. 适用范围与目标

适用于：

- 已有可运行后端（Next.js + PM2）
- 已有域名（推荐 `https://api.wdzsyyh.cloud`）和 HTTPS
- 已有可用 vivo Key（部分账号要求 `app_id`）

完成标准：

1. 供应商探测脚本返回 `[OK]`
2. 线上 `/api/health`、`/api/chat`、`/api/projection`、`/api/council/debate`、`/api/insights` 可用
3. 手机/模拟器端功能正常
4. 有可执行回滚方案

---

## 2. 当前代码接入点

已支持双供应商切换的路由：

- `app/api/chat/route.ts`
- `app/api/projection/route.ts`
- `app/api/council/debate/route.ts`
- `app/api/insights/route.ts`

统一读取环境变量：

- `DEEPSEEK_API_KEY`（实际可填 vivo key）
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `VIVO_APP_ID`（vivo 时使用）

---

## 3. 先在本地完成准备

### 3.1 本地环境变量

建议在 `.env.local`（本地调试）配置：

```env
DEEPSEEK_API_KEY=你的vivo_AppKey
DEEPSEEK_BASE_URL=https://api-ai.vivo.com.cn/v1/chat/completions
DEEPSEEK_MODEL=Doubao-Seed-2.0-pro
VIVO_APP_ID=你的app_id
```

### 3.2 供应商探测（本地）

```powershell
cd D:\yyh35\android_project\aigc_application\aigc_application_style
powershell -ExecutionPolicy Bypass -File .\scripts\verify-vivo-provider.ps1 -ApiKey "你的AppKey" -AppId "你的AppId"
```

成功标准：

- 输出 `[OK] Vivo provider reachable`
- `Response model` 和 `Assistant reply` 非空

### 3.3 本地代码检查

```powershell
npm run lint
```

---

## 4. 推送到 GitHub（必须）

> 推荐流程：本地改完 -> push -> 服务器 pull。不要在服务器直接改业务代码。

```powershell
git status
git add .
git commit -m "switch model provider to vivo and update deploy docs"
git push origin main
```

---

## 5. 服务器发布（逐步执行）

以下默认：

- 服务器用户：`root`
- 应用目录：`/srv/ps2-api`
- PM2 进程：`ps2-api`

### 5.1 SSH 登录

```powershell
ssh root@你的服务器IP
```

### 5.2 进入目录并确认状态

```bash
cd /srv/ps2-api
pwd
git branch --show-current
pm2 list
```

### 5.3 备份线上环境变量

```bash
cp .env.production ".env.production.bak-$(date +%F-%H%M%S)"
ls -la .env.production*
```

### 5.4 修改线上 `.env.production`

```bash
nano .env.production
```

至少包含：

```env
DEEPSEEK_API_KEY=你的vivo_AppKey
DEEPSEEK_BASE_URL=https://api-ai.vivo.com.cn/v1/chat/completions
DEEPSEEK_MODEL=Doubao-Seed-2.0-pro
VIVO_APP_ID=你的app_id
```

快速核对（不打印 key）：

```bash
grep -E "DEEPSEEK_BASE_URL|DEEPSEEK_MODEL|VIVO_APP_ID" .env.production
```

### 5.5 拉代码、安装、构建

```bash
git fetch --all
git checkout main
git pull origin main
npm ci || npm install
npm run build:server
```

### 5.6 重启服务并加载新环境

```bash
pm2 restart ps2-api --update-env
pm2 save
pm2 logs ps2-api --lines 120
```

> `--update-env` 必须带，否则会继续使用旧环境变量。

---

## 6. 线上验证（服务器 + 本地）

### 6.1 服务器本机验证

```bash
curl -sS -i http://127.0.0.1:3000/api/health
curl -sS -X POST "http://127.0.0.1:3000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"请一句话确认服务可用"}],"stream":false}'
```

### 6.2 本地外网验证

> 请使用证书匹配的 API 域名（推荐 `api.wdzsyyh.cloud`），不要用不匹配证书的域名。

```powershell
curl.exe -sS "https://api.wdzsyyh.cloud/api/health"
cd D:\yyh35\android_project\aigc_application\aigc_application_style
powershell -ExecutionPolicy Bypass -File .\scripts\verify-phone-api.ps1 -ApiBaseUrl "https://api.wdzsyyh.cloud"
```

若脚本只因 `Access-Control-Allow-Origin: *` 报警，可视为“宽松但可用”；建议将脚本判定放宽（允许 `*`）。

---

## 7. 手机 / APK 验证流程

### 7.1 不重打 APK 的前提

仅后端切换模型，不涉及前端静态资源与 `NEXT_PUBLIC_*`，通常不需要重打 APK。

### 7.2 手机端验证

1. 打开已安装 APK，先进入聊天页
2. 发送一句短问题，确认有返回
3. 再测 projection / council / insights 主链路
4. 若出现旧版本缓存问题：重启 App，必要时清缓存后再测

### 7.3 什么时候需要重打 APK

以下情况才需要重打：

- 修改了前端页面代码（`app/`、`components/`）并要在 APK 生效
- 修改了 `NEXT_PUBLIC_API_BASE_URL`
- 修改了 `android/ps2-shell` 壳层逻辑

---

## 8. 常见问题与排查

### 8.1 `40100 missing required app_id in the request header`

- 原因：该 Key 要求 `app_id`
- 处理：设置 `VIVO_APP_ID`，重启 `pm2 restart ... --update-env`

### 8.2 `1001 param requestId can't be empty`

- 原因：请求缺少 `request_id/requestId`
- 处理：确认已部署最新代码（已自动附加 `request_id`）

### 8.3 `30001 no model access permission`

- 原因：模型权限未开通或到期
- 处理：换可用模型或开通权限

### 8.4 `SEC_E_WRONG_PRINCIPAL`（Windows curl）

- 原因：证书域名与访问域名不一致
- 处理：使用证书对应域名（如 `https://api.wdzsyyh.cloud`）

### 8.5 `Failed to find Server Action "xxx"`

- 原因：前后端部署版本不一致或客户端缓存旧页面
- 处理：完整重启后端、客户端强刷/清缓存、避免灰度期混用旧页面

---

## 9. 快速回滚（故障恢复）

1. 还原 `.env.production` 备份：

```bash
cd /srv/ps2-api
cp .env.production.bak-<时间戳> .env.production
```

2. 重启并加载环境：

```bash
pm2 restart ps2-api --update-env
pm2 save
```

3. 重新验证：

```bash
curl -sS -i http://127.0.0.1:3000/api/health
```

---

## 10. 发布后核对清单

- [ ] 本地 `verify-vivo-provider.ps1` 返回 `[OK]`
- [ ] 代码已 push 到 GitHub
- [ ] 服务器 `.env.production` 已设置 vivo 参数
- [ ] `npm run build:server` 成功
- [ ] `pm2 restart --update-env` 后日志无持续报错
- [ ] 外网 `https://api.wdzsyyh.cloud/api/health` 可访问
- [ ] `verify-phone-api.ps1` 主链路通过
- [ ] 手机/APK 主流程通过
- [ ] 回滚命令已验证可执行

