# UniApp 打包（最少改代码）操作手册

本文用于把当前 Next.js Web 应用以最小改动打包为 Android APK（横屏）。

## 1. 目标与原则

- 不迁移现有页面和组件，不重写业务逻辑。
- Web 继续由当前仓库构建，UniApp 只做 WebView 壳。
- 横屏要求由 UniApp/Android 壳配置保证（不在 Web 侧大改样式）。

## 2. 目录约定

- Web 项目：`D:\yyh35\android_project\aigc_application\aigc_application_style`
- UniApp 壳项目（默认）：`<当前仓库>\uniapp-shell`
- Web 静态导出：`out/`
- 同步目标目录：`<UNIAPP_SHELL_DIR>\hybrid\html\web\`

> 如果你的 UniApp 壳不在默认目录，请先设置环境变量：
>
> ```powershell
> $env:UNIAPP_SHELL_DIR = "你的 uniapp 壳项目绝对路径"
> ```

## 3. 一键构建与同步（本仓库已内置）

```powershell
cd "D:\yyh35\android_project\aigc_application\aigc_application_style"
npm run build:uniapp
```

`build:uniapp` 会做两步：

1. `npm run build:android`：生成 `out/` 并校验 `./_next` 资源路径。
2. `npm run sync:uniapp`：清空并全量覆盖到 UniApp 壳 `hybrid\html\web\`。

同步脚本：`scripts/sync-out-to-uniapp.ps1`（已加 hash 一致性检查）。

## 4. UniApp 壳项目设置（HBuilderX）

### 4.1 首页使用 WebView

- 在 UniApp 壳中创建页面（示例：`pages/web/web.vue`）
- 使用 `web-view` 组件加载本地页面
- 首页路由设为该页面

本地路径建议：

- Android：`/hybrid/html/web/index.html`

### 4.2 横屏要求（必须）

在 UniApp 的 App 配置中将 Android 方向设为横屏：

- 推荐：锁定横屏（landscape）
- 或：sensorLandscape（仅横屏间旋转）

原则：优先通过壳层配置实现横屏，不改 Web 页面逻辑。

## 5. 打包 APK（HBuilderX）

1. 先执行 `npm run build:uniapp`
2. 打开 UniApp 壳项目（默认 `uniapp-shell`，或你通过 `UNIAPP_SHELL_DIR` 指定的目录）
3. 运行到模拟器/真机验证
4. 发行 Android APK（调试包或签名发布包）

## 6. 验收清单

- 断网冷启动无白屏、无纯 HTML 无样式。
- 核心 CTA 可点击，至少可切换两个主页面。
- App 默认横屏，旋转设备后仍符合横屏策略。
- `hybrid\html\web\index.html` 与 `out\index.html` 一致（脚本已校验 hash）。

## 7. 常见问题

- 白屏/样式丢失：通常是误用了普通 `npm run build` 产物或未同步完整 `_next`。
- 点击异常：优先检查壳层 WebView 与页面容器全屏设置。
- 横屏未生效：检查 UniApp 打包配置是否已把 Android 方向设为横屏并重新打包。
