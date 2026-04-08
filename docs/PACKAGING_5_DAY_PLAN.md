# PS² Web → Android APK：5 天打包专项计划（详细版）

> 适用对象：单人或小团队，已有 Next.js 前端与 `ps2shell` 壳工程。  
> 总目标：第 5 天结束时，**可重复产出可安装的 APK**（优先 Debug），**离线 UI 稳定**，**联网后至少 1 条 AI 主链路可用**，并留下可交接的文档与脚本。

---

## 计划总览（5 天甘特心算）

| 天 | 主题 | 核心产出 |
|----|------|----------|
| **Day 1** | 环境与 Web 导出流水线 | 本机能稳定 `build:android`，`out/` 通过自检 |
| **Day 2** | Android 壳与离线运行 | 模拟器/真机离线打开 UI，排版与点击正常 |
| **Day 3** | 联网 API 与真机联调 | `NEXT_PUBLIC_API_BASE_URL` 生效，议会或聊天打通 |
| **Day 4** | 发布准备与问题清零 | Release 配置草案、安装包体积/权限复查、回归清单 |
| **Day 5** | 总验收与交付 | 最终 APK + 安装说明 + 演示路径 + 已知问题表 |

---

## 通用约定（5 天内保持不变）

### 目录与命令占位

- Web 根目录：`aigc_application_style/`（你机器上可能是 `D:\yyh35\android_project\aigc_application\aigc_application_style`）
- 壳工程：`ps2shell/`（如 `D:\yyh35\android_project\ps2shell`）
- 下文统一写相对概念：**Web 根**、**壳根**

### 黄金规则（违反极易返工）

1. **进 APK 的静态资源只能来自** `npm run build:android`（含 `verify-android-export`），**禁止**用普通 `npm run build` 的 `out/` 拷贝进 `assets/web`。
2. **AI Key 只放服务端**；APK 内只有 `NEXT_PUBLIC_*` 类型的**非密钥**配置（如后端 base URL）。
3. 每次更新 Web 后：**build:android → 全量覆盖 `assets/web` → 再编 APK**。

### 每日例行（建议固定时段，15～20 分钟）

1. `git status`（或备份）  
2. Web：`npm run lint`  
3. Web：`npm run build:android`  
4. 壳：`.\gradlew.bat assembleDebug`（或当日目标 task）  
5. 在表 `每日风险登记`（文末模板）记一行阻塞项  

---

# Day 1：环境与 Web 静态导出「可重复、可验证」

### 当日目标

- 任意成员在一台 Windows 机器上，按文档能从零跑到：**`build:android` 成功且校验脚本打印 OK**。  
- 明确 **Node / npm、Android SDK、JDK、ADB** 版本与路径，避免「本机能用、换机就炸」。

### 上午（约 3～4h）：环境盘点与安装

| 时间块 | 任务 | 具体操作 | 完成标志 |
|--------|------|----------|----------|
| 0.5h | 记录硬件 | CPU、内存、独显型号；是否开启虚拟化（BIOS） | 写进《环境说明》一页 |
| 1h | Node 与项目依赖 | 安装 LTS Node；Web 根执行 `npm ci` 或 `npm install` | `npm run dev` 能开首页 |
| 1h | Android SDK | Android Studio 安装；SDK 路径写入壳工程 `local.properties` 的 `sdk.dir` | Studio 内 SDK Manager 无红色报错 |
| 0.5h | JDK | 与 Gradle 要求一致（你项目已用本机 JDK 时记录路径） | `.\gradlew.bat --version` 成功 |
| 0.5h | ADB 唯一性 | 确认系统 **无** `C:\Windows\adb.exe` 旧版抢端口；统一使用 `sdk\platform-tools\adb.exe` | `adb version` 仅一条 41.x 客户端，`adb devices` 不反复杀进程冲突 |

**ADB 冲突应急（当日必须会）**

```powershell
taskkill /IM adb.exe /F 2>$null
& "$env:ANDROID_SDK_ROOT\platform-tools\adb.exe" start-server
```

（若未设 `ANDROID_SDK_ROOT`，写死你本机 SDK 路径。）

### 下午（约 3～4h）：锁定 Web 打包命令与产物

| 时间块 | 任务 | 具体操作 | 完成标志 |
|--------|------|----------|----------|
| 1h | 首次全量构建 | Web 根：`npm run build:android` | 终端出现 `verify-android-export: OK` |
| 0.5h | 人工抽查 `out/index.html` | 搜索是否含 `"/_next/`（错误）与 `./_next/`（正确） | 无根路径 `/_next` 引用 |
| 1h | 本地离线预览静态站 | 用浏览器直接打开 `out\index.html`（或 `npx serve out`） | 样式正常、主要按钮可点（不要求 API） |
| 1h | 文档化 | 把 **Web 根路径、Node 版本、`build:android` 完整命令** 写入团队 wiki 或 `HANDOFF.md` 一节 | 另一人照文档可复现 |

### Day 1 验收清单（全部打勾才算过）

- [ ] `npm run build:android` 连续成功 **2 次**（排除偶然性）  
- [ ] `scripts/verify-android-export.mjs` 未改过逻辑情况下通过  
- [ ] `out/_next/static/` 下 chunk、css 文件存在且体积合理  
- [ ] `next.config.mjs` 中 **仅当** `NEXT_STATIC_ASSET_PREFIX=./` 时启用 `assetPrefix`（与现实现一致）  

### Day 1 风险与对策

| 风险 | 对策 |
|------|------|
| Windows 上 `&&` 与 PowerShell 差异 | 文档写清：PowerShell 用 `;` 分行执行 |
| 旧 adb 占 5037 | 删除/重命名 `C:\Windows\adb.exe` 或统一 PATH |
| `build:android` 失败 | 先看 `next build` 报错；再查磁盘空间与杀毒拦截 `node_modules` |

---

# Day 2：Android 壳工程与「离线 UI」闭环

### 当日目标

- 将 Day 1 的 `out/**` **全量** 同步到 `ps2shell/app/src/main/assets/web/`。  
- 在 **模拟器或真机** 上安装 Debug APK，**断网** 能进入欢迎页/Council 等主界面，**无明显错位、无整页无法点击**。

### 上午（约 3h）：资源拷贝与 Gradle

| 时间块 | 任务 | 具体操作 | 完成标志 |
|--------|------|----------|----------|
| 0.5h | 清空旧资源 | 删除 `assets/web/*` 后整份复制 `out/*` | 目录内有 `index.html`、`_next`、静态资源 |
| 1h | 首次 `assembleDebug` | 壳根：`.\gradlew.bat clean assembleDebug` | `BUILD SUCCESSFUL` |
| 0.5h | 安装到设备 | `adb install -r app\build\outputs\apk\debug\app-debug.apk` | 桌面出现应用图标 |
| 1h | 离线烟雾测试 | 关 WiFi/飞行模式；冷启动 App | 非白屏；可进入至少 2 个主导航页 |

### 下午（约 3～4h）：WebView 与布局

| 时间块 | 任务 | 具体操作 | 完成标志 |
|--------|------|----------|----------|
| 1h | 若白屏或样式异常 | Chrome `chrome://inspect` → Remote inspect WebView；看 Network 是否 404 `/_next` | 404 则回到 Day 1 校验是否误用 `npm run build` |
| 1h | 若点击无效 | 查是否透明层 `pointer-events`、或视口未适配 | `MainActivity` 中 `useWideViewPort`/`loadWithOverviewMode` 已开 |
| 1h | AVD 稳定性 | 记录稳定 AVD 名称；冷启动/Wipe data 流程写进文档 | 同一套步骤新同事可启动 |
| 0.5～1h | 同步更新 `ANDROID_STUDIO.md` | 补充你本机 SDK 路径、拷贝命令、常见 Emulator 报错 | 与实机一致 |

### Day 2 验收清单

- [ ] 断网启动 App：**无**持续白屏、**无**明显「纯 HTML 无样式」  
- [ ] 主要按钮：欢迎页核心 CTA、底部/侧栏导航可切换  
- [ ] `assets/web/index.html` 与 `out/index.html` 修改时间一致（避免拷错目录）  
- [ ] 壳工程 `MainActivity` 加载 URL 仍为：  
  `https://appassets.androidplatform.net/assets/web/index.html`  

### Day 2 风险与对策

| 风险 | 对策 |
|------|------|
| Emulator 5 分钟连不上 | 关 Studio；`taskkill` qemu+emulator+adb；Wipe AVD；或用第二套 AVD |
| 「已是 running process」 | Run 配置改为「已运行设备」，勿重复启动同名 AVD |
| 仅真机可测 | 开 USB 调试；同一套 `adb install`；注意 http 明文策略 |

---

# Day 3：联网 API、环境变量与端到端一条 AI 链路

### 当日目标

- 明确 **BFF 部署在哪里**（本机局域网 IP、内网服务器或公网 HTTPS）。  
- 在 **`.env.local` 或 CI** 中设置 `NEXT_PUBLIC_API_BASE_URL`，**重新 `build:android` → 拷贝 → 编 APK**。  
- 联网下完成 **至少一条** E2E：例如 **议会发题** 或 **导师流式聊天** 返回可见内容。

### 上午（约 3h）：后端可达性

| 时间块 | 任务 | 具体操作 | 完成标志 |
|--------|------|----------|----------|
| 1h | 部署或启动 BFF | 使 `GET/POST` 议会或 chat 的 URL 在 **手机浏览器** 可访问（可用简单 health 页） | 手机与服务器网络互通 |
| 1h | 整理 API 前缀 | 确认前端请求形态：`BASE_URL + /api/...`（与 `council-main` 等一致） | Postman/curl 在 PC 上 200 |
| 1h | 写死环境并重建静态包 | Web 根配置 `NEXT_PUBLIC_API_BASE_URL` → `npm run build:android` → 拷贝 `out/` → `assembleDebug` | 新 APK 安装覆盖旧版 |

### 下午（约 4h）：真机联调与抓包

| 时间块 | 任务 | 具体操作 | 完成标志 |
|--------|------|----------|----------|
| 1h | WebView 混合内容 | 若 API 为 http，确认 `mixedContentMode` 与网络安全配置 | 无静默拦截 |
| 2h | E2E 测试 | 议会：输入议题 → 等待多角色回复；或导师：发送一句 → 有流式或完整回复 | 截图或录屏存档 |
| 1h | 失败分类 | 分桶：DNS/超时/401/CORS/证书/Mixed Content | 每张桶一条对策写入文档 |

### Day 3 验收清单

- [ ] `NEXT_PUBLIC_API_BASE_URL` **无尾斜杠或** 代码里已 `replace(/\/$/, '')`（与现有实现一致）  
- [ ] 手机 **非 localhost** 访问后端（localhost 在手机上指向手机自身）  
- [ ] 至少 1 条 AI 链路**可见成功**（不要求全部接口完美）  
- [ ] 失败时有用户可见文案（非白屏无提示）——若暂无，记为 Day 4 技术债  

### Day 3 风险与对策

| 风险 | 对策 |
|------|------|
| 公司防火墙 | 换公网 HTTPS 或手机 VPN/同一 WiFi |
| HTTPS 自签证书 | WebView 需网络安全配置 trust 用户证书，或换正式证书 |
| 仅 dev `next dev` 有 API | 必须把 BFF 部署为独立服务；静态包不含 Route Handler |

---

# Day 4：发布准备、体积、权限与回归自动化雏形

### 当日目标

- Debug APK「能发内部测」；整理 **权限说明**、**隐私相关**（INTERNET、存储等）。  
- 起草 **Release** 签名与 `minifyEnabled` 策略（可先不在此日真正上线商店）。  
- 建立 **短回归清单**（10～15 分钟内跑完）。

### 上午（约 3h）：工程与合规粗查

| 时间块 | 任务 | 具体操作 | 完成标志 |
|--------|------|----------|----------|
| 1h | 权限列表 | 读 `AndroidManifest.xml`，每条权限写明用途 | 一页表格 |
| 1h | APK 体积 | 看 `app-debug.apk` MB 级是否异常；`assets` 是否误打包大文件 | 记录基线 |
| 1h | ProGuard/R8（可选） | 若开 minify，先备份；小步验证 Release 不闪退 | 有则记录，无则标「未启用」 |

### 下午（约 4h）：Release 草案与文档

| 时间块 | 任务 | 具体操作 | 完成标志 |
|--------|------|----------|----------|
| 2h | signingConfig 占位 | 在 `gradle` 中预留 `release` 签名（密钥库路径用环境变量或 `local` 忽略文件） | 不提交私钥 |
| 1h | 版本号策略 | `versionCode`/`versionName` 规则（如日历补丁号） | 写进文档 |
| 1h | 更新打包总文档 | 与 `WEB_APP_FEATURES_AND_PACKAGING_PLAN.md` 交叉链接，避免双份矛盾 | 单点真相 |

### Day 4 验收清单

- [ ] 内部测安装说明：最低 Android 版本、如何开「未知来源」、如何卸载重装  
- [ ] 回归清单 v1（见 Day 5 附件可提前写好）  
- [ ] 已知问题列表（API 失败形态、离线能力边界）  

---

# Day 5：总验收、交付物与回顾

### 当日目标

- **最终 Debug APK**（或尝试一次 **Release 未混淆** 试打）交付给产品/测试。  
- **演示脚本** 5～8 分钟可讲完。  
- **复盘**：5 天内卡点与「永久修复」项（脚本化/文档化）。

### 上午（约 3h）：完整回归

按 **《回归清单 v1》** 顺序执行（建议打印或双屏勾选）：

1. 卸载旧 App → 安装当日 APK  
2. 断网：冷启动 → 欢迎页 → Council/Memory 等切换  
3. 联网：`NEXT_PUBLIC_API_BASE_URL` 指向环境 → 议会或聊天一条成功  
4. 进程切换：Home 键 → 再进入，WebView 状态可接受（记录是否需优化）  
5. 低内存（可选）：多开应用后回到 PS²，是否闪退  

### 下午（约 3h）：交付包

准备文件夹 `DELIVER_YYYYMMDD/`：

```text
DELIVER_YYYYMMDD/
├── app-debug.apk                 # 或 release 试打包
├── INSTALL.txt                   # 安装步骤、最低系统版本
├── DEMO_SCRIPT.md                # 演示话术与点击路径
├── ENV.md                        # 构建时 NEXT_PUBLIC_API_BASE_URL 说明（勿写密钥）
└── KNOWN_ISSUES.md               # 已知问题与 workaround
```

### Day 5 验收清单（项目「打包里程碑」完成定义）

- [ ] **交付目录** 五项齐全  
- [ ] **两人以上** 按 `INSTALL.txt` 独立安装成功（若只有一人，则次日补测并更新文档）  
- [ ] `npm run build:android` + 拷贝 + `assembleDebug` 全流程 **写在一段可复制** 的 PowerShell 脚本或 makefile 目标中（减少人为漏步骤）  

---

## 附件 A：一键打包脚本示例（PowerShell）

> 路径按你本机修改 `_WEB`、`_SHELL`。

```powershell
$WEB  = "D:\yyh35\android_project\aigc_application\aigc_application_style"
$SHELL = "D:\yyh35\android_project\ps2shell"
$ASSETS = "$SHELL\app\src\main\assets\web"

Set-Location $WEB
npm run build:android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (Test-Path $ASSETS) { Remove-Item "$ASSETS\*" -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ASSETS | Out-Null
Copy-Item -Path "$WEB\out\*" -Destination $ASSETS -Recurse -Force

Set-Location $SHELL
.\gradlew.bat assembleDebug
```

---

## 附件 B：每日风险登记（模板）

| 日期 | 阻塞问题 | 根因假设 | 当日措施 | 是否解除 |
|------|----------|----------|----------|----------|
| Day x | 例：白屏 | out/ 非 build:android | 重建并覆盖 assets | 是/否 |

---

## 附件 C：与现有文档关系

- **功能与长期打包原则**：`docs/WEB_APP_FEATURES_AND_PACKAGING_PLAN.md`  
- **Android Studio 逐步操作**：`docs/ANDROID_STUDIO.md`  
- **产品功能定义**：`function.md`  
- **模块与目录**：`structure.md`  
- **18 天研发主线**（非仅打包）：`plan.md`  

---

**说明**：本计划是 **5 天「打包与联调交付」专项**；全功能研发仍可按 `plan.md` 并行或顺延。若团队只有半人力，可将 Day 3～4 合并为「联调+文档」4 天，Day 5 只做验收，但**不建议压缩 Day 1～2**（环境与子资源路径错误代价最高）。
