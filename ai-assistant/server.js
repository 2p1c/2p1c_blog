import express from 'express';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3001);
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DB_PATH = process.env.DB_PATH || './data/chat.db';
const MAX_MESSAGE_CHARS = Number(process.env.MAX_MESSAGE_CHARS || 2000);
const MAX_CONTEXT_MESSAGES = Number(process.env.MAX_CONTEXT_MESSAGES || 20);

const app = express();
app.use(express.json({ limit: '64kb' }));

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
`);

const upsertSessionStmt = db.prepare(`
INSERT INTO sessions (id, created_at, updated_at)
VALUES (@id, @createdAt, @updatedAt)
ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
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

const ensureSessionAndInsertMessage = db.transaction((sessionId, role, content) => {
  const now = Date.now();
  upsertSessionStmt.run({ id: sessionId, createdAt: now, updatedAt: now });
  insertMessageStmt.run({ sessionId, role, content, createdAt: now });
});

const clearSessionMessages = db.transaction((sessionId) => {
  const now = Date.now();
  upsertSessionStmt.run({ id: sessionId, createdAt: now, updatedAt: now });
  clearMessagesStmt.run(sessionId);
});

function sendJsonError(res, status, code, message) {
  return res.status(status).json({ code, message });
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

app.get('/health', (req, res) => {
  res.json({ ok: true });
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

app.post('/chat/stream', async (req, res) => {
  const { session_id: rawSessionId, message } = req.body || {};

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

  const upstreamPayload = {
    model: DEEPSEEK_MODEL,
    stream: true,
    messages: contextMessages.map((item) => ({ role: item.role, content: item.content }))
  };

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

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
