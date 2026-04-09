# Android Studio 模拟器验证（欢迎页视觉对齐）

本文面向 **后续接手的 AI / 开发者**：从零把 Web 静态资源打进 APK，并在模拟器里核对欢迎页与目标稿一致。

## 0. 目标验收长什么样

欢迎页应在 **手机横屏** 下呈现为三列：**虚拟导师 | 中间六边形入口 | 未来信件**；底部为宽胶囊 **「决策树推演」**（左脑图标 + 副标题），其下三个分页点 **中间点为蓝色**；左下角 `v2.0 · PS² Labs`，右下角 **新手引导**；左上角 **PS 2** 旁有 **实时时钟 `HH:mm`**（与系统设计稿接近）。

对比截图可放在仓库根目录的 `emulator-verify-screenshot.png`，或你自己的目标图。

## 1. 前置条件

- Node.js 18+（与当前 Next.js 一致即可）
- Android Studio（含 Android SDK、某一版 Platform 与模拟器镜像）
- 工作副本根目录：  
  `D:\yyh35\android_project\aigc_application\aigc_application_style`  
  （其它机器请改为本地路径，下文称 **「Web 根目录」**。）

## 2. 生成静态资源（必须 `build:android`）

在 **Web 根目录** PowerShell：

```powershell
cd D:\yyh35\android_project\aigc_application\aigc_application_style
npm install
npm run build:android
```

成功标志：

- 终端末尾出现 `verify-android-export: OK`
- 生成目录 `out\`，且 `out\index.html` 中脚本/样式引用为 **`./_next/...`**（相对路径），不得是 `/_next/...`

> 不要用普通 `npm run build` 的产物去打包 APK，除非你也手动设置了 `NEXT_STATIC_ASSET_PREFIX=./` 并确认 HTML 内为相对路径。

## 3. 同步到 Android `assets/web`（含 `_next` → `next`）

仍在 Web 根目录：

```powershell
npm run sync:android
```

脚本：`scripts/sync-web-to-android-assets.ps1`  
作用：把 `out/` 全量复制到 `android\ps2-shell\app\src\main\assets\web\`，并把目录 **`_next` 重命名为 `next`**（避免部分 Android 资源打包对下划线目录不稳定）。  
WebView 仍请求 `/_next/...`，由 `MainActivity.kt` **映射到 `next/`**。

## 4. 用 Android Studio 打开壳工程

1. 启动 Android Studio → **Open**，选择文件夹：  
   `...\aigc_application_style\android\ps2-shell`
2. 首次打开等待 **Gradle Sync** 完成。若无 `gradlew.bat`，由 IDE 提示使用自带 Gradle 或生成 Wrapper，按提示操作即可。
3. 如需 `local.properties`，IDE 通常会生成，内容含 `sdk.dir=...`。

## 5. 模拟器与横屏

1. **Device Manager** 创建 Pixel 类设备（API 33+ 即可）。
2. 启动模拟器后，按 `Ctrl+F11` / 工具栏旋转为 **横屏 (Landscape)**。
3. 运行 **app**（绿色三角），包名 `com.ps2.shell`。

若出现白屏：用 Chrome 打开 `chrome://inspect` → Remote inspect 该 WebView，看 Network 是否对 `.../_next/...` 404；若 404，回到第 2～3 步检查是否用了错误的 `out/` 或未执行 `sync:android`。

## 6. 视觉对齐要点（改 UI 时查这些文件）

| 区域 | 主要文件 |
|------|-----------|
| 欢迎页布局 / 决策树条 / 时钟 | `components/council/welcome-screen.tsx` |
| 从欢迎页进议会并自动打开推演 | `components/council/ps2-app.tsx`（`onGoToDecisionTree` + `openProjectionAfterCouncil`） |
| 静态导出走相对路径 | `next.config.mjs`（`output: "export"`、`NEXT_STATIC_ASSET_PREFIX=./`） |
| WebView 与 `_next` 映射 | `android/ps2-shell/app/src/main/java/com/ps2/shell/MainActivity.kt` |
| 键盘不顶起页面 | `AndroidManifest.xml` `windowSoftInputMode` + `MainActivity` `SOFT_INPUT_ADJUST_NOTHING` |

## 7. 修改 Web 后重装 APK 的固定顺序

每次改前端并要更新 APK：

```powershell
npm run build:android
npm run sync:android
```

然后在 Android Studio **Run** 一次（或 `assembleDebug` 后 `adb install -r`）。

## 8. API（路线 2）说明

静态页内 `/api/*` 需在构建时写入 `NEXT_PUBLIC_API_BASE_URL`（见 `lib/api-client.ts`）。模拟器访问宿主机本机服务可用 `http://10.0.2.2:3000`。改环境变量后必须重新 `build:android` 与 `sync:android`。

## 9. Git 与 `assets/web`

`.gitignore` 已忽略 `android/ps2-shell/app/src/main/assets/web/*`（保留 `.gitignore` 中的例外规则与 `docs` 说明），避免把体积巨大的导出站点提交进库。**克隆仓库后打包前务必执行第 2～3 步。**

---

**最小命令摘要（给自动化 / 新会话复制）**

```powershell
cd D:\yyh35\android_project\aigc_application\aigc_application_style
npm run build:android
npm run sync:android
# 然后在 Android Studio 打开 android\ps2-shell 并 Run
```
