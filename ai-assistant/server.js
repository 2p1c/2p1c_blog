import express from 'express';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadSystemPrompt() {
  const promptFile = process.env.PROMPT_FILE;
  const fallbackPrompt = (process.env.AI_SYSTEM_PROMPT || '你是朱禹同，天津大学研二的学生。').trim();

  if (!promptFile) {
    return fallbackPrompt;
  }

  const resolvedPromptPath = path.isAbsolute(promptFile)
    ? promptFile
    : path.resolve(__dirname, promptFile);

  try {
    const filePrompt = fs.readFileSync(resolvedPromptPath, 'utf8').trim();
    return filePrompt || fallbackPrompt;
  } catch (error) {
    console.warn(`failed to load prompt file at ${resolvedPromptPath}, fallback to AI_SYSTEM_PROMPT`, error);
    return fallbackPrompt;
  }
}

import { estimateTokens, loadPersonasConfig, loadPostsIndex, composeSystemPrompt } from './src/prompt-composer.js';
import { migrateEmbeddingsTable, searchRelevantPosts, formatRagKnowledge, generateEmbedding, preloadModel } from './src/rag.js';

const personasConfig = loadPersonasConfig(path.resolve(__dirname, './config/personas.json'));
const postsIndexText = loadPostsIndex(
  process.env.POSTS_INDEX_PATH
    ? (path.isAbsolute(process.env.POSTS_INDEX_PATH) ? process.env.POSTS_INDEX_PATH : path.resolve(__dirname, process.env.POSTS_INDEX_PATH))
    : path.resolve(__dirname, './data/posts-index.json')
);

// composePrompt 的包装函数
// 每次请求调用，实现动态性格切换 + RAG 语义检索
async function composePrompt(personaId, userId = null, userMessage = null) {
  const baseIdentity = loadSystemPrompt();

  let userName = null;
  if (userId && typeof userId === 'string') {
    try {
      const profile = selectUserProfileStmt.get(userId.trim());
      if (profile && profile.display_name) {
        userName = profile.display_name;
      }
    } catch (error) {
      // Non-critical — continue without name if lookup fails
    }
  }

  // RAG: 根据用户提问语义检索最相关文章
  let ragKnowledge = '';
  if (userMessage) {
    const queryEmbedding = await generateEmbedding(userMessage);
    if (queryEmbedding) {
      const relevantPosts = searchRelevantPosts(db, queryEmbedding, 3);
      ragKnowledge = formatRagKnowledge(relevantPosts, BASE_URL);
    }
  }

  return composeSystemPrompt(personaId, personasConfig, baseIdentity, ragKnowledge, userName);
}

const PORT = Number(process.env.PORT || 3001);
const BASE_URL = process.env.BASE_URL || 'https://2p1c.life';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DB_PATH = process.env.DB_PATH || './data/chat.db';
const MAX_MESSAGE_CHARS = Number(process.env.MAX_MESSAGE_CHARS || 2000);
const MAX_CONTEXT_MESSAGES = Number(process.env.MAX_CONTEXT_MESSAGES || 20);
const CHAT_LAUNCHER_IMAGE_URL = process.env.CHAT_LAUNCHER_IMAGE_URL || '';
const AI_AVATAR_URL = process.env.AI_AVATAR_URL || '';

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, "static")));

const DEV_ALLOWED_ORIGINS = new Set([
  'http://localhost:1313',
  'http://127.0.0.1:1313'
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && DEV_ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

const resolvedDbPath = path.isAbsolute(DB_PATH) ? DB_PATH : path.resolve(__dirname, DB_PATH);
fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

const db = new Database(resolvedDbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id_created_at ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen ON user_profiles(last_seen_at);
`);

// Migration: add user_id column to sessions if not exists
try {
  db.exec("ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES user_profiles(id)");
} catch {
  // Column already exists - ignore
}

// Migration: ensure post_embeddings table for RAG semantic search
migrateEmbeddingsTable(db);

// 后台预加载 embedding 模型（不阻塞启动）
preloadModel();

// Migration: ensure user_profiles uses display_name (Phase 1 schema)
const profileCols = db.prepare("PRAGMA table_info(user_profiles)").all().map(c => c.name);
if (!profileCols.includes('display_name')) {
  db.exec(`
    DROP TABLE IF EXISTS user_profiles;
    CREATE TABLE user_profiles (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen ON user_profiles(last_seen_at);
  `);
}

const upsertSessionStmt = db.prepare(`
INSERT INTO sessions (id, created_at, updated_at, user_id)
VALUES (@id, @createdAt, @updatedAt, @userId)
ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, user_id = COALESCE(excluded.user_id, user_id)
`);

const insertMessageStmt = db.prepare(`
INSERT INTO messages (session_id, role, content, created_at)
VALUES (@sessionId, @role, @content, @createdAt)
`);

const selectContextStmt = db.prepare(`
SELECT role, content
FROM messages
WHERE session_id = ?
ORDER BY id ASC
LIMIT ?
`);

const clearMessagesStmt = db.prepare('DELETE FROM messages WHERE session_id = ?');

const upsertUserProfileStmt = db.prepare(`
INSERT INTO user_profiles (id, display_name, created_at, last_seen_at)
VALUES (@id, @displayName, @createdAt, @lastSeenAt)
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  last_seen_at = excluded.last_seen_at
`);

const selectUserProfileStmt = db.prepare(`
SELECT id, display_name
FROM user_profiles
WHERE id = ?
`);

const ensureSessionAndInsertMessage = db.transaction((sessionId, role, content) => {
  const now = Date.now();
  upsertSessionStmt.run({ id: sessionId, createdAt: now, updatedAt: now, userId: null });
  insertMessageStmt.run({ sessionId, role, content, createdAt: now });
});

const clearSessionMessages = db.transaction((sessionId) => {
  const now = Date.now();
  upsertSessionStmt.run({ id: sessionId, createdAt: now, updatedAt: now, userId: null });
  clearMessagesStmt.run(sessionId);
});

function sendJsonError(res, status, code, message) {
  return res.status(status).json({ code, message });
}

function sanitizeDisplayName(raw) {
  return raw
    .trim()
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/[<>"'&]/g, '')    // strip special HTML chars
    .slice(0, 50);
}

function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && sessionId.trim().length >= 8 && sessionId.trim().length <= 128;
}

function writeSseEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseUpstreamSseChunk(state, chunkText, onEventData) {
  state.buffer += chunkText;

  while (true) {
    const boundaryIndex = state.buffer.indexOf('\n\n');
    if (boundaryIndex === -1) {
      break;
    }

    const block = state.buffer.slice(0, boundaryIndex);
    state.buffer = state.buffer.slice(boundaryIndex + 2);

    const lines = block.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data:')) {
        continue;
      }
      const payload = line.slice(5).trim();
      onEventData(payload);
    }
  }
}

function buildUpstreamMessages(systemMessage, contextMessages) {
  const normalizedContext = contextMessages
    .filter((item) => item && item.role && typeof item.content === 'string' && item.content.trim())
    .map((item) => ({ role: item.role, content: item.content.trim() }));

  return [
    { role: 'system', content: systemMessage },
    ...normalizedContext.filter((item) => item.role !== 'system')
  ];
}

function toSvgDataUri(svgText) {
  return `data:image/svg+xml,${encodeURIComponent(svgText)}`;
}

function getDefaultLauncherImage() {
  return toSvgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="35" cy="40" r="8" fill="#fff"/><circle cx="61" cy="40" r="8" fill="#fff"/><path d="M30 61c5 8 12 11 18 11s13-3 18-11" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/></svg>'
  );
}

function getDefaultAiAvatar() {
  return toSvgDataUri(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#a)"/><circle cx="23" cy="26" r="6" fill="#fff"/><circle cx="41" cy="26" r="6" fill="#fff"/><rect x="18" y="39" width="28" height="7" rx="3.5" fill="#fff"/></svg>'
  );
}

function renderChatPage() {
  const launcherImage = CHAT_LAUNCHER_IMAGE_URL || getDefaultLauncherImage();
  const aiAvatar = AI_AVATAR_URL || getDefaultAiAvatar();
  const uiConfig = JSON.stringify({
    launcherImage,
    aiAvatar,
    maxMessageChars: MAX_MESSAGE_CHARS
  });

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Assistant</title>
  <style>
    :root {
      --primary: #1d4ed8;
      --primary-soft: rgba(29, 78, 216, 0.12);
      --bg: #ffffff;
      --bg-soft: #f8fafc;
      --text: #0f172a;
      --muted: #64748b;
      --border: #dbe4f0;
      --shadow: 0 14px 38px rgba(15, 23, 42, 0.18);
      --radius: 16px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: var(--text);
      background: radial-gradient(1200px 700px at 100% 0%, #dbeafe 0%, #eff6ff 35%, #f8fafc 100%);
    }

    .widget-root {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 50;
      pointer-events: auto;
    }

    .launcher {
      width: 76px;
      height: 76px;
      border: 0;
      border-radius: 999px;
      padding: 0;
      cursor: pointer;
      overflow: hidden;
      box-shadow: var(--shadow);
      pointer-events: auto;
      background: transparent;
      transition: transform 180ms ease;
    }

    .launcher:hover { transform: translateY(-2px) scale(1.02); }

    .launcher img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .chat-panel {
      position: absolute;
      right: 0;
      bottom: 88px;
      display: none;
      width: min(24rem, calc(100vw - 1.5rem));
      max-height: 50vh;
      height: 220px;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--bg);
      box-shadow: var(--shadow);
      grid-template-rows: auto 1fr auto;
      pointer-events: auto;
      overscroll-behavior: contain;
      transform-origin: bottom right;
      animation: zoomIn 220ms ease;
    }

    .chat-panel.open {
      display: grid;
    }

    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }

    .title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
    }

    .title img {
      width: 22px;
      height: 22px;
      border-radius: 999px;
    }

    .action-btn {
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 8px;
      padding: 5px 8px;
      font-size: 12px;
      color: var(--muted);
      cursor: pointer;
    }

    .messages {
      overflow: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--bg-soft);
    }

    .row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      max-width: 92%;
    }

    .row.user {
      margin-left: auto;
      flex-direction: row-reverse;
    }

    .avatar {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      overflow: hidden;
      flex: 0 0 auto;
      box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .bubble {
      border-radius: 12px;
      padding: 8px 10px;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid transparent;
    }

    .row.assistant .bubble {
      background: #fff;
      border-color: var(--border);
    }

    .row.user .bubble {
      background: #e0e7ff;
      border-color: #c7d2fe;
    }

    .row.thinking .avatar {
      animation: pulseAvatar 1s ease-in-out infinite;
      position: relative;
    }

    .row.thinking .avatar::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 999px;
      border: 2px solid rgba(29, 78, 216, 0.25);
      animation: ring 1.3s ease-out infinite;
    }

    .composer {
      border-top: 1px solid var(--border);
      padding: 10px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      background: #fff;
    }

    .composer input {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 13px;
      outline: none;
    }

    .composer input:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px var(--primary-soft); }

    .send {
      border: 0;
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 13px;
      color: #fff;
      background: var(--primary);
      cursor: pointer;
    }

    .send:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    .tip {
      margin: 4px 10px 8px;
      font-size: 11px;
      color: var(--muted);
    }

    @keyframes zoomIn {
      from { opacity: 0; transform: translateY(8px) translateX(8px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) translateX(0) scale(1); }
    }

    @keyframes pulseAvatar {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.07); }
    }

    @keyframes ring {
      0% { transform: scale(0.8); opacity: 0.9; }
      100% { transform: scale(1.35); opacity: 0; }
    }

    @media (max-width: 640px) {
      .widget-root { right: 12px; bottom: 12px; }
      .launcher { width: 64px; height: 64px; }
      .chat-panel { width: min(24rem, calc(100vw - 1rem)); }
      .chat-panel { bottom: 76px; }
    }
  </style>
</head>
<body>
  <div class="widget-root" id="widgetRoot">
    <button id="launcher" class="launcher" aria-label="打开对话助手">
      <img id="launcherImg" alt="assistant launcher" />
    </button>

    <section id="chatPanel" class="chat-panel absolute z-50 grid w-96 grid-rows-[auto_1fr_auto] overflow-hidden border-primary bg-secondary pointer-events-auto overscroll-contain animate-in border fade-in-0 zoom-in-95 rounded-xl shadow-lg bottom-4 right-4 slide-in-from-bottom-2 slide-in-from-right-2" aria-label="AI chat">
      <header class="chat-header" id="chatHeader">
        <div class="title">
          <img id="headerAvatar" alt="AI avatar" />
          <span>AI Assistant</span>
        </div>
        <div>
          <button class="action-btn" id="clearBtn" type="button">清空</button>
          <button class="action-btn" id="closeBtn" type="button">收起</button>
        </div>
      </header>

      <div class="messages" id="messages"></div>

      <form class="composer" id="composer">
        <input id="input" type="text" maxlength="${MAX_MESSAGE_CHARS}" placeholder="输入你的问题..." autocomplete="off" />
        <button id="sendBtn" class="send" type="submit">发送</button>
      </form>
    </section>
  </div>
  <div class="tip">Hover 图标可展开；移动端点击图标展开/收起。</div>

  <script>
    const CHAT_UI_CONFIG = ${uiConfig};

    const launcher = document.getElementById('launcher');
    const launcherImg = document.getElementById('launcherImg');
    const panel = document.getElementById('chatPanel');
    const headerAvatar = document.getElementById('headerAvatar');
    const messagesEl = document.getElementById('messages');
    const composer = document.getElementById('composer');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const closeBtn = document.getElementById('closeBtn');
    const clearBtn = document.getElementById('clearBtn');

    launcherImg.src = CHAT_UI_CONFIG.launcherImage;
    headerAvatar.src = CHAT_UI_CONFIG.aiAvatar;

    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let isOpen = false;
    let isThinking = false;
    let currentAssistantRow = null;

    const SESSION_STORAGE_KEY = 'chat_session_id';
    const sessionId = (() => {
      const existing = localStorage.getItem(SESSION_STORAGE_KEY);
      if (existing && existing.length >= 8) {
        return existing;
      }
      const created = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(SESSION_STORAGE_KEY, created);
      return created;
    })();

    function adjustPanelHeight() {
      if (!isOpen) {
        return;
      }
      const maxHeight = Math.floor(window.innerHeight * 0.5);
      const minHeight = 190;
      const desired = messagesEl.scrollHeight + 132;
      const finalHeight = Math.max(minHeight, Math.min(desired, maxHeight));
      panel.style.height = String(finalHeight) + 'px';
    }

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function openPanel() {
      if (isOpen) {
        return;
      }
      isOpen = true;
      panel.classList.add('open');
      adjustPanelHeight();
      setTimeout(() => {
        input.focus();
        scrollToBottom();
      }, 80);
    }

    function closePanel() {
      if (!isOpen) {
        return;
      }
      isOpen = false;
      panel.classList.remove('open');
    }

    function togglePanel() {
      if (isOpen) {
        closePanel();
      } else {
        openPanel();
      }
    }

    function createRow(role, text, thinking = false) {
      const row = document.createElement('div');
      row.className = 'row ' + role + (thinking ? ' thinking' : '');

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      const avatarImg = document.createElement('img');
      avatarImg.alt = role === 'assistant' ? 'AI avatar' : 'User avatar';
      avatarImg.src = role === 'assistant'
        ? CHAT_UI_CONFIG.aiAvatar
        : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="32" fill="%23334155"/%3E%3Ccircle cx="32" cy="24" r="10" fill="%23fff"/%3E%3Cpath d="M15 50c3-9 11-14 17-14s14 5 17 14" fill="%23fff"/%3E%3C/svg%3E';
      avatar.appendChild(avatarImg);

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = text;

      row.appendChild(avatar);
      row.appendChild(bubble);
      messagesEl.appendChild(row);

      adjustPanelHeight();
      scrollToBottom();
      return { row, bubble };
    }

    function setThinking(nextThinking) {
      isThinking = nextThinking;
      sendBtn.disabled = nextThinking;
      input.disabled = nextThinking;

      if (currentAssistantRow) {
        currentAssistantRow.classList.toggle('thinking', nextThinking);
      }
    }

    function parseSseEvent(block) {
      const lines = block.split('\\\\n');
      let eventName = 'message';
      let dataText = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        }
        if (line.startsWith('data:')) {
          dataText += line.slice(5).trim();
        }
      }
      if (!dataText) {
        return null;
      }
      try {
        return { event: eventName, data: JSON.parse(dataText) };
      } catch (error) {
        return null;
      }
    }

    async function streamReply(messageText) {
      createRow('user', messageText);
      const assistant = createRow('assistant', '', true);
      currentAssistantRow = assistant.row;
      setThinking(true);

      const response = await fetch('/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: messageText })
      });

      if (!response.ok || !response.body) {
        let text = '';
        try {
          text = await response.text();
        } catch (error) {
          text = '';
        }
        throw new Error(text || ('HTTP ' + response.status));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        buffer += decoder.decode(result.value, { stream: true });

        while (true) {
          const boundary = buffer.indexOf('\\\\n\\\\n');
          if (boundary === -1) {
            break;
          }

          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const parsed = parseSseEvent(block);

          if (!parsed) {
            continue;
          }

          if (parsed.event === 'token') {
            assistant.bubble.textContent += parsed.data.delta || '';
            adjustPanelHeight();
            scrollToBottom();
          }

          if (parsed.event === 'error') {
            throw new Error(parsed.data && parsed.data.message ? parsed.data.message : 'stream error');
          }
        }
      }

      if (!assistant.bubble.textContent.trim()) {
        assistant.bubble.textContent = '（未收到回复）';
      }
    }

    launcher.addEventListener('mouseenter', () => {
      if (supportsHover) {
        openPanel();
      }
    });

    launcher.addEventListener('click', (event) => {
      event.preventDefault();
      if (supportsHover) {
        openPanel();
        return;
      }
      togglePanel();
    });

    closeBtn.addEventListener('click', () => {
      closePanel();
    });

    panel.addEventListener('mouseleave', () => {
      if (!supportsHover) {
        return;
      }
      closePanel();
    });

    clearBtn.addEventListener('click', async () => {
      messagesEl.innerHTML = '';
      adjustPanelHeight();

      try {
        await fetch('/chat/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        });
      } catch (error) {
      }
    });

    composer.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || isThinking) {
        return;
      }
      input.value = '';

      try {
        await streamReply(text);
      } catch (error) {
        createRow('assistant', '请求失败: ' + (error.message || 'unknown error'));
      } finally {
        setThinking(false);
        currentAssistantRow = null;
        input.focus();
      }
    });

    window.addEventListener('resize', adjustPanelHeight);
  </script>
</body>
</html>`;
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/chat', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(renderChatPage());
});

app.post('/chat/clear', (req, res) => {
  const { session_id: sessionId } = req.body || {};

  if (!isValidSessionId(sessionId)) {
    return sendJsonError(res, 400, 'BAD_REQUEST', 'session_id is required and must be a valid string');
  }

  try {
    clearSessionMessages(sessionId.trim());
    return res.json({ cleared: true, session_id: sessionId.trim() });
  } catch (error) {
    console.error('clear session failed:', error);
    return sendJsonError(res, 500, 'UPSTREAM_ERROR', 'failed to clear session');
  }
});

app.post('/chat/register', (req, res) => {
  const { uuid, name } = req.body || {};

  if (typeof uuid !== 'string' || uuid.trim().length < 8 || uuid.trim().length > 128) {
    return sendJsonError(res, 400, 'BAD_REQUEST', 'uuid is required and must be 8-128 characters');
  }

  if (typeof name !== 'string' || name.trim().length === 0) {
    return sendJsonError(res, 400, 'BAD_REQUEST', 'name is required');
  }

  const sanitizedName = sanitizeDisplayName(name);
  if (sanitizedName.length === 0) {
    return sendJsonError(res, 400, 'BAD_REQUEST', 'name is required');
  }
  if (sanitizedName.length > 50) {
    return sendJsonError(res, 400, 'BAD_REQUEST', 'name must be 1-50 characters');
  }

  try {
    const now = Date.now();
    upsertUserProfileStmt.run({
      id: uuid.trim(),
      displayName: sanitizedName,
      createdAt: now,
      lastSeenAt: now
    });
    return res.json({
      success: true,
      profile: { id: uuid.trim(), display_name: sanitizedName }
    });
  } catch (error) {
    console.error('register user profile failed:', error);
    return sendJsonError(res, 500, 'UPSTREAM_ERROR', 'failed to register user profile');
  }
});

app.get('/chat/profile', (req, res) => {
  const uuid = (req.query.uuid || '').trim();

  if (!uuid || uuid.length < 8 || uuid.length > 128) {
    return sendJsonError(res, 400, 'BAD_REQUEST', 'uuid query parameter is required and must be 8-128 characters');
  }

  try {
    const profile = selectUserProfileStmt.get(uuid);
    return res.json({ profile: profile || null });
  } catch (error) {
    console.error('get user profile failed:', error);
    return sendJsonError(res, 500, 'UPSTREAM_ERROR', 'failed to get user profile');
  }
});

app.post('/chat/stream', async (req, res) => {
  const { session_id: rawSessionId, message, persona_id: personaId, user_id: userId } = req.body || {};

  if (!isValidSessionId(rawSessionId)) {
    return sendJsonError(res, 400, 'BAD_REQUEST', 'session_id is required and must be a valid string');
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    return sendJsonError(res, 400, 'BAD_REQUEST', 'message is required');
  }

  if (message.length > MAX_MESSAGE_CHARS) {
    return sendJsonError(res, 400, 'BAD_REQUEST', `message too long, max ${MAX_MESSAGE_CHARS} chars`);
  }

  if (!DEEPSEEK_API_KEY) {
    return sendJsonError(res, 500, 'UPSTREAM_ERROR', 'DEEPSEEK_API_KEY is missing');
  }

  const sessionId = rawSessionId.trim();
  const userMessage = message.trim();

  try {
    ensureSessionAndInsertMessage(sessionId, 'user', userMessage);
  } catch (error) {
    console.error('save user message failed:', error);
    return sendJsonError(res, 500, 'UPSTREAM_ERROR', 'failed to persist message');
  }

  const contextMessages = selectContextStmt.all(sessionId, MAX_CONTEXT_MESSAGES);

  let systemPrompt;
  try {
    systemPrompt = await composePrompt(personaId || null, userId || null, userMessage);
  } catch (error) {
    console.error('composePrompt failed:', error);
    // 兜底：不带 RAG 知识的基本 system prompt
    systemPrompt = composeSystemPrompt(personaId || null, personasConfig, loadSystemPrompt(), '', null);
  }
  const upstreamPayload = {
    model: DEEPSEEK_MODEL,
    stream: true,
    messages: buildUpstreamMessages(systemPrompt, contextMessages)
  };
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let finalAssistantReply = '';

  try {
    const upstreamResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(upstreamPayload)
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const errorText = await upstreamResponse.text();
      writeSseEvent(res, 'error', {
        code: 'UPSTREAM_ERROR',
        message: `upstream failed with status ${upstreamResponse.status}: ${errorText}`
      });
      return res.end();
    }

    const decoder = new TextDecoder('utf-8');
    const upstreamState = { buffer: '' };

    for await (const chunk of upstreamResponse.body) {
      const text = decoder.decode(chunk, { stream: true });

      parseUpstreamSseChunk(upstreamState, text, (payload) => {
        if (!payload || payload === '[DONE]') {
          return;
        }

        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content || '';

          if (delta) {
            finalAssistantReply += delta;
            writeSseEvent(res, 'token', { delta });
          }
        } catch (error) {
          writeSseEvent(res, 'error', {
            code: 'UPSTREAM_ERROR',
            message: 'failed to parse upstream chunk'
          });
        }
      });
    }

    if (finalAssistantReply) {
      ensureSessionAndInsertMessage(sessionId, 'assistant', finalAssistantReply);
    }

    writeSseEvent(res, 'done', {
      reply: finalAssistantReply,
      session_id: sessionId
    });

    return res.end();
  } catch (error) {
    console.error('stream chat failed:', error);
    writeSseEvent(res, 'error', {
      code: 'UPSTREAM_ERROR',
      message: 'stream request failed'
    });
    return res.end();
  }
});

app.listen(PORT, () => {
  console.log(`AI assistant running on port ${PORT}`);
  console.log(`SQLite DB: ${resolvedDbPath}`);
});
