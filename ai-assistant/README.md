# AI Assistant Service

一个最小可扩展的聊天后端服务，提供：

- `POST /chat/stream`：SSE 流式输出
- `POST /chat/clear`：清空会话上下文
- `GET /health`：健康检查
- `GET /chat`：内置聊天 UI（悬浮图标 + 展开对话窗）

## 快速启动

```bash
cd ai-assistant
cp .env.example .env
npm install
npm run start
```

默认端口：`.env` 内 `PORT`（示例为 `4310`）

## 环境变量

见 `.env.example`。

- `CHAT_LAUNCHER_IMAGE_URL`：自定义右下角启动图标 URL（可留空）
- `AI_AVATAR_URL`：自定义 AI 头像 URL（可留空）

## 说明

- 使用 SQLite (`better-sqlite3`) 持久化会话。
- 前端通过 `localStorage` 维护 `session_id`。

## Nginx 反向代理示例

将以下配置加入站点 `server` 块：

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

## 联调检查

1. 启动服务：`npm run start`
2. 检查健康接口：`curl -sS http://127.0.0.1:4310/health`
3. 打开聊天 UI：`http://127.0.0.1:4310/chat`
3. 检查清空接口：

```bash
curl -sS -X POST http://127.0.0.1:4310/chat/clear \
  -H 'Content-Type: application/json' \
  -d '{"session_id":"test-session-1234"}'
```
