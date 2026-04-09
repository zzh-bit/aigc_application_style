# ECS 部署方案（AI 聊天 + 决策树可用）

适配场景：**APK（WebView 离线静态前端）+ 独立后端 API（Route 2）**。  
目标：真机上 **AI 聊天**、**议会辩论**、**决策树推演** 请求打到你在 ECS 上的 **HTTPS 域名**，且 **CORS** 与 **Nginx** 配置正确。

---

## 1. 结论先行（你应该怎么做）

1. 在 ECS 上跑一个 **Next.js `next start`**（或等价 Node 服务），对外只暴露 **443**（前面加 **Nginx + Let’s Encrypt**）。
2. 代码里的 `D:\yyh35\android_project\aigc_application\aigc_application_style\app\api\_cors.ts` 已只允许 **`https://appassets.androidplatform.net`** 作为带 `Origin` 的跨域来源（与 Android WebView 一致）。
3. 打 APK 前在 **Web 工程根目录** 配置 **`NEXT_PUBLIC_API_BASE_URL=https://你的 API 域名`**（无末尾 `/`），然后 **`npm run build:android`** → **`npm run sync:android`** → Android Studio 编译安装。
4. 真机访问的 Base URL **不能** 再用 `http://10.0.2.2:...`（仅模拟器访问宿主机可用）。

---

## 2. 架构（最稳）

| 层级 | 职责 |
|------|------|
| APK 内静态页 | `D:\yyh35\android_project\aigc_application\aigc_application_style\android\ps2-shell\app\src\main\assets\web\index.html`；`fetch` 发往 `NEXT_PUBLIC_API_BASE_URL + "/api/..."` |
| ECS 上的 Node | 服务器目录 `/opt/ps2-app` 运行 `npm run build` + `npm run start`，提供 `/opt/ps2-app/app/api/*` |
| Nginx | `443` 终止 TLS，反代到 `127.0.0.1:3000`；可选为 **SSE/流式** 关闭缓冲 |
| 域名 DNS | `api.example.com` → ECS 公网 IP |

需具备的后端路径（与客户端一致）：至少包括 **`/api/chat`**、**`/api/council/debate`**、**`/api/projection`**；其余按功能再开放。

---

## 路径总表（完整绝对路径）

### A) 你本机（Windows）

- Web 工程根目录：`D:\yyh35\android_project\aigc_application\aigc_application_style`
- 本文档：`D:\yyh35\android_project\aigc_application\aigc_application_style\docs\ECS_DEPLOY_AI_CHAT_DECISION_TREE_PLAN.md`
- Android 壳工程目录：`D:\yyh35\android_project\aigc_application\aigc_application_style\android\ps2-shell`
- Android 资产目录：`D:\yyh35\android_project\aigc_application\aigc_application_style\android\ps2-shell\app\src\main\assets\web`
- 资产同步脚本：`D:\yyh35\android_project\aigc_application\aigc_application_style\scripts\sync-web-to-android-assets.ps1`
- 前端生产环境变量文件：`D:\yyh35\android_project\aigc_application\aigc_application_style\.env.production`

### B) 服务器（ECS，Ubuntu）

- 项目目录：`/opt/ps2-app`
- 服务器环境变量：`/opt/ps2-app/.env.production`
- Nginx 站点配置：`/etc/nginx/sites-available/ps2-api.conf`
- Nginx 启用链接：`/etc/nginx/sites-enabled/ps2-api.conf`
- PM2 systemd 服务文件（root 用户）：`/etc/systemd/system/pm2-root.service`
- PM2 进程保存目录（root 用户）：`/root/.pm2`

---

## 3. ECS 与网络（可按云厂商控制台操作）

### 3.1 规格与系统

- **规格**：2C4G 可先跑通；流量略大再升 4C8G。
- **镜像**：Ubuntu 22.04 LTS（与下文命令一致）。
- **磁盘**：40G+ 系统盘通常足够。

### 3.2 公网与域名

1. 为实例绑定 **弹性公网 IP**（若控制台单独购买/绑定）。
2. 在域名 DNS 增加 **A 记录**：`api.wdzsyyh.cloud` → 该公网 IP（TTL 600 即可）。
3. 等待解析生效：`ping api.wdzsyyh.cloud` 能看到该 IP。

### 3.3 安全组（云平台「入方向」规则）

| 端口 | 协议 | 源 | 说明 |
|------|------|-----|------|
| 22 | TCP | 你的办公公网 IP / 跳板机 | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP（证书签发与跳转） |
| 443 | TCP | 0.0.0.0/0 | HTTPS（正式流量） |

调试期若暂时直连 Node，可 **临时** 放行 `3000/TCP` 给你本机 IP；上线前 **删掉**，只留 443。

### 3.4 主机防火墙（Ubuntu）

若启用了 `ufw`：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # 等价于 80 + 443
sudo ufw enable
sudo ufw status
```

---

## 4. 推荐执行顺序（时间线）

按顺序做，避免「证书没好就配 443」「APK 没重打还在连 10.0.2.2」这类问题。

| 阶段 | 动作 | 完成标志 |
|------|------|----------|
| A | 买 ECS、绑 IP、安全组、DNS | 本机 `ping` / `ssh` 通 |
| B | 装 Node / Nginx / pm2；克隆仓库；写服务器环境变量；`build` + `pm2 start` | `curl http://127.0.0.1:3000` 有响应（可先只看 404 页面是否 Next） |
| C | Nginx 反代 80 → 3000；`certbot` 上 HTTPS | `https://api...` 浏览器打开不报证书错 |
| D | 用带 `Origin` 的 curl 测 OPTIONS/POST | 响应头含允许 WebView 的 `Access-Control-Allow-Origin` |
| E | 本地设 `NEXT_PUBLIC_API_BASE_URL`，`build:android` + `sync:android`，出 APK | 真机议会/聊天/推演可用 |

---

## 5. 后端部署（Ubuntu —— 可逐条复制）

### 5.1 SSH 登录

```bash
ssh ubuntu@<ECS公网IP>
# 部分镜像默认用户为 root，则 ssh root@<IP>
```

### 5.2 基础软件

```bash
sudo apt update
sudo apt install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential
sudo npm i -g pm2
node -v    # 应 v20.x
```

### 5.3 拉代码与安装依赖

```bash
sudo mkdir -p /opt
sudo chown "$USER:$USER" /opt
cd /opt
git clone <你的仓库地址> ps2-app
cd ps2-app
git checkout <你的发布分支>
npm ci
```

### 5.4 服务器环境变量（不要提交 Git）

在 **`/opt/ps2-app/.env.production`** 创建（路径 = 项目根，与 `package.json` 同级）：

```env
# 必填：大模型（与 app/api 中读取的一致）
DEEPSEEK_API_KEY=sk-替换为你自己的真实密钥
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/chat/completions

# 可选：运维与限流（有默认值，可调）
PS2_DEBUG=0
PS2_RATE_LIMIT_MAX=30
PS2_RATE_LIMIT_WINDOW_MS=60000
```

说明：

- **`DEEPSEEK_*`** 仅在服务端读取，**不要** 写进 `NEXT_PUBLIC_*`，也不要写进 APK。
- Next 在生产 **`next build` / `next start`** 时会加载 **`.env.production`**（详见 Next 文档）。

### 5.5 构建并启动

```bash
cd /opt/ps2-app
npm run build
pm2 start npm --name ps2-backend -- run start
pm2 save
pm2 startup
# 按 pm2 提示执行一条 sudo 命令，保证重启后自启
```

你当前机器已执行并看到：

- `systemctl enable pm2-root`
- `Created symlink /etc/systemd/system/multi-user.target.wants/pm2-root.service → /etc/systemd/system/pm2-root.service`

这表示 **PM2 开机自启已配置成功**。下一步只需在每次进程变更后执行：

```bash
pm2 save
```

快速看进程与健康：

```bash
pm2 status
pm2 logs ps2-backend --lines 80
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

若端口占用或需改端口：

```bash
PORT=3000 pm2 restart ps2-backend --update-env
```

（也可以在 `.env.production` 里加 `PORT=3000`，重建后 `pm2 restart ...`。）

---

## 6. Nginx + HTTPS

### 6.1 先做 HTTP 反代（certbot 前）

新建 `/etc/nginx/sites-available/ps2-api.conf`：

```nginx
server {
  listen 80;
  server_name api.wdzsyyh.cloud;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 聊天 SSE/流式时建议关闭缓冲（否则客户端可能卡顿或断流）
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
  }
}
```

启用并重载：

```bash
sudo ln -sf /etc/nginx/sites-available/ps2-api.conf /etc/nginx/sites-enabled/ps2-api.conf
sudo nginx -t && sudo systemctl reload nginx
```

此时应能：`curl -I http://api.wdzsyyh.cloud`（浏览器可能 307 或看到 Next 页面，取决于路由）。

如果出现 `curl: (28) ... Connection timed out`（你当前就是这个状态），按下面顺序处理：

```bash
# 1) 机器内服务确认（已监听 80 才继续）
ss -lntp | grep ':80'
systemctl status nginx --no-pager

# 2) 外网连通性确认（在你本机 Windows 执行）
# Test-NetConnection api.wdzsyyh.cloud -Port 80
```

判定标准：

- 若 `ss` 有 `0.0.0.0:80`，但 Windows `TcpTestSucceeded=False`，问题在 **阿里云网络层**（安全组/NACL/实例公网绑定），不是 Nginx。
- 需要在 ECS 绑定的实际安全组放行：`TCP 80`、`TCP 443`，来源 `0.0.0.0/0`；如启用 NACL，同步放行。

### 6.2 申请 TLS 证书

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.wdzsyyh.cloud
```

完成后 `certbot` 通常会改好 `listen 443 ssl` 段。请再确认 **仍存在** 上表中的 `proxy_set_header X-Forwarded-Proto $scheme` 与 **流式相关** 的 `proxy_buffering off` 等（若被覆盖，手工合并进 `443` 的 `server`）。

验证：

```bash
curl -I https://api.wdzsyyh.cloud
```

---

## 7. CORS 与「仅限 WebView 来源」

本仓库 `D:\yyh35\android_project\aigc_application\aigc_application_style\app\api\_cors.ts` 当前 **仅** 允许：

```text
https://appassets.androidplatform.net
```

因此：

- **APK 内 WebView** 发起的 `fetch` 会带该 `Origin`，能拿到 `Access-Control-Allow-Origin`。
- 若你用 **桌面浏览器** 直接打开 `file://` 或其它域名调试 API，**不会** 被写入 CORS 允许头（属预期）。需要临时加白名单时，在 `ALLOWED_ORIGINS` 中增加你的来源字符串，**重新 deploy 后端**，并注意安全边界。

---

## 8. APK 侧：环境变量与重打包（本仓库标准流程）

### 8.1 配置 API 基址

在 **开发机构建 APK 的那台电脑**、**Web 仓库根目录**（与 `package.json` 同级）创建或修改 **`.env.production`**（或你用于生产构建的文件；关键是 **执行 `next build` 时已能读到**）：

```env
NEXT_PUBLIC_API_BASE_URL=https://api.wdzsyyh.cloud
```

**不要** 末尾斜杠。

### 8.2 构建静态资源并同步到 Android

```powershell
cd D:\yyh35\android_project\aigc_application\aigc_application_style
npm run build:android
npm run sync:android
```

第二行会执行 `D:\yyh35\android_project\aigc_application\aigc_application_style\scripts\sync-web-to-android-assets.ps1`，把 `D:\yyh35\android_project\aigc_application\aigc_application_style\out\` 拷到 `D:\yyh35\android_project\aigc_application\aigc_application_style\android\ps2-shell\app\src\main\assets\web\` 并把 `_next` 重命名为 `next`。

### 8.3 编译 APK

用 **Android Studio** 打开 `android\ps2-shell`，**Run** 或：

```powershell
D:
cd D:\yyh35\android_project\aigc_application\aigc_application_style\android\ps2-shell
.\gradlew.bat assembleDebug
adb install -r D:\yyh35\android_project\aigc_application\aigc_application_style\android\ps2-shell\app\build\outputs\apk\debug\app-debug.apk
```

### 8.4 如何确认 APK 里不再是模拟器地址

全文搜索构建前工作区：**`10.0.2.2`** 不应再出现在 **即将用于生产的** `.env*` 里；可在打好的静态 `out` 里搜字符串（仅作辅助，以「构建时环境变量」为准）。

---

## 9. 上线前用 curl 自测（替换域名）

把下面 `API` 固定为 `https://api.wdzsyyh.cloud`（本项目当前部署目标）。

### 9.1 预检 OPTIONS（必须与 WebView Origin 一致）

```bash
API=https://api.wdzsyyh.cloud
curl -i -X OPTIONS "$API/api/chat" \
  -H "Origin: https://appassets.androidplatform.net" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

期望：`204` 或 `200`，且响应头含：

- `access-control-allow-origin: https://appassets.androidplatform.net`
- `access-control-allow-methods` 含 `POST`

### 9.2 POST 聊天（最小正文按你 `route.ts` 实际格式调整）

```bash
curl -i -X POST "$API/api/chat" \
  -H "Origin: https://appassets.androidplatform.net" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"stream":false}'
```

期望：`200`，JSON 内有模型回复（若 Key/配额异常则按服务端日志排查）。

### 9.3 决策树 / 叙事推演

请求体仅需 **`topic`**（可省略，服务端会用默认议题；以下为显式示例）：

```bash
curl -i -X POST "$API/api/projection" \
  -H "Origin: https://appassets.androidplatform.net" \
  -H "Content-Type: application/json" \
  -d '{"topic":"是否换工作"}'
```

### 9.4 议会辩论

**必填字段 `topic`（非空字符串）**；可选 `includeMentor`、`mentorId`、`memories`。

```bash
curl -i -X POST "$API/api/council/debate" \
  -H "Origin: https://appassets.androidplatform.net" \
  -H "Content-Type: application/json" \
  -d '{"topic":"这周要不要提离职","includeMentor":false}'
```

---

## 10. 本仓库已具备的能力（可直接用于真机）

- 前端 `D:\yyh35\android_project\aigc_application\aigc_application_style\lib\api-client.ts`：存在 **`NEXT_PUBLIC_API_BASE_URL`** 时，把 **`/api/*`** 指到该主机。
- CORS 配置 `D:\yyh35\android_project\aigc_application\aigc_application_style\app\api\_cors.ts`：对允许的 Origin 设置 CORS；**`OPTIONS`** 由各路由 `corsPreflight` 处理。
- Android 壳 `D:\yyh35\android_project\aigc_application\aigc_application_style\android\ps2-shell`：WebView 加载 **`https://appassets.androidplatform.net/assets/web/...`**，与上述 Origin 一致。
- 更细打包步骤：`D:\yyh35\android_project\aigc_application\aigc_application_style\docs\BUILD_FULL_PROCESS_ANDROID_APK.md`、`D:\yyh35\android_project\aigc_application\aigc_application_style\docs\ANDROID_STUDIO_EMULATOR_VERIFY.md`。

---

## 11. 本地曾做过的模拟验证（结论摘要）

使用 Origin **`https://appassets.androidplatform.net`** 访问时：

- `POST /api/chat`、`POST /api/projection`、`POST /api/council/debate` 应返回业务成功码；
- 响应含 **`Access-Control-Allow-Origin: https://appassets.androidplatform.net`**；
- `OPTIONS` 预检返回 **`204`**（或等价成功）并带允许方法与 Origin。

---

## 12. 上线后快速自检清单

1. **HTTPS**：手机浏览器打开 `https://api.wdzsyyh.cloud`，证书有效、无混合内容拦截。
2. **CORS**：`adb logcat` 无 `CORS policy` 相关红字；必要时对同一请求用 curl 复现。
3. **APK**：确认重装的是 **新包**；设置里若曾缓存错误 API 地址，需以 **当前 `NEXT_PUBLIC_API_BASE_URL` 构建结果** 为准。
4. **PM2 / 日志**：`pm2 logs ps2-backend` 无持续 **5xx**、无 DeepSeek **401/429** 风暴。
5. **限流与费用**：控制台/邮件为 API Key 设告警；Nginx 可再加 `limit_req`（与应用层 `PS2_RATE_LIMIT_*` 配合）。

---

## 13. 风险与建议

- 出口带宽与流量包（尤其香港/海外）注意监控；可开 **Nginx gzip**、**日志切割**（`logrotate`）。
- 生产建议 **WAF/限连**，并对 **`/api/chat`** 等昂贵接口做 **IP / Token 级** 限额。
- **DeepSeek Key** 仅放服务器；密钥轮换时只改 `.env.production` 与 `pm2 restart`，**无需**重打 APK（除非同时改前端逻辑）。

---

## 14. 常见问题速查

| 现象 | 优先检查 |
|------|----------|
| APK 内请求全是 Network Error | `NEXT_PUBLIC_API_BASE_URL` 是否 **https**、域名解析、手机网络；ECS 安全组是否放行 443 |
| 浏览器调试 API 报 CORS | 浏览器 Origin 不在 `ALLOWED_ORIGINS`；应用应 **在 APK** 或临时改 `_cors.ts` |
| 流式聊天卡住一半 | Nginx **`proxy_buffering off`**、**`proxy_read_timeout`**；上游 DeepSeek 是否断连（看 pm2 日志） |
| 502 Bad Gateway | `pm2 status` 是否 online；本机 `curl 127.0.0.1:3000`；Nginx `error.log` |
