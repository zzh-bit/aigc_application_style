# 切换到 vivo 大模型（基于现有后端重部署，详细版）

本文面向已按 `docs/BAIDU_CLOUD_BACKEND_REDEPLOY.md` 部署完成的后端服务，目标是将模型供应商从 DeepSeek 切换到 vivo（`https://api-ai.vivo.com.cn/v1/chat/completions`），并确保 `chat / projection / council/debate / insights` 全链路可用。

---

## 1. 适用范围与最终目标

### 1.1 适用范围

- 已有可运行的线上 Next.js 后端（`next start` + PM2）
- 你有可用的 vivo `AppKey`（部分 Key 还要求 `app_id`）
- 你需要在不重打 APK 的前提下切换服务端大模型

### 1.2 最终目标（完成定义）

当满足以下条件，视为切换完成：

1. `scripts/verify-vivo-provider.ps1` 本地探测返回 `[OK]`
2. 线上 `/api/chat`、`/api/projection`、`/api/council/debate`、`/api/insights` 均正常返回
3. 线上日志不再出现 DeepSeek 目标地址请求
4. 回滚路径明确（可 5 分钟内切回 DeepSeek）

---

## 2. 当前项目接入点（已对齐）

当前项目已支持双供应商切换（vivo / DeepSeek），涉及路由：

- `app/api/chat/route.ts`
- `app/api/projection/route.ts`
- `app/api/council/debate/route.ts`
- `app/api/insights/route.ts`

这些路由统一通过环境变量读取：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `VIVO_APP_ID`（仅 vivo 时使用）

> 变量名保留 `DEEPSEEK_*` 是为了兼容历史代码与部署脚本，不影响切换到 vivo。

---

## 3. vivo 接口关键差异（必须理解）

根据 `docs/vivoapi.md`，vivo 侧有两个关键约束：

1. **某些 Key 要求 `app_id` 请求头**  
   错误表现：`40100 missing required app_id in the request header`
2. **推荐携带请求 ID**（`request_id`，个别文档/报错里写 `requestId`）  
   错误表现：`1001 param requestId can't be empty`

项目现实现为：

- 自动生成并附加 `request_id=<uuid>`
- 若配置 `VIVO_APP_ID` 则附加 `app_id` 请求头

---

## 4. 环境变量配置（服务器）

在服务器 `.env.production`（或 PM2 ecosystem env）设置：

```env
DEEPSEEK_API_KEY=你的vivo_AppKey
DEEPSEEK_BASE_URL=https://api-ai.vivo.com.cn/v1/chat/completions
DEEPSEEK_MODEL=Doubao-Seed-2.0-pro
VIVO_APP_ID=你的app_id
```

### 4.1 可选模型

- `Volc-DeepSeek-V3.2`
- `Doubao-Seed-2.0-mini`
- `Doubao-Seed-2.0-lite`
- `Doubao-Seed-2.0-pro`
- `qwen3.5-plus`

### 4.2 选择建议

- 当前项目推荐首选：`Doubao-Seed-2.0-pro`（多角色推理、长上下文、结构化输出更匹配）
- 备选模型：`qwen3.5-plus`（可用于 A/B 对照）

---

## 5. 上线执行步骤（可直接照做）

### 5.1 服务器更新并重启

```bash
cd /srv/ps2-api
git fetch --all
git checkout main
git pull origin main
npm ci || npm install
npm run build:server
pm2 restart ps2-api --update-env
pm2 save
pm2 logs ps2-api --lines 120
```

### 5.2 本机健康检查（服务器上）

```bash
curl -sS -i http://127.0.0.1:3000/api/health
```

期望：`HTTP 200`。

---

## 6. 先测供应商，再测业务（推荐顺序）

## 6.1 供应商连通性测试（只验证 vivo）

脚本：`scripts/verify-vivo-provider.ps1`

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-vivo-provider.ps1 -ApiKey "你的AppKey"
```

若提示缺 `app_id`：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-vivo-provider.ps1 -ApiKey "你的AppKey" -AppId "你的AppId"
```

成功标准：

- 输出 `[OK] Vivo provider reachable`
- `Response model` 非空
- `Assistant reply` 非空

### 6.2 业务接口验证（你的后端）

先测健康：

```powershell
curl.exe -sS "https://你的域名/api/health"
```

再按项目现有脚本验证：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-phone-api.ps1 -ApiBaseUrl "https://你的域名"
```

重点关注：

- `/api/chat`
- `/api/projection`
- `/api/council/debate`
- `/api/insights`

---

## 7. 常见故障与排查

### 7.1 `40100 missing required app_id in the request header`

原因：该 Key 要求 `app_id`。  
处理：

1. 在服务器加 `VIVO_APP_ID`
2. `pm2 restart ps2-api --update-env`
3. 重新执行 `verify-vivo-provider.ps1 -AppId ...`

### 7.2 `1001 param requestId can't be empty`

原因：请求未携带请求 ID。  
处理：确认代码中有 `request_id` 生成逻辑，且部署的是最新代码。

### 7.3 `30001 no model access permission`

原因：当前 Key 没有该模型权限或权限到期。  
处理：换模型名测试，或在 vivo 控制台开通对应模型权限。

### 7.4 `30001 hit model rate limit` / `429`

原因：触发 QPS 或配额限制。  
处理：降低并发、增加退避重试、加缓存/降级。

### 7.5 供应商脚本成功，但业务接口失败

说明：Key 没问题，问题在后端部署或路由代码。  
检查顺序：

1. `pm2 logs ps2-api --lines 200`
2. `.env.production` 是否生效（重点 `VIVO_APP_ID`）
3. 是否执行了 `--update-env`
4. 是否是旧构建未重启

---

## 8. 回滚方案（快速恢复）

若切换后线上异常，可在 5 分钟内回滚到 DeepSeek：

1. 将环境变量改回 DeepSeek：

```env
DEEPSEEK_API_KEY=原DeepSeekKey
DEEPSEEK_BASE_URL=https://api.deepseek.com/chat/completions
DEEPSEEK_MODEL=deepseek-chat
VIVO_APP_ID=
```

2. 重启：

```bash
pm2 restart ps2-api --update-env
pm2 save
```

3. 重跑 `verify-phone-api.ps1` 验证。

---

## 9. APK 影响说明

- **仅后端切模型**：不需要重打 APK
- **仅当修改 `NEXT_PUBLIC_*` 或前端静态资源**：才需要重打 APK

---

## 10. 提交前核对清单

- [ ] `verify-vivo-provider.ps1` 已返回 `[OK]`
- [ ] 服务器 `.env.production` 已含 `VIVO_APP_ID`
- [ ] 已执行 `npm run build:server`
- [ ] 已执行 `pm2 restart ... --update-env`
- [ ] `/api/health` 正常
- [ ] 四个核心业务 API 已验证
- [ ] 已准备好 DeepSeek 回滚参数

