# PS²（Parallel Self 2.0）项目结构说明

> 本文基于 `function.md` 功能要求和 `plan.md` 开发计划整理。  
> 目标：在现有 Next.js 原型基础上，形成可持续迭代到 Android APK 的标准工程结构。

---

## 1. 当前项目结构（已存在）

```plaintext
aigc_application_style/
├── app/
│   ├── page.tsx                          # 首页，渲染 <PS2App />
│   ├── globals.css
│   └── api/
│       ├── chat/route.ts                 # 聊天接口（支持 stream，含限流/降级）
│       ├── emotion/route.ts              # 情绪识别接口（文本规则版）
│       ├── summarize/route.ts            # 摘要接口（mock）
│       └── council/
│           ├── debate/route.ts           # 议会辩论（激进/保守/未来/主持人）
│           └── archive/route.ts          # 决策归档读写（支持筛选）
│
├── components/
│   ├── council/
│   │   ├── ps2-app.tsx                   # 前端主容器（页面状态路由）
│   │   ├── welcome-screen.tsx
│   │   ├── council-main.tsx
│   │   ├── role-seat.tsx
│   │   ├── message-bubble.tsx
│   │   ├── input-bar.tsx
│   │   ├── mood-indicator.tsx
│   │   ├── projection-view.tsx
│   │   ├── decision-path.tsx
│   │   ├── breathing-guide.tsx
│   │   ├── memory-vault.tsx
│   │   ├── memory-fragment.tsx
│   │   ├── mentor-library.tsx
│   │   ├── mentor-chat.tsx
│   │   ├── future-letters.tsx
│   │   ├── data-insights.tsx
│   │   └── nebula-background.tsx
│   ├── ui/                               # shadcn/ui 基础组件
│   └── theme-provider.tsx
│
├── hooks/
│   ├── use-mobile.ts
│   └── use-toast.ts
│
├── lib/
│   ├── storage.ts                        # IndexedDB + localStorage 统一封装
│   ├── memory-context.ts
│   ├── types/domain.ts                   # 核心数据模型定义
│   └── server/
│       └── council-archive.ts
│
├── public/
├── styles/
├── function.md
├── plan.md
└── structure.md
```

---

## 2. 核心数据模型（与计划一致）

数据类型统一定义在 `lib/types/domain.ts`：

- `Conversation` / `ConversationMessage`
- `DecisionRecord`
- `MemoryItem`
- `MentorSession`
- `Letter`
- `InsightReport`

这组模型已覆盖 `function.md` 的核心模块：议会决策、导师智库、记忆融合、时空信件、成长洞察。

---

## 3. 目标结构（18 天迭代后）

以下为建议落地结构（在当前基础上增量演进）：

```plaintext
aigc_application_style/
├── app/
│   ├── api/
│   │   ├── chat/route.ts
│   │   ├── emotion/route.ts
│   │   ├── summarize/route.ts
│   │   ├── projection/route.ts           # 新增：叙事推演结构化输出
│   │   ├── insights/route.ts             # 新增：成长洞察报告生成
│   │   ├── mentor/route.ts               # 新增：导师问答能力收口
│   │   ├── letters/
│   │   │   ├── trigger/route.ts          # 新增：日期/情绪/事件触发检测
│   │   │   └── delivery/route.ts         # 新增：信件送达策略
│   │   └── council/
│   │       ├── debate/route.ts
│   │       └── archive/route.ts
│   └── ...
│
├── components/
│   ├── council/                           # 保持现有 UI 组织方式
│   └── ui/
│
├── lib/
│   ├── types/domain.ts
│   ├── storage.ts
│   ├── rag/
│   │   └── memory-retriever.ts           # 新增：记忆检索 Top-K
│   ├── mentor/
│   │   └── mentor-prompts.ts             # 新增：导师人设与提示词库
│   ├── insights/
│   │   └── metrics.ts                    # 新增：情绪/主题/复盘频率统计
│   ├── letters/
│   │   └── trigger-engine.ts             # 新增：触发策略封装
│   └── server/
│       └── council-archive.ts
│
├── android/                               # WebView 壳（与 docs/BUILD_FULL_PROCESS_ANDROID_APK.md 一致）
│   └── ps2-shell/
│       ├── app/src/main/assets/web/       # 由 npm run sync:android 从 out/ 同步（gitignore）
│       ├── app/src/main/java/com/ps2/shell/MainActivity.kt
│       └── app/src/main/AndroidManifest.xml
│
├── out/                                   # `next export` 输出目录（打包输入）
└── docs/
    ├── api-contract.md                    # 接口输入输出契约
    └── demo-script.md                     # 演示路径脚本
```

---

## 4. 模块到目录映射（开发时按此对齐）

- `Council 决策议会`：`components/council/council-main.tsx` + `app/api/council/*`
- `Mentor 导师智库`：`components/council/mentor-*` + `app/api/mentor/route.ts`
- `Memory 记忆锚点`：`components/council/memory-*` + `lib/rag/memory-retriever.ts`
- `Emotion + Breathing`：`app/api/emotion/route.ts` + `components/council/breathing-guide.tsx`
- `Projection 可视化推演`：`components/council/decision-path.tsx` + `app/api/projection/route.ts`
- `Future Letters 时空信件`：`components/council/future-letters.tsx` + `app/api/letters/*`
- `Insights 成长洞察`：`components/council/data-insights.tsx` + `app/api/insights/route.ts`
- `Settings 深度定制`：建议新增 `components/council/settings-center.tsx`

---

## 5. 实施规则（避免后续返工）

- 所有 AI Key 只放服务端环境变量，前端和 APK 不写 Key。
- API 输入输出统一走类型定义，避免页面与接口字段漂移。
- 优先保证“可演示闭环”，再做动画与高级视觉效果。
- Android 壳工程从 Day16 开始接入，不提前打乱 Web 主线开发节奏。

---
