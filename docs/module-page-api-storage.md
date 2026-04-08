# 模块 -> 页面 -> API -> 存储 映射表

| 模块 | 页面/组件 | API | 存储 |
|---|---|---|---|
| Council 决策议会 | `components/council/council-main.tsx` | `POST /api/council/debate`、`POST/GET /api/council/archive` | `council.messages.v1` + `data/council-chat-archives.json` |
| Mentor 导师聊天 | `components/council/mentor-chat.tsx` | `POST /api/chat`（SSE） | 会话内状态（可扩展到 `mentor.sessions.v1`） |
| Memory 记忆库 | `components/council/memory-vault.tsx` | `POST /api/summarize`（异步摘要可扩展） | `memory.memories.v1` |
| Emotion 情绪感知 | Council / Mentor / Breathing | `POST /api/emotion` | 情绪结果可并入归档记录 |
| Projection 决策推演 | `components/council/projection-view.tsx` | `POST /api/projection`（待补全） | 可选 `decision.paths.v1` |
| Future Letters 未来信件 | `components/council/future-letters.tsx` | 触发接口（待补全） | `letters.v1` |
| Insights 成长洞察 | `components/council/data-insights.tsx` | `GET /api/council/archive`、`POST /api/insights`（待补全） | 基于归档聚合计算 |

## 当前统一字段约定

- 决策归档：`summary`、`emotions`、`keywords`、`date`、`messageCount`
- 情绪枚举：`happy` / `sad` / `anxious` / `calm` / `excited`
- 摘要约束：不超过 50 词（主要来源优先用户输入）
