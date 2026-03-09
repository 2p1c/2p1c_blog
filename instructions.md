下面给你一套**工程级但非常轻量的方案**：不改动你现有网站架构，只**新增一个 AI 服务接口**，前端调用即可。核心思想：

> **你的网站 + 一个独立 AI API 服务**

这样最稳定，也最容易维护。

---

# 一、最终架构

```text
用户浏览器
     │
     │  fetch("/api/chat")
     ▼
你的网站服务器
(Nginx / Web Server)
     │
     │ 反向代理
     ▼
AI API 服务
(Node.js / Python)
     │
     │ API Key
     ▼
AI 模型 API
(OpenAI / DeepSeek / Claude)
```

关键点：

* **API Key只在AI服务里**
* 前端只访问 `/api/chat`

---

# 二、推荐实现方式（最简单稳定）

建议新增一个 **Node.js 微服务**。

理由：

* 代码极少
* AI SDK支持最好
* 容易部署
* 很适合网站附加功能

---

# 三、项目结构

在服务器上新建：

```text
ai-assistant
│
├── server.js
├── package.json
├── .env
└── dockerfile (可选)
```

---

# 四、后端实现（核心代码）

## 1 安装依赖

```bash
npm init -y
npm install express cors dotenv node-fetch
```

---

## 2 server.js

```javascript
import express from "express"
import fetch from "node-fetch"
import dotenv from "dotenv"

dotenv.config()

const app = express()

app.use(express.json())
app.use(require("cors")())

app.post("/chat", async (req, res) => {

    const { message } = req.body

    try {

        const response = await fetch("https://api.openai.com/v1/chat/completions", {

            method: "POST",

            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                model: "gpt-4.1-mini",
                messages: [
                    { role: "user", content: message }
                ]
            })

        })

        const data = await response.json()

        res.json({
            reply: data.choices[0].message.content
        })

    } catch (err) {

        res.status(500).json({
            error: "AI request failed"
        })

    }

})

app.listen(3001, () => {
    console.log("AI assistant running on port 3001")
})
```

---

# 五、API Key 安全

`.env`

```text
OPENAI_API_KEY=sk-xxxx
```

运行：

```bash
node server.js
```

服务器会监听：

```
http://localhost:3001/chat
```

---

# 六、Nginx 反向代理（关键）

你的网站可能已经在用 **Nginx**。

在配置中加入：

```nginx
location /api/chat {
    proxy_pass http://localhost:3001/chat;
}
```

这样：

```
https://yourdomain.com/api/chat
```

就会转发到

```
localhost:3001/chat
```

前端无需知道内部服务。

---

# 七、前端调用

在你的网站 JS 中：

```javascript
async function askAI(message){

    const res = await fetch("/api/chat", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            message: message
        })

    })

    const data = await res.json()

    return data.reply
}
```

---

# 八、简单聊天UI

```html
<input id="input"/>
<button onclick="send()">Send</button>

<div id="chat"></div>
```

```javascript
async function send(){

    const input = document.getElementById("input")

    const message = input.value

    const reply = await askAI(message)

    document.getElementById("chat").innerHTML +=

        "<p><b>You:</b> "+message+"</p>" +
        "<p><b>AI:</b> "+reply+"</p>"

}
```

---

# 九、工程级优化（强烈建议）

上线前最好加这几个：

---

## 1 Rate Limit

防止别人刷你的API。

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from "express-rate-limit"

app.use(rateLimit({

  windowMs: 60 * 1000,
  max: 30

}))
```

---

## 2 输入长度限制

```javascript
if(message.length > 2000){
    return res.status(400).json({error:"message too long"})
}
```

---

## 3 CORS限制

只允许你的域名：

```javascript
app.use(cors({
  origin: "https://yourdomain.com"
}))
```

---

# 十、推荐升级（体验更像 ChatGPT）

后期可以加：

### 流式输出

技术：

```
SSE
Server Sent Events
```

这样回答会：

```
逐字输出
```

而不是一次返回。

---

# 十一、部署方式（推荐）

最稳定方式：

```text
Nginx
│
├── Website
│
└── AI Service
      Node.js
```

Node服务后台运行：

```bash
pm2 start server.js
```

安装：

```bash
npm install -g pm2
```

---

# 十二、最终效果

你的网页会多一个功能：

```
┌──────────────────────┐
│ Ask AI               │
│                      │
│ 你：什么是超声导波？  │
│                      │
│ AI：超声导波是一种... │
│                      │
└──────────────────────┘
```

---

💡 **给你一个重要建议**

如果你的网站是科研网站，可以做成：

**AI Research Assistant**

例如：

用户问：

```
How detect delamination in composites?
```

AI回答：

```
Ultrasonic guided waves...
```

甚至可以：

* 接入论文 PDF
* 做 RAG
* 做实验助手

---

如果你愿意，我可以再给你一套 **真正完整的生产级方案**，包括：

* **聊天上下文记忆**
* **流式 ChatGPT 输出**
* **Docker 一键部署**
* **防止 API key 被刷**
* **支持多个模型（OpenAI / DeepSeek / Claude）**

而且整个系统只有 **300 行代码**，但结构是**很多 AI SaaS 网站在用的架构**。
