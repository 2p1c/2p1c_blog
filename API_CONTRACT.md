# AI Chat 接口契约（MVP）

> 架构：REST 风格 + SSE 流式响应  
> 约束：DeepSeek、SQLite 持久化、`localStorage` 会话ID、支持 `/clear` 斜杠命令

## 1. 接口总览

| 接口 | 方法 | 用途 | Content-Type |
|---|---|---|---|
| `/api/chat/stream` | `POST` | 发起流式对话 | 请求：`application/json`；响应：`text/event-stream` |
| `/api/chat/clear` | `POST` | 清空当前会话上下文 | `application/json` |
| `/api/health` | `GET` | 健康检查（可选） | `application/json` |

---

## 2. 请求/响应契约

### 2.1 `POST /api/chat/stream`

**请求体**
```json
{
  "session_id": "string, required",
  "message": "string, required, 1-2000 chars"
}
```

**成功响应**
- HTTP `200`
- Header:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`

**SSE 事件格式**
- `event: token`
  - `data: {"delta":"..."}`
- `event: done`
  - `data: {"reply":"完整回复","session_id":"..."}`
- `event: error`
  - `data: {"code":"UPSTREAM_ERROR","message":"..."}`
- 连接结束后由服务端关闭流

---

### 2.2 `POST /api/chat/clear`

**请求体**
```json
{
  "session_id": "string, required"
}
```

**成功响应**
```json
{
  "cleared": true,
  "session_id": "same-session-id"
}
```

**语义**
- 清空该 `session_id` 的历史消息
- 保留 `session_id` 继续新会话（更符合用户直觉）

---

### 2.3 `GET /api/health`（可选）

**成功响应**
```json
{
  "ok": true
}
```

---

## 3. 错误码约定

| HTTP 状态码 | code | 含义 |
|---|---|---|
| `400` | `BAD_REQUEST` | 参数缺失、类型错误、消息超长 |
| `429` | `RATE_LIMITED` | 请求过于频繁 |
| `500` | `UPSTREAM_ERROR` | DeepSeek 上游错误或服务内部异常 |

**错误响应统一格式**
```json
{
  "code": "BAD_REQUEST",
  "message": "message is required"
}
```

---

## 4. 前端斜杠命令契约

- 当输入框内容 `trim()` 后等于 `/clear`：
  1. 前端不调用 `/api/chat/stream`
  2. 直接调用 `POST /api/chat/clear`
  3. 成功后清空页面消息区
  4. 保留当前 `session_id`（来自 `localStorage`）

---

## 5. 会话与存储约定（SQLite）

- 表建议：
  - `sessions(id TEXT PRIMARY KEY, created_at INTEGER, updated_at INTEGER)`
  - `messages(id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT, created_at INTEGER)`
- 写入时机：
  - 用户消息：收到请求先落库
  - AI 消息：`done` 后以完整回复落库
- 上下文加载：
  - 按 `session_id` 查询最近 N 轮（MVP 可先 10~20 条）

---

## 6. 环境变量（后端）

```bash
DEEPSEEK_API_KEY=xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
PORT=3001
```

> `DEEPSEEK_BASE_URL` 与可用模型名请以 DeepSeek 官方文档为准。

---

## 7. Nginx 反代要点（流式必须）

```nginx
location /api/chat/stream {
    proxy_pass http://127.0.0.1:3001/chat/stream;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    chunked_transfer_encoding off;
}
```

```nginx
location /api/chat/clear {
    proxy_pass http://127.0.0.1:3001/chat/clear;
}
```
