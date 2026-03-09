# AI Chat 当前进展与下一步操作指南

## 一、当前进展（已完成）

### 1) 后端服务 `ai-assistant` 已落地
- 已新增：
  - `ai-assistant/server.js`
  - `ai-assistant/package.json`
  - `ai-assistant/.env.example`
  - `ai-assistant/.gitignore`
  - `ai-assistant/README.md`
- 已实现接口：
  - `GET /health`
  - `POST /chat/clear`
  - `POST /chat/stream`（SSE 流式）
- 已实现能力：
  - DeepSeek（OpenAI 兼容）流式转发
  - SQLite 持久化（`sessions/messages`）
  - 入参校验与错误码基础处理

### 2) 前端接入已完成核心逻辑
- 已新增全站挂载：
  - `themes/vintage-web-hugo-theme/layouts/partials/ai-chat.html`
  - `themes/vintage-web-hugo-theme/layouts/_default/baseof.html` 已引入该 partial
- 已接入前端逻辑：
  - `themes/vintage-web-hugo-theme/assets/js/main.js` 中已初始化 `initAiChatWidget()`
  - 已支持 `/clear` 斜杠命令
  - 已支持调用 `/stream` 并按 SSE 增量渲染

### 3) 配置与契约文档已准备
- `hugo.toml` 已增加：
  - `[params.ai_chat]`
  - `enabled = true`
  - `api_base = "/api/chat"`
- 根目录已有契约文档：`API_CONTRACT.md`

### 4) 已执行自测
- `ai-assistant` 语法检查通过：`npm run check`
- 接口烟测通过（在端口 `4310`）：
  - `/health` -> `200`
  - `/chat/clear` -> `200`

---

## 二、当前缺口（必须完成）

1. **聊天样式尚未补充**：`main.css` 中还没有 `ai-chat` 相关样式。  
2. **前端编译链路未最终验证**：尚未完成一次完整 `hugo` 构建验证。  
3. **反向代理未配置验证**：Nginx `/api/chat/*` 仍需按契约落地并测试流式。

---

## 三、下一步精确操作（按顺序执行）

## Step 1：补充前端样式（必须）
在 `themes/vintage-web-hugo-theme/assets/css/main.css` 追加最小样式块（建议含以下类）：
- `.ai-chat`
- `.ai-chat-toggle`
- `.ai-chat-panel`
- `.ai-chat-header`
- `.ai-chat-messages`
- `.ai-chat-msg`, `.ai-chat-msg-user`, `.ai-chat-msg-assistant`
- `.ai-chat-form`, `#ai-chat-input`, `#ai-chat-send`

验收标准：页面右下角可见入口按钮，展开后消息区和输入区布局正常。

## Step 2：本地构建验证 Hugo（必须）
```bash
cd /Users/zyt/ANW/2p1c_blog
hugo
```
验收标准：构建成功，无模板报错；`public/` 能看到更新后的打包资源。

## Step 3：后端运行验证（必须）
```bash
cd /Users/zyt/ANW/2p1c_blog/ai-assistant
cp .env.example .env
# 编辑 .env，填入真实 DEEPSEEK_API_KEY
npm install
npm run start
```
验收标准：控制台打印端口与 SQLite 路径，无启动异常。

## Step 4：Nginx 反代配置（必须）
在站点 Nginx 配置中加入：
```nginx
location /api/chat/stream {
    proxy_pass http://127.0.0.1:3001/chat/stream;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    chunked_transfer_encoding off;
}

location /api/chat/clear {
    proxy_pass http://127.0.0.1:3001/chat/clear;
}

location /api/health {
    proxy_pass http://127.0.0.1:3001/health;
}
```
验收标准：`/api/health` 可返回 `{"ok":true}`。

## Step 5：端到端联调（必须）
1. 打开站点任意页面，点击 `Ask AI`。  
2. 发送普通问题，确认 AI 文本逐步出现（流式）。  
3. 输入 `/clear`，确认消息区提示“上下文已清空”且后端返回成功。  
4. 再发送问题，确认上下文已重置。

---

## 四、建议的提交拆分（推荐）

1. `feat(chat-ui): add global widget styles`
2. `test(chat): verify hugo build and stream integration`
3. `docs(deploy): add nginx proxy and runbook`

---

## 五、风险与注意事项

1. 不要提交 `ai-assistant/node_modules/` 与 `ai-assistant/data/`。  
2. 若 `3001` 端口冲突，可用 `PORT=4310 npm run start` 临时验证。  
3. 若看不到流式效果，优先检查 Nginx 是否设置了 `proxy_buffering off`。
