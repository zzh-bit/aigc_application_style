# PS²（Parallel Self 2.0）AI 接手文档

> **用途**：把本文档交给下一个 AI 或开发者，即可理解项目全貌、近期改动、未完成项与正确改法。  
> **仓库**：https://github.com/zzh-bit/aigc_application_style  
> **根目录**：`aigc_application_style/`  
> **最后更新**：2026-05-24（基于 commit `1c89ad6` 及前后对话）

---

## 1. 产品是什么

**Parallel Self 2.0（PS²）** 是一款面向**复杂个人决策**的 Web 应用，打包为 **Android APK（WebView 壳）** 分发。

核心闭环：

1. **议会对话**：激进派 / 保守派 / 未来派 + 主持人（可选导师）围绕用户议题辩论  
2. **叙事推演**：把议题变成 2～4 条互斥决策路径，可视化收益/风险/情绪 + 三派系意见  
3. **记忆库**：本地记忆条目，议会时可检索引用  
4. **导师智库**：虚拟导师 1:1 对话（与议会独立入口，也可导入议会）  
5. **未来信件**、**数据洞察**、**情绪调节（呼吸引导）** 等辅助模块  

产品功能概述（无 PII）：`docs/SOFTWARE_FEATURES_OVERVIEW.md`  
功能清单原文：`function.md`  
目录规划：`structure.md`  
旧版交接（部分过时）：`HANDOFF.md`

---

## 2. 技术栈与双构建模式

| 层 | 技术 |
|----|------|
| 前端 | Next.js 16、React 19、TypeScript、Tailwind 4、shadcn/ui、Framer Motion |
| 后端 | Next.js Route Handlers（`/app/api/*`） |
| LLM | DeepSeek API（`DEEPSEEK_API_KEY`），兼容 vivo 网关 |
| 本地存储 | IndexedDB + localStorage（`lib/storage.ts`） |
| Android | Kotlin WebView 壳 `android/ps2-shell/`，静态资源来自 `out/` |

### 两种 build 模式（必须理解）

| 模式 | 命令 | 用途 |
|------|------|------|
| **Server** | `npm run build` / `npm run dev` | 本地开发、云服务器 `next start`，API 同源 |
| **Export（APK）** | `npm run build:android` | `output: "export"` → 生成 `out/`，**无 Node 运行时** |

APK 内页面离线加载 `assets/web/`，所有 `/api/*` 请求通过：

- `NEXT_PUBLIC_API_BASE_URL` 指向远程 API，或  
- WebView 回环代理 `http://127.0.0.1:37123`（见 `lib/api-client.ts`）

配置示例：`.env.production.example`（默认 `https://api.wdzsyyh.cloud`）

**打 APK 完整流程：**

```powershell
npm run build:android
npm run sync:android          # 复制 out/ → android/ps2-shell/app/src/main/assets/web/
# 然后在 Android Studio 编译安装，或：
npm run rebuild               # 一键 export + sync + gradle + 可选装设备
```

Windows PowerShell 多条命令用 `;` 分隔，不要用 `&&`（可能报错）。

---

## 3. 前端页面结构

入口：`app/page.tsx` → `components/council/ps2-app.tsx`

`ps2-app.tsx` 用 **前端状态机** 切换页面（非 Next 多路由）：

| `PageType` | 组件 | 说明 |
|------------|------|------|
| `welcome` | `WelcomeScreen` | 启动页 |
| `council` | `CouncilMain` | 议会主界面 |
| `memory` | `MemoryVault` | 记忆库 |
| `mentor` | `MentorLibrary` | 导师库 |
| `mentor-chat` | `MentorChat` | 导师 1:1 |
| `letters` | `FutureLetters` | 未来信件 |
| `insights` | `DataInsights` | 数据洞察 |

**叠加层（非 page 切换）：**

- `ProjectionView`：`showProjection` 控制，议会内打开「动态叙事推演」  
- `BreathingGuide`：高焦虑时呼吸引导  

底部导航在 `ps2-app.tsx`；议会页有独立布局，需注意 **底部 nav 与聊天区重叠**（已部分修复）。

---

## 4. API 一览

| 路径 | 文件 | 作用 |
|------|------|------|
| `POST /api/council/debate` | `app/api/council/debate/route.ts` | 议会多角色辩论 |
| `POST /api/council/archive` | `app/api/council/archive/route.ts` | 决策归档读写 |
| `POST /api/projection` | `app/api/projection/route.ts` | **叙事推演**（LLM + grounded 回退） |
| `POST /api/chat` | `app/api/chat/route.ts` | 导师 1:1 聊天 |
| `POST /api/summarize` | `app/api/summarize/route.ts` | 记忆摘要 |
| `POST /api/emotion` | `app/api/emotion/route.ts` | 情绪分析 |
| `POST /api/insights` | `app/api/insights/route.ts` | 洞察报告 |
| `GET /api/health` | `app/api/health/route.ts` | 健康检查 |

**注意**：`app/api/projection/route.ts` 顶部有 `export const dynamic = "force-static"`，因为 export 构建需要静态路由声明；实际运行时 APK 走远程 API。

### 环境变量（服务端）

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | LLM 密钥（议会、推演、chat） |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com/chat/completions`，vivo 需带 `request_id` |
| `NEXT_PUBLIC_API_BASE_URL` | 前端/APK 请求的 API 根地址 |
| `PS2_PROJECTION_*` | 推演超时、重试等（见 route.ts） |

---

## 5. 本地存储 Key（重要）

| Key | 用途 |
|-----|------|
| `council.messages.v1` | 议会消息列表 |
| `council.lastTopic.v1` | 最后发送的议题（推演默认 topic） |
| `council.session.v1` | 会话元数据 |
| `council.projectionSuppress.v1` | 归档流程中禁止自动推演 |
| `memory.memories.v1` | 记忆库 |
| `app.settings.v1` | 用户设置（情绪阈值等） |

定义见 `lib/council-storage-keys.ts`、`lib/app-settings.ts`。

---

## 6. 叙事推演：当前架构（**接手重点**）

这是近期改动最多、用户反馈最集中的模块。

### 6.1 用户期望

- 路径 **2～4 条**，由**议题语义**决定，不是固定「激进 / 理性 / 折中」三骨架  
- 路径 **name** 必须是可执行的决策结果（如 `去北京工作` / `不去北京工作`），**不能**是议会聊天摘录（`你:…激进派:…`）  
- **禁止**无故出现「折中 / 妥协 / 折中试点」路径（除非议题本身在讨论折中）  
- 路径详情 `description` 要有**具体推演内容**，不能是同义反复套话  

### 6.2 Grounded-First 架构（commit `1c89ad6`）

**核心原则**：路径结构（条数、id、name）**永远**由确定性解析决定；LLM **只能 enrich** description / 分数 / nodes / opinions。

```
议题 topic
    ↓
extractDecisionOptionsFromTopic(topic)     ← 只读议题，不拼整段 chat
    ↓
buildDynamicProjectionBranches(topic)        ← 生成 2～4 条 skeleton
    ↓
applyGroundedProjectionStructure(topic, llmBranches?)
    ├─ LLM 有效字段按 index merge 到 skeleton
    └─ finalizeProjectionForClient()         ← API + 客户端统一收口
```

**关键文件**：`lib/projection-grounded.ts`（约 1700 行，推演逻辑中枢）

| 函数 | 作用 |
|------|------|
| `extractDecisionOptionsFromTopic(topic, hostRef?)` | 解析互斥选项；优先 topic，host 仅用主持人单行摘要 |
| `buildDynamicProjectionBranches(topic)` | 生成 skeleton 分支 |
| `isValidBranchName(name, topic)` | 拒绝聊天/派系/重复议题等垃圾 name |
| `filterGenericBlendPaths()` | 过滤折中/妥协路径 |
| `applyGroundedProjectionStructure()` | **核心 merge** |
| `finalizeProjectionForClient()` | 对外统一出口 |
| `buildGroundedProjectionFromCouncil()` | 本地离线兜底（无 LLM） |
| `projectionBranchesLookOffTopic()` | 检测 LLM 输出是否跑题 |

**常量**：`MIN_PROJECTION_BRANCHES = 2`，`MAX_PROJECTION_BRANCHES = 4`

**议题解析规则（简化）**：

1. 「A还是B」→ 对称选项（如 `去西安工作` / `去北京工作`）  
2. 多城市无「还是」→ 按城市列表  
3. 「要不要X」→ `X` / `不X`（如 `去北京工作` / `不去北京工作`）  
4. 英文 should I → Proceed / Hold off  

**反模式（不要再做）**：

- ❌ 把 `topic + hostRef` 整段 chat 拼成 blob 解析选项  
- ❌ 让 LLM 决定 branch `name`，再事后 align  
- ❌ 固定第三条「折中/妥协」骨架（旧 `push/steady/blend` 三件套）  
- ❌ 只针对「西安/北京」写 hardcode patch  

### 6.3 API 层

`app/api/projection/route.ts`：

- `buildFreeformProjectionPrompt()`：告诉 LLM **name/id 由系统定**，只写 enrichment  
- `parseFreeformProjectionBranches()`：解析 LLM JSON  
- `finalizeProjectionBranches()` → 调用 `finalizeProjectionForClient()`  
- LLM 失败 / 跑题 → `buildGroundedProjectionFromCouncil()` 本地兜底  

请求体：

```json
{
  "topic": "占位或首轮议题",
  "focusTopic": "议会页真实短句",
  "contextMessages": [{ "role", "name", "content" }]
}
```

### 6.4 前端层

| 文件 | 作用 |
|------|------|
| `components/council/projection-view.tsx` | 打开推演、调 API、失败走本地；成功后 `finalizeProjectionForClient()` |
| `components/council/decision-path.tsx` | 决策树 UI、**底部 drawer 路径详情**、分支比较面板 |

**UI 已做改动**：

- 归纳议题框缩小，与「生成推演」按钮对齐  
- 路径详情改为 **底部抽屉**（点击空白关闭）  
- 去掉重复 hint 文案  

### 6.5 路径详情 description 的已知问题（**待继续**）

用户反馈：点开路径后中间文字仍是套话，例如：

> 若选择「不去北京工作」：围绕「要不要去北京北京工作」走这一结果路径，收益、风险与节奏随该方向倾斜。

**原因**：

1. `buildBranchForOption()` 里 `rawDesc` 本身就是泛化模板（约 1471–1473 行）  
2. `sanitizeBranchDescription()` 在内容被判定无效时也会 fallback 到类似模板（约 1448–1451 行）  
3. 本地兜底 `buildGroundedProjectionFromCouncil(..., null)` **不传 LLM**，几乎总是模板  
4. APK 若未 `build:android` + `sync:android`，WebView 仍跑旧 JS  

**建议下一步（给接手 AI）**：

- 在 `buildBranchForOption()` 接入 `detectDomainKind()` + 旧 `binaryDecisionTripleBranches` 里已有的 **career/move/relationship** 等领域文案（424–553 行已有 rich templates，但未接到 dynamic branches）  
- 或：本地兜底也尝试用议会 `contextMessages` enrich description（仍不污染 name）  
- 跑 `npm run verify:projection:topics` 并加断言：description 不得匹配 `/走这一结果路径|收益、风险与节奏随该方向倾斜/`  

### 6.6 验证脚本

```powershell
npm run verify:projection:topics
# 或
npx tsx scripts/verify-projection-topics.ts
```

- 18 条议题矩阵 + polluted LLM name 替换测试  
- 报告 HTML：`apk-exports/projection-verify-matrix.html`  

---

## 7. 议会 UI 近期改动

| 文件 | 改动 |
|------|------|
| `components/council/council-main.tsx` | 聊天区缩小避免挡 nav；「会话记录（上下滑动查看）」固定于聊天框左下角（不随消息滚动） |
| `components/council/role-seat.tsx` | 派系图标上移 |
| `components/council/input-bar.tsx` | 输入区布局微调 |
| `components/council/ps2-app.tsx` | 导航/overlay 层级与 safe area |

议会主链路不变：`handleSend()` → POST `/api/council/debate` → 逐角色 thinking delay → 插入消息。

---

## 8. Android 工程

路径：`android/ps2-shell/`

- Web 静态资源：`app/src/main/assets/web/`（由 `scripts/sync-web-to-android-assets.ps1` 从 `out/` 同步）  
- 回环 API 代理：`ApiLoopbackProxy`（端口 37123，与 `lib/api-client.ts` 一致）  
- 一键脚本：`npm run rebuild`、`npm run oneclick:android-stdio`  

**常见坑**：

- 改了 Web 代码但没 sync → APK 行为不变  
- `NEXT_STATIC_ASSET_PREFIX=./` 必须在 `build:android` 时设置（package.json 已配置）  
- 不要把 `android/**/build/`、`.gradle/`、大量 `apk-exports/*.apk` 提交进 git  

---

## 9. Git 与仓库状态

- **Remote**：`origin` → `https://github.com/zzh-bit/aigc_application_style.git`  
- **主分支**：`main`  
- **最新功能 commit**：`1c89ad6` — *Refactor projection to grounded-first structure and improve council UI.*  

该 commit 包含：

- `lib/projection-grounded.ts`（grounded-first 重构）  
- `app/api/projection/route.ts`  
- `components/council/*.tsx`（议会 + 推演 UI）  
- `scripts/verify-projection-topics.ts`  
- `out/` 静态导出更新  
- `docs/SOFTWARE_FEATURES_OVERVIEW.md`  

**未纳入 commit 的本地变更**（接手时注意）：

- `data/council-chat-archives.json`（测试会话数据）  
- 大量 `apk-exports/*.apk`  
- `android/**/build/**` 构建产物  
- 竞赛相关 docx/rar（`docs/初赛/` 等）  
- 部分 docs 被本地删除（`SOFTWARE_FEATURES_HIGHLIGHTS.md` 等），未提交  

推送 GitHub 曾因网络失败；接手后执行 `git push origin main` 确认远端同步。

---

## 10. 未完成 / 已知问题清单

| 优先级 | 问题 | 位置/说明 |
|--------|------|-----------|
| **P0** | 路径详情 description 仍是模板套话 | `buildBranchForOption` / `sanitizeBranchDescription` |
| **P1** | 数据洞察页可能无法滚动 | `components/council/data-insights.tsx`（用户提过，未修） |
| **P2** | 本地兜底推演缺少议会上下文 enrich | `buildGroundedProjectionFromCouncil` 目前 `applyGroundedProjectionStructure(topic, null)` |
| **P2** | `.gitignore` 未排除 build 产物 | 导致 git status 噪音大 |
| **P3** | `HANDOFF.md` 部分过时 | 以本文档为准 |
| **P3** | TypeScript `ignoreBuildErrors: true` | `next.config.mjs`，长期应修 type errors |

---

## 11. 接手 AI 的工作原则

用户明确要求过的约束：

1. **改核心逻辑，不要只 patch 单个议题**（西安/北京只是测试用例）  
2. **路径 name 不能来自 LLM 自由发挥**，必须 grounded-first  
3. **不要**恢复固定「折中/妥协」第三路径  
4. **最小 diff**，匹配现有代码风格，不过度抽象  
5. **不要**擅自 git commit / push，除非用户要求  
6. 中文 UI 产品，与用户沟通用中文  
7. 改 APK 可见行为后提醒：`build:android` → `sync:android` → 重装  

---

## 12. 快速上手命令

```powershell
cd d:\yyh35\android_project\aigc_application\aigc_application_style

npm install
npm run dev                    # http://localhost:3000

npm run lint
npm run build                  # server 模式门禁

npm run verify:projection:topics

npm run build:android
npm run sync:android
npm run rebuild                # 完整 APK 流水线（可选装设备）
```

---

## 13. 关键文件索引（按任务）

| 任务 | 先看这些文件 |
|------|----------------|
| 修推演路径名/条数 | `lib/projection-grounded.ts` |
| 修推演 API/LLM prompt | `app/api/projection/route.ts` |
| 修推演 UI/抽屉 | `components/council/decision-path.tsx`, `projection-view.tsx` |
| 修议会聊天布局 | `components/council/council-main.tsx`, `role-seat.tsx` |
| 修 APK API 连通 | `lib/api-client.ts`, `android/ps2-shell/`, `.env.production` |
| 修导师对话 | `components/council/mentor-chat.tsx`, `app/api/chat/route.ts` |
| 修记忆库 | `components/council/memory-vault.tsx` |
| 修数据洞察 | `components/council/data-insights.tsx`, `app/api/insights/route.ts` |

---

## 14. 附：推演数据形状

```typescript
type GroundedBranch = {
  id: string;
  name: string;                    // 用户可见路径名（grounded 决定）
  probability: number;             // 0～1
  riskScore: number;               // 0～100
  benefitScore: number;
  emotionForecast: string;         // excited | calm | anxious | happy | sad
  description: string;             // 路径详情中间正文 ← 当前质量不足
  nodes: Array<{                   // 决策树节点关键词（3 个：event/finance/emotion）
    id, type, label, sentiment, x, y
  }>;
  opinions: {
    radical: { opinion: string; support: number };
    future: { ... };
    conservative: { ... };
  };
};
```

---

## 15. 对话上下文摘要（为何做 grounded-first）

用户原话核心：

- 推演总是固定「折中/妥协」第三路径，不符合议题  
- 路径名出现议会聊天 dump（`你:要不要去北京工作激进派:…`）  
- 之前修复像「只针对西安/北京」，没有改架构  

已实施：**Grounded-First** — 结构来自 `extractDecisionOptionsFromTopic`，LLM 只 enrich。  
仍待实施：**description 质量** — 模板文案需换成领域化、可读的具体推演段落。

---

*文档结束。接手时请先读第 6 节（推演）和第 10 节（待办），再动代码。*
