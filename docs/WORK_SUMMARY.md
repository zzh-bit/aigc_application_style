# 工作总结（Web → APK + UI/交互修复）

本项目为 Next.js Web 应用，使用静态导出并嵌入 Android WebView 壳打包为 APK。下面按“打包链路 / 关键兼容问题 / 具体 UI 改动”汇总本次全部工作与对应文件。

## 构建与打包链路（Web → Android APK）

- **Web 静态导出**：`next.config.mjs` 使用 `output: "export"`，并在 Android 构建脚本中使用 `NEXT_STATIC_ASSET_PREFIX=./` 保证导出资源为相对路径（适配 `WebViewAssetLoader`）。
  - 文件：`next.config.mjs`
  - 脚本：`package.json` 中 `build:android`

- **导出产物**：`npm run build:android` 生成 `out/`。

- **同步到 Android assets**：把 `out/` 拷贝到 `ps2shell/app/src/main/assets/web/`。

- **APK 构建**：`ps2shell` 工程执行 `./gradlew assembleDebug` 生成 `app-debug.apk`。

- **完整流程文档**：
  - `docs/BUILD_FULL_PROCESS_ANDROID_APK.md`

## Android WebView 壳关键兼容修复

- **`_next` 资源目录兼容**（避免 assets 下 `_next` 打包异常导致 404）：
  - 构建/同步阶段把 `assets/web/_next` 重命名为 `assets/web/next`
  - 原生端做请求路径映射：`/assets/web/_next/...` → `assets/web/next/...`
  - 文件：`ps2shell/app/src/main/java/com/example/ps2shell/MainActivity.kt`

- **软键盘覆盖而非顶起页面**：
  - Manifest：`android:windowSoftInputMode="adjustNothing"`
  - 代码层再次强制：`window.setSoftInputMode(SOFT_INPUT_ADJUST_NOTHING)`
  - 兼容某些 ROM：对 WebView 吞掉 IME/systemBars insets，避免布局重算导致“顶起”
  - 文件：
    - `ps2shell/app/src/main/AndroidManifest.xml`
    - `ps2shell/app/src/main/java/com/example/ps2shell/MainActivity.kt`

- **WebView CSS 兼容（OKLCH）**：
  - 为 Android WebView 提供 HEX fallback，并用 `@supports` 在支持 OKLCH 的环境启用高保真配色
  - 文件：`app/globals.css`

## Route2（独立后端 API）适配

- **静态导出下 `/api/*` 统一指向独立后端**：
  - `NEXT_PUBLIC_API_BASE_URL` 存在时，自动把 `/api/*` 拼接到该 base 上
  - 文件：`lib/api-client.ts`
  - 环境：`.env.local`（示例：模拟器访问宿主机 `http://10.0.2.2:3000`）

## UI/交互修复与优化（按模块）

### 欢迎页（Welcome）

- **移除中间大 “PS” 字样**，并将中部内容整体上移、收紧间距（横屏可见性更好）。
- **修复“入口按钮点不动”**：对背景/粒子层统一 `pointer-events-none`，避免透明层拦截触摸；底部轮播 `footer` 默认 `pointer-events-none`，仅“新手引导”等需要点击的元素恢复 `pointer-events-auto`。
- **设置弹窗适配小屏/横屏**：`max-h-[88vh]` + 内部滚动。
- **主题化选择控件**：把设置里的原生 `<select>` 换为 Radix Select（深色玻璃态，避免 Android 白底原生选择器）。

文件：
- `components/council/welcome-screen.tsx`
- `components/ui/select.tsx`（项目内已有，复用）

### 议会聊天页（Council）

- **四派系分布与遮挡修复**：
  - 角色席位层级提升（`z-20`），避免被消息气泡覆盖
  - 中央消息区间距调整，横屏可见性增强
  - 横屏下固定页面不允许滑动：根容器 `overflow-hidden`，并隐藏“历史可滚动区”
- **导师席位对齐“最上侧”**：
  - 席位改为整页根层绝对定位，横屏导师 `top-center` 对齐到顶部栏区域
- **移除顶部“议会辩论模式”标签**
- **输入框宽度调小**
- **右下角按钮**：邀请导师 + 决策完成固定在右下角
- **导师选择下拉主题化**：原生 `<select>` 换 Radix Select

文件：
- `components/council/council-main.tsx`
- `components/council/role-seat.tsx`
- `components/council/input-bar.tsx`

### 未来信件（Future Letters / 时间长河）

- **时间长河右侧“邮件模式”弹层加深背景**
- **年份选择后跳转到对应年份**：选年份时计算并设置 `offsetPx`
- **年份邮件箱（底部弹窗）**：
  - 背景加深、层级提升
  - 增加 `pointer-events` 与 `stopPropagation`，避免拖拽层吞点击
  - 邮件条目可点击进入阅读
- **主题化选择控件**：触发模拟（情绪/事件）、写信弹窗（情绪/事件）、年份选择下拉全部替换为 Radix Select
- **兜底点击问题**：背景粒子层 `pointer-events-none`

文件：
- `components/council/future-letters.tsx`

### 记忆库（Memory Vault）

- **右侧“记忆统计”无法下滑**：
  - 为 flex 容器补齐 `min-h-0`，并在滚动容器上加 `min-h-0 overflow-y-auto`
  - 触摸滚动优化：`WebkitOverflowScrolling: "touch"`
- **类型筛选下拉主题化**：原生 `<select>` 替换为 Radix Select

文件：
- `components/council/memory-vault.tsx`

## 其他工程性改动

- **ESLint 忽略 uniapp-shell 构建产物目录**，避免 lint 失败：
  - 文件：`eslint.config.mjs`

---

## 当前状态（你反馈的两类问题的处理结论）

- **按钮/入口点不动**：本次已对欢迎页、未来信件页的背景/粒子层统一 `pointer-events-none`，并避免全屏容器拦截触摸。
- **软键盘顶起页面**：已在 Manifest + MainActivity 双重强制为覆盖模式，并吞掉 IME insets 以兼容部分 ROM 行为。

