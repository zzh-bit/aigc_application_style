# Vercel 部署方案（同一个项目同时提供 API）

你提供的入口：

- GitHub 仓库列表：`https://github.com/zzh-bit?tab=repositories`
- Vercel 新建项目：`https://vercel.com/new?teamSlug=zzh-bits-projects`

本方案目标：

- **Vercel** 上跑一个 Next.js “Server 模式”应用（提供 `app/api/*`）
- **APK** 内仍是静态导出页面（`output: "export"`），通过 `NEXT_PUBLIC_API_BASE_URL` 调用 Vercel API

---

## 0. 关键前提（你必须知道）

1) **Vercel 上不能用 `output: "export"`** 来当后端  
静态导出不会运行 `app/api/*`。

2) 本仓库已做兼容：  
当 `VERCEL=1` 时，`next.config.mjs` 会自动关闭 export，改为 Server 模式；本地打 APK 时仍走 export。

文件：`next.config.mjs`

---

## 1）把代码推到 GitHub

你当前工作区本身不是 git 仓库，所以这里是“你在 GitHub 上创建/选择一个仓库后”的通用步骤。

在 GitHub（你的账号页面）新建一个仓库（例如 `ps2-web`），然后在本机工程根目录执行：

```bash
git init
git add .
git commit -m "init: ps2 web app"
git branch -M main
git remote add origin https://github.com/zzh-bit/<your-repo>.git
git push -u origin main
```

注意：

- **不要提交**包含密钥的文件（例如 `.env.local` 内的 `DEEPSEEK_API_KEY`）。  
建议把 `.env.local` 保持在本地，不要推到 GitHub。

---

## 2）在 Vercel 创建项目

打开：

- `https://vercel.com/new?teamSlug=zzh-bits-projects`

步骤：

- Import Git Repository → 选择你刚 push 的仓库
- Framework 会自动识别 Next.js
- Build Command 默认 `next build`（保持默认）
- Output Directory 保持默认（不要填 `out`）
- 点击 Deploy

---

## 3）配置环境变量（Vercel 项目 Settings）

进入：

- Project → Settings → Environment Variables

建议至少配置（Production + Preview 都配一遍更稳）：

- **DEEPSEEK_API_KEY**：你的 key（必须，才能真实调用模型；没有会走 mock/fallback）
- **DEEPSEEK_MODEL**：可选（如 `deepseek-chat`）
- **DEEPSEEK_BASE_URL**：可选（如 `https://api.deepseek.com/chat/completions`）
- **PS2_DEBUG / PS2_* 限制类**：按需（例如最大字数/最大 tokens 等）

保存后：

- 触发一次 Redeploy（Deployments 页面点 Redeploy，或 push 一次 commit）

---

## 4）拿到你的后端域名

部署完成后，你会得到：

- `https://<your-project>.vercel.app`

你也可以在 Settings → Domains 绑定自定义域名，例如：

- `https://api.your-domain.com`

---

## 5）让 APK 指向这个 HTTPS 后端（最关键）

在你本机 Web 工程的 `.env.local` 设置：

```env
NEXT_PUBLIC_API_BASE_URL=https://<your-project>.vercel.app
```

然后重新打包 APK（必须重打包，否则前端 bundle 仍是旧地址）：

```bash
npm run build:android
# 然后把 out/ 同步到 ps2shell/assets/web（你已有同步方式）
cd D:\yyh35\android_project\ps2shell
.\gradlew assembleDebug
```

---

## 6）部署后验证 CORS（你要求的验证方式）

部署完成后执行（把域名换成你的）：

```bash
curl -i https://<your-project>.vercel.app/api/emotion \
  -H "origin: https://appassets.androidplatform.net" \
  -H "content-type: application/json" \
  --data '{"text":"test"}'
```

预期：

- HTTP 200
- 响应头包含：`access-control-allow-origin: https://appassets.androidplatform.net`

---

## 常见坑（Vercel 上最容易踩）

- **`NEXT_PUBLIC_API_BASE_URL` 仍然是 `10.0.2.2`**：真机一定连不上（这是模拟器专用）
- **函数超时/限流**：模型调用慢时会超时；需要优化超时/降 tokens 或改用更长时限的后端
- **无状态存储**：Vercel 函数无持久化磁盘；如果你把“归档”写本地文件，重启会丢  
  - 生产建议改：Vercel Postgres / Neon / Supabase / KV / 对象存储

