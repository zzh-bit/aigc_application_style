## 这是什么

`PS² (Parallel Self 2.0)` 是一个 **Next.js Web 应用**（未来会静态导出并用 Android WebView 打包成 APK）。核心体验是“议会式决策”：激进派/保守派/未来派/（可选）导师 + 主持人总结，结合用户记忆（本地存储 + 简单检索）做个性化建议。

你正在接手的仓库根目录是 `aigc_application_style/`。

---

## 运行与验证（你接手后第一件事）

- 安装依赖并启动：

```bash
npm install
npm run dev
```

- 质量门禁（必须通过）：

```bash
npm run lint
npm run build
```

本项目在 Windows 下建议用 `cmd /c` 执行多条命令串（PowerShell 对 `&&` 可能会报解析错误）。

---

## 当前已完成的改动（本次交付）

### Council 议会输出“思考延迟 + 思索图标 + 有序输出”

- **思考延迟**：每个角色在输出前会先等待一段时间，模拟“思考时间”。
- **思索图标**：思考时，对应席位（`RoleSeat`）右下角会显示旋转图标。
- **有序输出**：角色不会同时输出，而是按顺序逐个输出（前端逐条插入消息）。

相关文件：
- `components/council/council-main.tsx`
- `components/council/role-seat.tsx`

### 导师导入变成“持久参与”

- 以前：点击“导入导师”后导师只发言一次。
- 现在：一旦导入成功（`mentorImported=true`），以后每次在 Council 里发送议题时，都会把 `includeMentor + mentorId` 带给 `/api/council/debate`，导师会像三派系一样参与每轮输出。

相关文件：
- `components/council/council-main.tsx`
- `app/api/council/debate/route.ts`（后端按 `includeMentor` 决定输出顺序）

### 导师席位头像显示“名字”（外国人取姓）

- 导入导师后，导师席位圆形头像不再固定图标，而是显示导师名字。
- 规则：名字含 `·` 或空格时，取最后一段作为“姓”（例：`卡尔·荣格 → 荣格`、`Daniel Kahneman → Kahneman`）。

相关文件：
- `components/council/role-seat.tsx`
- `components/council/council-main.tsx`（`toMentorBadgeText()`）

### Council 聊天流区域下移

- 为避免遮挡导师席位，中间聊天流容器上边距增加（`mt-6 → mt-12`）。

相关文件：
- `components/council/council-main.tsx`

### MentorChat 导师对话“思考延迟”

- 在真正发起 `/api/chat` 请求前，先等待一段随机延迟，让“沉思中”状态更自然。

相关文件：
- `components/council/mentor-chat.tsx`

### Day 8：叙事推演 `/api/projection` + 决策树数据驱动 + 分支对比

- **接口**：`POST /api/projection`，body `{ topic: string }`。返回 `topic`、`branches`（2～3 条路径，含 `riskScore`、`benefitScore`、`emotionForecast`、`opinions` 三派系、`nodes`）、`compared`（默认对比的两条分支 id、`summary`、可选 `delta`）。
- **模型**：若配置 `DEEPSEEK_API_KEY`，会尝试让模型输出严格 JSON；失败则回退到内置 mock 数据。
- **前端**：`ProjectionView` 打开时读取 `council.lastTopic.v1`（用户在议会最后发送的议题），也可手动改议题后点「生成推演」。`DecisionPath` 消费 API 数据；「分支比较」展示 A/B 收益/风险/情绪预测与文案摘要。
- **议会议题写入**：用户在 `CouncilMain` 发送议题后会 `storageSet("council.lastTopic.v1", topic)`。

相关文件：`app/api/projection/route.ts`、`components/council/projection-view.tsx`、`components/council/decision-path.tsx`、`components/council/council-main.tsx`。

### Day 9：Memory Vault 异步摘要、标签、时间线与检索

- **保存后异步摘要**：新记忆 `summaryStatus: pending`，后台请求 `/api/summarize`；请求前 `setTimeout(0)` 让出主线程；失败则用正文截断作为摘要。
- **未完成摘要恢复**：从 IndexedDB 加载列表后，对仍为 `pending` 的记录自动补跑摘要。
- **自动标签**：`extractKeywords` 基于标题+正文，并过滤常见停用词；摘要返回后会与自动标签合并。
- **手动标签**：详情面板可增删标签（沿用原有交互）。
- **时间线**：侧栏增加「全部年份 / 近三年」快速筛选（与按年点击可叠加）。
- **关键词检索**：搜索框支持**空格分隔多词**，需**全部命中**（AND）才显示。

相关文件：`components/council/memory-vault.tsx`、`app/api/summarize/route.ts`。

---

## 关键架构与数据流（让你快速上手）

### 主要页面/容器

- 入口：`app/page.tsx` 渲染 `components/council/ps2-app.tsx`
- 页面路由（前端状态机）：`components/council/ps2-app.tsx`
  - `welcome` / `council` / `memory` / `mentor` / `mentor-chat` / `letters` / `insights`

### Council 议会主链路

- UI：`components/council/council-main.tsx`
  - 用户输入（底部 `InputBar`）→ `handleSend()`
  - 组装 memories（从 `memory.memories.v1` 取 TopK）→ POST `/api/council/debate`
  - 按 replies 顺序：每条 reply 先 `runThinkingDelay(role)` → 再插入消息
  - 导师是否参与：由 `mentorImported` 决定是否传 `includeMentor` 与 `mentorId`

### 后端接口

- 议会辩论：`app/api/council/debate/route.ts`
  - 请求：`{ topic, includeMentor?, mentorId?, memories? }`
  - 返回：`{ replies: [{ role, name, message }] }`
  - 顺序：不含导师 `radical, conservative, future, host`；含导师则多一个 `mentor`（在 host 前）

### 本地数据

- 存储封装：`lib/storage.ts`（IndexedDB + localStorage）
- Council 消息缓存 key：`council.messages.v1`
- Memory Vault 数据 key：`memory.memories.v1`

---

## 手工验收清单（接手后自测）

### Council

- 未导入导师时：发送议题 → 依次出现 激进/保守/未来/主持人（席位会先显示思索图标再发言）
- 点击“导入导师并开启联合建议”后：
  - 本轮会出现导师发言（如果后端可用）
  - **后续每次发送议题**：都会出现 激进/保守/未来/导师/主持人（依次输出）
  - 导师席位头像显示“姓”（如：荣格/卡尼曼）

### MentorChat

- 发送问题后先短暂沉思，再开始流式/非流式输出；取消/重试行为不应卡死。

---

## 下一步建议（你可以直接做的任务）

- **把“导师导入”做成更清晰的产品机制**：例如导入后锁定导师、或允许“更换导师”但需要明确 UI 提示（当前允许下拉切换，但不会自动重新跑一轮导入）。
- **把 Council 的“思考延迟”参数抽成可配置**：例如在设置页调整每个派系的思考时长范围。
- **Android APK 路线**：按 `structure.md` 与 `plan.md` 的 Day16+ 做 `next export/out` + `WebViewAssetLoader` 壳工程。

