# 后端上线指南

> 目标：在服务器上稳定运行 `ai-assistant`，并通过 Nginx 提供 `/api/chat/*` 访问。

## 拉取代码

```
cd /var/www/2p1c_blog
git pull
cd ai-assistant
npm ci
```

---\*\*\*

## Step 2：配置环境变量

```bash
cd /var/www/2p1c_blog/ai-assistant
cp .env.example .env
```

编辑 `.env`（至少包含以下关键项）：

```dotenv
PORT=4310
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DB_PATH=./data/chat.db
MAX_MESSAGE_CHARS=2000
MAX_CONTEXT_MESSAGES=20
AI_SYSTEM_PROMPT=your_ai_system_prompt
PROMPT_FILE=./config/system-prompt.txt
```

---

## Step 3：启动前自检

```bash
cd /var/www/2p1c_blog/ai-assistant
npm run check
npm run start
```

另开一个终端验证：

```bash
curl -sS http://127.0.0.1:4310/health
```

预期返回：

```json
{ "ok": true }
```

在终端修改后可以使用`pm2 restart ai-assistant`查看服务是否正常重启。
使用`pm2 logs ai-assistant --lines 200`查看日志输出，确认没有异常。

---

## Step 4：使用 PM2 常驻运行（推荐）

```bash
npm i -g pm2
cd /var/www/2p1c_blog/ai-assistant
pm2 start npm --name ai-assistant -- run start
pm2 save
pm2 startup
```

常用运维命令：

```bash
pm2 status
pm2 logs ai-assistant
pm2 restart ai-assistant
pm2 stop ai-assistant
```

---

## Step 5：配置 Nginx 反向代理

在站点 `server` 块中加入：

```nginx
location /api/chat/stream {
    proxy_pass http://127.0.0.1:4310/chat/stream;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    chunked_transfer_encoding off;
}

location /api/chat/clear {
    proxy_pass http://127.0.0.1:4310/chat/clear;
}

location /api/health {
    proxy_pass http://127.0.0.1:4310/health;
}
```

加载配置：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 6：上线验收

### 6.1 接口验收

```bash
curl -sS https://你的域名/api/health
```

预期返回：

```json
{ "ok": true }
```

### 6.2 前端联调

1. 打开网站任意页面，点击 `Ask AI`。
2. 发送普通问题，确认流式返回。
3. 输入 `/clear`，确认提示“上下文已清空”。

---

## 常见问题速查

### 1) `EADDRINUSE` 端口占用

```bash
lsof -nP -iTCP:4310 -sTCP:LISTEN
```

### 2) 看不到流式输出

优先检查 Nginx 是否已配置：

- `proxy_buffering off;`
- `chunked_transfer_encoding off;`

### 3) 服务异常退出

```bash
pm2 logs ai-assistant --lines 200
```
