# AI Chat 后端上线六步指南

> 目标：在服务器上稳定运行 `ai-assistant`，并通过 Nginx 提供 `/api/chat/*` 访问。

## Step 1：拉取代码并安装依赖

```bash
# 进入部署根目录（如果不存在则创建）
mkdir -p /var/www
cd /var/www

# ⚠️ 注意 0：Node.js 版本要求
# 此项目使用了可选链（?.）特性，需要 Node.js v14 及以上版本（推荐 v18+ 或 v20+）
# 检查版本命令：node -v
# 如果版本太低，请使用以下命令升级：
# curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
# sudo apt-get install -y nodejs

# ⚠️ 注意 1：克隆前需确保服务器已添加 GitHub SSH 公钥
# ...
```

cd /var/www/2p1c_blog
git pull
cd ai-assistant
npm ci
```

---***

## Step 2：配置环境变量

```bash
cd /var/www/2p1c_blog/ai-assistant
cp .env.example .env
```

编辑 `.env`（至少包含以下关键项）：

```dotenv
PORT=4310
DEEPSEEK_API_KEY=你的真实密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DB_PATH=./data/chat.db
MAX_MESSAGE_CHARS=2000
MAX_CONTEXT_MESSAGES=20
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
{"ok":true}
```

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
{"ok":true}
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
