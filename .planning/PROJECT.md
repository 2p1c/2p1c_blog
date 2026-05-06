# 2p1c Blog — AI Chat Enhancement

## What This Is

2p1c.life 是朱禹同的个人技术博客，基于 Hugo 静态站点 + DeepSeek AI 对话助手。博客已经接入了流式 AI 对话（支持回访用户识别），本次升级要为 AI 助手加三项核心能力——了解博客内容、自由切换性格、主动认识新用户。

## Core Value

**让 AI 助手不再是泛泛的聊天机器人，而是真正懂这个博客、懂用户偏好的个人助手。**

## Requirements

### Validated

- ✓ Hugo 静态博客站点，支持 Markdown 文章渲染 — existing
- ✓ DeepSeek API 流式对话，SSE 协议 — existing
- ✓ SQLite 会话管理 + user_profiles 用户注册 — Phase 1
- ✓ 用户通过 localStorage UUID 识别回访 — Phase 1
- ✓ Nginx 反向代理 `/api/*` → Node 4310 — existing
- ✓ 对话面板 UI（圆形按钮 + 弹出面板） — existing
- ✓ RAG-01: Hugo build 时生成 `posts-index.json` — Validated in Phase 1
- ✓ RAG-02: 后端加载 `posts-index.json` 并注入 system prompt — Validated in Phase 1
- ✓ RAG-03: AI 能回答博客内容相关问题 — Validated in Phase 1
- ✓ PRS-01: 对话面板顶部显示性格选择下拉框 — Validated in Phase 1
- ✓ PRS-02: 四种预设性格定义 — Validated in Phase 1
- ✓ PRS-03: 性格选择后实时更新 system prompt — Validated in Phase 1
- ✓ PRS-04: 性格选择持久化到 localStorage — Validated in Phase 1
- ✓ GRT-01: 新用户首次打开对话面板时显示 AI 问候 + 名字输入框 — Validated in Phase 1
- ✓ GRT-02: 用户提交名字后自动调用 /register 注册 — Validated in Phase 1
- ✓ GRT-03: 已注册回访用户跳过问候 — Validated in Phase 1

### Active

### Out of Scope

- 全文向量检索 RAG（需要 embedding + 向量数据库） — 当前仅需标题摘要级别的内容感知
- 用户自定义 prompt（自由编辑 system prompt） — 当前仅需预设选择
- 后台管理面板 — 性格预设通过代码/配置文件维护

## Context

- 博客文章存储在 `content/posts/`，每篇文章有 front matter（title, date, description, summary, tags, categories）
- Hugo 主题位于 `themes/vintage-web-hugo-theme/`，项目通过 `layouts/` 和 `assets/` 覆盖主题文件
- AI 后端 `ai-assistant/server.js` 使用 ES modules，通过 PM2 部署在端口 4310
- System prompt 当前从 `config/system-prompt.txt` 或 `AI_SYSTEM_PROMPT` 环境变量加载
- 已有 user_profiles 表和 register/profile 端点（Phase 1）
- 前端 JS 在 `assets/js/main.js`（项目级覆盖），通过 Hugo Pipes 压缩指纹
- 生产服务器运行 `main` 分支，Hugo build 输出到 `/var/www/html/`
- 网络架构：Browser → Nginx (443) → Proxy `/api/` → Node (4310)

## Constraints

- **后端**: 继续使用 Node.js + Express + better-sqlite3，不引入新依赖或数据库
- **前端**: 在现有 chat widget 框架内扩展，不重写对话 UI
- **内容同步**: Hugo build 时静态生成 JSON，避免后端解析 markdown
- **性能**: posts-index.json 应在 KB 级别（非 MB），不影响首屏加载
- **兼容**: 不能破坏已有的流式对话、会话管理、用户注册功能

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hugo build 生成 JSON 而非后端扫描 markdown | Hugo 已有所有 front matter 数据，build 时生成零成本 | — Pending |
| 性格预设持久化到 localStorage | 无需改动后端/数据库，前端自闭环 | — Pending |
| 问候对话内嵌入聊天面板 | 用户体验连贯，不需要处理弹窗的关闭/遮罩 | — Pending |
| posts-index 只含标题摘要不含全文 | 符合"基础内容感知"需求，文件小、可控 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-26 — Phase 1 complete, all 10 requirements validated*
