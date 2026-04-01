# 本地调试指南

> 目标：在本地同时启动 `ai-assistant` 后端和 Hugo 前端，便于联调 AI Chat 功能与页面样式。

## Step 1：准备依赖

确保本机已安装：

- Node.js 18+（推荐 20+）
- Hugo

首次进入后端目录时执行：

```bash
cd ai-assistant
npm install
```

## Step 2：配置后端环境变量

在 `ai-assistant` 目录下准备 `.env`：

```bash
cd ai-assistant
cp .env.example .env
```

最少需要确认这些配置：

```dotenv
PORT=4310
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DB_PATH=./data/chat.db
MAX_MESSAGE_CHARS=2000
MAX_CONTEXT_MESSAGES=20
AI_SYSTEM_PROMPT=your_ai_system_prompt
PROMPT_FILE=./config/system_prompt.txt
CHAT_LAUNCHER_IMAGE_URL=
AI_AVATAR_URL=
```

如果你希望从文件加载系统提示词，可以额外配置：

```dotenv
PROMPT_FILE=./config/system_prompt.txt
```

如果你希望在 `/chat` 独立页面里自定义图标，也可以配置：

```dotenv
CHAT_LAUNCHER_IMAGE_URL=https://your-domain.com/launcher.png
AI_AVATAR_URL=https://your-domain.com/ai-avatar.png
```

如果你希望在 Hugo 全站悬浮入口里自定义图标，请修改 `hugo.toml`：

```toml
[params.ai_chat]
  enabled = true
  api_base = "/api/chat"
  launcher_image = "https://your-domain.com/launcher.png"
  ai_avatar = "https://your-domain.com/ai-avatar.png"
```

## Step 3：启动后端服务

打开第一个终端，在项目根目录执行：

```bash
cd ai-assistant
npm run dev
```

说明：

- `npm run dev` 会使用 `node --watch server.js`，适合本地改代码后自动重启。
- 如果你只想做一次性验证，也可以用 `npm run start`。
- 如需先检查语法，可先执行 `npm run check`。

## Step 4：启动 Hugo 前端

打开第二个终端，在项目根目录执行：

```bash
hugo server -D
```

说明：

- 前端默认访问地址通常是 `http://localhost:1313`。
- 当前后端已允许本地开发源：`http://localhost:1313` 和 `http://127.0.0.1:1313`。

## Step 5：本地联调验证

后端启动后，先检查健康接口：

```bash
curl -sS http://127.0.0.1:4310/health
```

预期返回：

```json
{"ok":true}
```

如果你把 `PORT` 改成了别的值，请把上面的 `4310` 改成对应端口。

然后在浏览器打开：

```text
http://localhost:1313
```

打开页面里的 AI 入口后，测试以下场景：

1. 页面右下角先显示图片图标（launcher）。
2. 桌面端鼠标悬停图标可展开对话框；移出对话框后自动收起。
3. 移动端点击图标可展开/收起。
4. 发送普通消息，确认可以流式返回。
5. 多轮对话确认上下文生效。
6. 点击“清空”或输入 `/clear`，确认会话上下文被清空。
7. AI 回复生成中头像应有动态动画。

## Step 6：常见调试命令

检查后端语法：

```bash
cd ai-assistant
npm run check
```

查看 Hugo 前端日志：

```bash
hugo server -D
```

查看后端启动日志：

```bash
cd ai-assistant
npm run dev
```

如果你想直接测流式接口，可以执行：

```bash
curl -N -X POST http://127.0.0.1:4310/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test12345","message":"你好"}'
```

如果你想单独查看后端内置 UI 页面，也可以直接打开：

```text
http://127.0.0.1:4310/chat
```

## 常见问题

### 1）前端打开了，但 AI 请求失败

优先检查：

- 后端是否真的启动在 `.env` 里的 `PORT` 上
- 前端调用的接口地址是否与后端端口一致
- 是否从 `localhost:1313` 或 `127.0.0.1:1313` 访问页面

### 2）修改系统提示词后没有生效

优先检查：

- `.env` 中是使用 `AI_SYSTEM_PROMPT` 还是 `PROMPT_FILE`
- `PROMPT_FILE` 指向的文件是否存在
- 后端是否已经重启

### 3）后端端口被占用

Windows PowerShell：

```powershell
Get-NetTCPConnection -LocalPort 4310
```

Linux/macOS：

```bash
lsof -nP -iTCP:4310 -sTCP:LISTEN
```
