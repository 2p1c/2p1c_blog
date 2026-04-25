# Architecture Patterns: RAG + Personality + Greeting

**Domain:** Hugo blog AI chat enhancement
**Researched:** 2026-04-26

## Recommended Architecture

```
                         BUILD TIME
 ┌──────────────────────────────────────────────────────┐
 │  content/posts/*.md                                  │
 │      │                                               │
 │      ▼                                               │
 │  Hugo build (hugo --minify)                          │
 │      │                                               │
 │      ├──► public/*.html (static site)                │
 │      └──► public/posts-index.json ◄── NEW            │
 └──────────────────────────────────────────────────────┘

                         RUNTIME
 ┌─────────────┐     ┌──────────────────────────────────┐     ┌──────────────┐
 │   Browser   │     │        Nginx (:443)              │     │  Node :4310  │
 │             │     │                                  │     │              │
 │ main.js     │────►│ /api/chat/stream ────────────────►────►│ server.js    │
 │             │     │ /api/chat/register ◄── NEW ─────►────►│              │
 │ persona_id  │     │ /api/chat/profile                 │     │ ┌──────────┐ │
 │ user_id     │     │ /posts-index.json (static)        │     │ │Prompt    │ │
 │ localStorage│     │                                  │     │ │Composer  │ │
 └─────────────┘     └──────────────────────────────────┘     │ └──────────┘ │
                                                              │ ┌──────────┐ │
                                                              │ │Persona   │ │
                                                              │ │Manager   │ │
                                                              │ └──────────┘ │
                                                              │ ┌──────────┐ │
                                                              │ │PostsIndex│ │
                                                              │ │Loader    │ │
                                                              │ └──────────┘ │
                                                              └──────────────┘
```

### Key Principle: Static Content, Dynamic Composition

The posts index is generated at build time as a static JSON file. The system prompt is composed per-request by merging three sources: the base identity prompt, the selected persona prompt, and the formatted posts index. Nothing is computed at chat time except prompt assembly.

## Component Boundaries

### 1. Hugo Build Hook -- Posts Index Generator

**Location:** `layouts/_default/index.postsindex.json` (Hugo template, project-level override)

**Responsibility:** At `hugo build` time, iterates all non-draft posts in `content/posts/` and outputs a single JSON array to `public/posts-index.json`.

**Output schema:**
```json
[
  {
    "title": "Docker 容器部署与网络通信原理",
    "description": "深入解析 Docker 容器部署架构...",
    "summary": "通过实际项目经验，详细讲解...",
    "date": "2026-04-25",
    "link": "/posts/docker-container-deployment-network-principles/",
    "tags": ["Docker", "容器化", "网络通信", "部署"],
    "categories": ["技术", "后端开发"]
  }
]
```

**Configuration (hugo.toml additions):**
```toml
[mediaTypes]
  [mediaTypes."application/json"]
    suffixes = ["json"]

[outputFormats.PostsIndex]
  mediaType = "application/json"
  baseName = "posts-index"
  isPlainText = true

[outputs]
  home = ["HTML", "RSS", "PostsIndex"]
```

**Boundary rules:**
- Runs only during `hugo` / `hugo --minify` (not `hugo server`)
- Draft posts MUST be excluded from the index
- File sits at `public/posts-index.json` (production: `/var/www/html/posts-index.json`)
- Static file, served by Nginx, no backend endpoint needed for serving

**Communicates with:** Nothing at runtime. File is consumed by backend on startup.

### 2. Backend: PostsIndex Loader

**Location:** New module in `ai-assistant/src/posts-index.js` (or inline in `server.js` if keeping single-file)

**Responsibility:** Reads and parses `posts-index.json` at server startup. Formats it into a system-prompt-ready text block. Exposes the formatted block for per-request prompt composition.

**Interface:**
```javascript
// Called once at server startup
function loadPostsIndex(filePath) {
  // Returns: string (formatted markdown/text block for system prompt)
  // If file missing: returns empty string, logs warning, degrades gracefully
}

// Config: POSTS_INDEX_PATH env var, default "/var/www/html/posts-index.json"
```

**Discovery mechanism:** `POSTS_INDEX_PATH` environment variable. In production, this points to `/var/www/html/posts-index.json` (Hugo's build output, physically on the same server). In development, it can point to a local path or be left unset (backend degrades gracefully).

**Why filesystem over HTTP fetch:**
- No network dependency at startup
- No circular dependency (backend needs JSON to serve chats, JSON is on same server)
- PM2 restarts are instant without waiting for HTTP readiness
- Single source of truth: the file Hugo built

**Formatted prompt block example:**
```
以下是博客的文章索引，你可以根据这些信息回答用户关于博客内容的问题：

- **Docker 容器部署与网络通信原理** (2026-04-25)
  标签: Docker, 容器化, 网络通信
  摘要: 通过实际项目经验，详细讲解 Docker 容器化部署的完整流程...
  链接: /posts/docker-container-deployment-network-principles/

- **Hello World** (2026-01-01)
  标签: intro
  摘要: This is a summary, can you detect it?????
  链接: /posts/hello-world/
```

**Boundary rules:**
- Loaded once at startup, cached in memory
- File read is synchronous (blocking at startup is acceptable for a KB-scale JSON file)
- If file is unreadable, postsIndexBlock is empty string -- RAG capability is silently absent

**Communicates with:** Filesystem (read). Exposes formatted string to PromptComposer.

### 3. Backend: Persona Manager

**Location:** `ai-assistant/config/personas.json` (config file) + inline module in `server.js`

**Responsibility:** Defines persona presets. Given a `persona_id`, returns the corresponding system prompt fragment.

**Config file format (`ai-assistant/config/personas.json`):**
```json
{
  "default": "warm-senior",
  "personas": {
    "warm-senior": {
      "label": "温暖学长",
      "prompt": "你现在采用\"温暖学长\"的聊天风格。语气温和、有耐心，像一位关心学弟学妹的学长。多用鼓励性的话语，分享学习和生活经验。遇到技术问题时耐心引导，不要直接给答案。"
    },
    "humorous-friend": {
      "label": "幽默朋友",
      "prompt": "你现在采用\"幽默朋友\"的聊天风格。语气轻松、随意，像认识很久的朋友。多开玩笑，偶尔吐槽，用表情包式的文字风格。不要太正经，但也不要太轻浮。"
    },
    "literary-youth": {
      "label": "文艺青年",
      "prompt": "你现在采用\"文艺青年\"的聊天风格。说话带点文学气息，偶尔引用诗词或电影台词。对生活有细腻的感受和表达。敏感但不矫情，文艺但不装。"
    },
    "metal-rock": {
      "label": "重金属黑色死亡摇滚青年",
      "prompt": "你现在采用\"重金属黑色死亡摇滚青年\"的聊天风格。说话硬核、直接、有冲击力。用摇滚、金属文化的表达方式。可以暴躁但有趣，可以黑暗但幽默。像金属乐现场一样有能量。"
    }
  }
}
```

**Interface:**
```javascript
// Called per-request
function getPersonaPrompt(personaId) {
  // personaId: string (e.g., "warm-senior")
  // Returns: string (prompt fragment for that persona)
  // Falls back to default persona if personaId is invalid/missing
}
```

**Boundary rules:**
- Persona definitions live in a JSON config file, NOT in database
- Adding/editing personas = editing json + restarting PM2 (acceptable for current scope)
- The "default" field specifies which persona is used when no persona_id is sent
- `getPersonaPrompt` is called per-request (cheap: simple object lookup)

**Communicates with:** Filesystem (read config at startup). Called by PromptComposer per chat request.

### 4. Backend: Prompt Composer

**Location:** Inline in `server.js` (refactored from current static `systemPrompt`)

**Responsibility:** Assembles the full system prompt per chat request from three sources.

**Assembly order:**
```
system_prompt = basePrompt + "\n\n" + personaPrompt + "\n\n" + postsIndexBlock
```

**Why this order:**
1. **basePrompt first** -- establishes core identity ("你是朱禹同，天津大学研二学生...")
2. **personaPrompt second** -- overlays stylistic instructions on top of identity
3. **postsIndexBlock last** -- provides factual reference material last (LLMs weight later context more for factual retrieval)

**Interface:**
```javascript
function composeSystemPrompt(personaId) {
  const personaPrompt = getPersonaPrompt(personaId);
  return [basePrompt, personaPrompt, postsIndexBlock]
    .filter(Boolean)  // skip empty blocks
    .join('\n\n');
}
```

**Refactoring impact:** The current code loads system prompt once at startup:
```javascript
const systemPrompt = loadSystemPrompt();  // CURRENT: static
```

This must change to per-request composition. The `buildUpstreamMessages` call in the `/chat/stream` handler changes from:
```javascript
messages: buildUpstreamMessages(systemPrompt, contextMessages)  // CURRENT
```
to:
```javascript
const composedPrompt = composeSystemPrompt(personaId);            // NEW
messages: buildUpstreamMessages(composedPrompt, contextMessages)
```

**Boundary rules:**
- Called once per chat request (cheap: string concatenation)
- basePrompt and postsIndexBlock are cached; personaPrompt is a config lookup
- If persona_id is missing/invalid, uses default persona (defined in personas.json)

**Communicates with:** PersonaManager, PostsIndexLoader (reads). Called by `/chat/stream` handler.

### 5. Frontend: Chat Widget Extensions

**Location:** `themes/vintage-web-hugo-theme/assets/js/main.js` (within the existing `initAiChatWidget` function)

Three new sub-modules integrate into the existing widget:

#### 5a. User Identity Manager

**Responsibility:** Manage `currentUserId` in localStorage. Provide registration function.

```javascript
const USER_STORAGE_KEY = 'ai_chat_user_id';
const USER_NAME_KEY = 'ai_chat_user_name';

function getCurrentUserId() {
  return localStorage.getItem(USER_STORAGE_KEY);
}

function getCurrentUserName() {
  return localStorage.getItem(USER_NAME_KEY);
}

async function registerUser(name) {
  const response = await fetch('/api/chat/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!response.ok) throw new Error('register failed');
  const data = await response.json();
  localStorage.setItem(USER_STORAGE_KEY, data.user_id);
  localStorage.setItem(USER_NAME_KEY, data.name);
  return data;
}
```

**Boundary rules:**
- `currentUserId` is separate from `ai_chat_session_id` (session = conversation, user = identity)
- Registration is called by GreetingFlow, not directly by user action
- User identity persists across sessions via localStorage

#### 5b. Persona Selector

**Responsibility:** Render dropdown in chat header. Persist selection.

**PERSONA_STORAGE_KEY:** `'ai_chat_persona_id'`

**UI placement:** Inside `.ai-chat-header`, between the title and the action buttons. A `<select>` dropdown with persona labels.

```html
<select id="ai-chat-persona" class="ai-chat-persona-select" aria-label="选择对话风格">
  <option value="warm-senior">温暖学长</option>
  <option value="humorous-friend">幽默朋友</option>
  <option value="literary-youth">文艺青年</option>
  <option value="metal-rock">重金属黑色死亡摇滚青年</option>
</select>
```

**Behavior:**
- On widget init: read `persona_id` from localStorage, set dropdown value
- On change: save to localStorage (instant, no API call needed)
- On `/chat/stream` request: include `persona_id` in request body
- Labels are hardcoded in JS (shared with personas.json on backend via convention)

**Request body change:**
```javascript
// BEFORE:
body: JSON.stringify({ session_id: sessionId, message: text })

// AFTER:
body: JSON.stringify({
  session_id: sessionId,
  message: text,
  persona_id: getSelectedPersonaId()
})
```

**Boundary rules:**
- Persona selection is client-side only (no API call to change persona)
- Persona_id is sent with each message (backend uses it per-request, allowing mid-conversation persona switches)
- Dropdown labels match persona IDs in backend config via naming convention

#### 5c. Greeting Flow

**Responsibility:** Detect new users. Show greeting + name input inside chat panel. Trigger registration.

**Integration point:** Inside `openPanel()`, after the panel is shown.

**Flow:**
```
openPanel() called
  → if (!getCurrentUserId()) {
      showGreeting()   // replace chat messages with greeting UI
    } else {
      showNormalChat() // existing behavior
    }
```

**Greeting UI (rendered inside `#ai-chat-messages`):**
```html
<div class="ai-chat-greeting">
  <p class="ai-chat-greeting-text">
    你好！我是朱禹同的 AI 助手。在开始聊天之前，能告诉我你的名字吗？
  </p>
  <form id="ai-chat-greeting-form" class="ai-chat-greeting-form">
    <input id="ai-chat-greeting-input" type="text" 
           placeholder="你的名字" maxlength="50" autocomplete="given-name" />
    <button type="submit">开始聊天</button>
  </form>
</div>
```

**Name submission flow:**
```
User types name → submits form
  → registerUser(name) → POST /api/chat/register
  → On success: store user_id + name in localStorage
  → Remove greeting UI
  → Show normal chat UI
  → Display welcome message: "你好 {name}！有什么想聊的吗？"
```

**Edge cases:**
- Empty name: show validation error ("请输入你的名字")
- Registration fails: show error message, allow retry
- User opens and closes panel without submitting name: greeting shows again on next open (no state persisted until registration completes)

**Boundary rules:**
- Greeting replaces the entire messages area content temporarily
- Chat input field is hidden during greeting (user can only interact with the greeting form)
- After registration, the normal chat composer is restored
- Greeting does NOT block the welcome suggestions (they appear after registration)

### 6. Backend: User Profile Endpoints (Phase 1 dependency)

These endpoints ARE assumed to exist from Phase 1. They are the foundation the greeting flow builds on.

**`POST /api/chat/register`:**
- Body: `{ name: string }`
- Creates row in `user_profiles` table
- Returns: `{ user_id: string, name: string, created_at: number }`
- user_id = UUID generated server-side

**`GET /api/chat/profile?user_id=xxx`:**
- Returns: `{ user_id: string, name: string, created_at: number }`
- Used to validate/restore existing user identity

**`user_profiles` table schema (assumed):**
```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Data Flow

### Flow 1: Posts Index -- Build to Chat

```
1. Developer commits new post → CI/CD or manual deploy
2. hugo --minify runs
3. Hugo renders layouts/_default/index.postsindex.json
   → outputs public/posts-index.json (~5-15 KB for ~100 posts)
4. Nginx serves it as a static file (for optional browser access)
5. PM2 restarts ai-assistant (or backend has file watcher)
6. Backend reads /var/www/html/posts-index.json via fs.readFileSync
7. Formats into markdown block, caches in memory
8. Every subsequent chat request includes posts index in system prompt
```

### Flow 2: Chat with Persona

```
1. User selects "幽默朋友" in dropdown
2. PersonaSelector saves "humorous-friend" to localStorage
3. User types message and sends
4. Browser POST /api/chat/stream with:
   { session_id, message, persona_id: "humorous-friend" }
5. Backend PromptComposer:
   basePrompt + getPersonaPrompt("humorous-friend") + postsIndexBlock
6. Composed system prompt sent to DeepSeek API
7. DeepSeek responds with persona-appropriate style
8. SSE streams back to browser
```

### Flow 3: First-Time User Greeting

```
1. User loads page (no currentUserId in localStorage)
2. User opens chat panel (click/hover toggle)
3. openPanel() detects no currentUserId
4. GreetingFlow.showGreeting() renders greeting UI in messages area
5. User sees: "你好！...能告诉我你的名字吗？" + name input
6. User types "小明" and submits
7. GreetingFlow calls POST /api/chat/register { name: "小明" }
8. Backend creates user_profiles row, returns { user_id: "uuid-xxx", name: "小明" }
9. Frontend stores userId + userName in localStorage
10. Greeting UI removed, normal chat UI shown
11. Display: "你好 小明！有什么想聊的吗？" + welcome suggestions
12. Subsequent opens: openPanel() detects currentUserId, skips directly to chat
```

### Flow 4: Returning User

```
1. User loads page (currentUserId exists in localStorage)
2. User opens chat panel
3. openPanel() detects currentUserId → showNormalChat()
4. Welcome message shows cached suggestions, ready for input
5. NO greeting, NO name prompt
```

## Patterns to Follow

### Pattern 1: Graceful Degradation for RAG

**What:** If `posts-index.json` is missing or unreadable, the backend continues operating without blog-awareness. The chat still works -- it just can't answer blog content questions.

**Implementation:**
```javascript
let postsIndexBlock = '';
try {
  const postsIndex = loadPostsIndex(process.env.POSTS_INDEX_PATH || '/var/www/html/posts-index.json');
  postsIndexBlock = formatPostsIndexForPrompt(postsIndex);
} catch (error) {
  console.warn('posts-index.json not available, RAG disabled:', error.message);
  postsIndexBlock = '';  // graceful degradation
}
```

### Pattern 2: Cached-at-Startup, Composed-per-Request

**What:** Heavy operations (file reads, JSON parsing) happen once at startup. Light operations (string concatenation, config lookup) happen per request.

**Rationale:**
- `posts-index.json` is ~5-15 KB for hundreds of posts -- reading and parsing takes <1ms
- prompt composition is string concatenation -- <0.1ms
- persona lookup is object property access -- <0.01ms
- Total per-request overhead: negligible (<0.2ms)

### Pattern 3: Frontend-Owned State, Backend-Owned Data

**What:** `persona_id` and `currentUserId` live in localStorage (frontend-owned). Backend stores user_profiles (backend-owned data). The frontend sends identifiers; the backend validates and uses them.

**Rationale:**
- Persona selection is purely a display preference -- no backend storage needed
- User identity persists across devices via backend database
- Frontend localStorage = fast, offline-tolerant
- Backend database = authoritative, shared

### Pattern 4: Declarative Persona Config

**What:** Persona definitions live in a JSON config file, not in code. The frontend has a parallel definition (labels, values) that MUST stay in sync with the backend config.

**Synchronization strategy:** Both frontend and backend derive from the same source of truth: `ai-assistant/config/personas.json`. The frontend can either:
- (Simple) Hardcode the same labels/values in JS
- (Better) Load `/api/chat/personas` endpoint that serves the persona list

For current scope, hardcoding is acceptable (4 personas, rarely changes). A `/api/chat/personas` endpoint can be added later if the persona list grows.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Backend Parsing Markdown at Runtime

**What:** Backend reads `content/posts/*.md` directly, parses front matter and markdown.

**Why bad:** Introduces a dependency on the Hugo content directory structure. Requires a markdown parser dependency. Redundant with Hugo's existing parsing. Fragile if content format changes.

**Instead:** Let Hugo generate the JSON at build time. Hugo already parses all front matter -- use its output.

### Anti-Pattern 2: Embedding Full Post Content in System Prompt

**What:** Including the full body text of all blog posts in the system prompt.

**Why bad:** 16 posts with full content could easily be 100+ KB. This blows through the system prompt token budget, increases latency, and increases API costs. DeepSeek has context limits.

**Instead:** Include only title, summary, tags, date, and link. If the user asks for specific content, the AI can reference the link. This keeps the index at ~5-15 KB.

### Anti-Pattern 3: Per-Request File Read for Posts Index

**What:** Reading and parsing `posts-index.json` on every chat request.

**Why bad:** Unnecessary I/O. The file doesn't change between Hugo builds. Reading it 1000x/day is wasteful.

**Instead:** Read once at startup, cache in memory. Add a simple reload endpoint (`POST /admin/reload-posts-index`) or PM2 restart for index updates.

### Anti-Pattern 4: Greeting as a Separate Modal/Popup

**What:** Greeting appears in a separate modal dialog on top of the chat panel.

**Why bad:** Creates z-index stacking issues, focus management complexity, and disjointed UX. User has to close a modal to see the chat.

**Instead:** Embed greeting inside the chat panel's messages area. The chat panel is already a positioned overlay. The greeting is the first "message" in the conversation.

## Suggested Build Order

The features have these dependency relationships:

```
Phase 1 (Assumed Complete): User Identity Foundation
  └── user_profiles table + register/profile endpoints
      └── Greeting Flow depends on this

Prompt Composition Refactor (Prerequisite)
  └── Change from static systemPrompt to per-request composition
      ├── RAG depends on this
      └── Personality depends on this

Independent tracks after refactor:
  Track A: RAG (Hugo JSON + Backend Loader)
  Track B: Personality (Config + Frontend Dropdown + Backend persona_id)
  Track C: Greeting (Frontend UI + Register Flow)
```

### Recommended Build Sequence

| Order | Component | Depends On | Rationale |
|-------|-----------|------------|-----------|
| 1 | Prompt Composition Refactor | Nothing | Foundation for both RAG and Personality |
| 2 | Posts Index JSON (Hugo) | Nothing (parallel with #1) | Pure Hugo config, testable independently |
| 3 | Backend PostsIndex Loader | #1, #2 | Wires Hugo output into prompt |
| 4 | Persona Config + Backend | #1 | PersonaManager + per-request composition |
| 5 | Frontend Persona Selector | #4 | Dropdown UI sends persona_id |
| 6 | Frontend Greeting Flow | Phase 1 register endpoint | Requires user identity foundation |
| 7 | Integration testing | All above | End-to-end: RAG + persona + greeting |

**Why this order:**
- The prompt composition refactor is the critical path -- both RAG and personality need it
- Hugo JSON generation is independent and can be built/tested without backend changes
- Backend persona support can be built and tested with curl before frontend work begins
- Greeting flow is fully independent of RAG and personality (uses only Phase 1 endpoints)
- This order minimizes integration risk by building and testing backend capabilities before frontend wiring

## File Map (New and Modified)

### New files:

| File | Purpose |
|------|---------|
| `layouts/_default/index.postsindex.json` | Hugo template for posts-index.json generation |
| `ai-assistant/config/personas.json` | Persona preset definitions |
| `ai-assistant/src/posts-index.js` | Posts index loader (or inline in server.js) |

### Modified files:

| File | Change |
|------|--------|
| `hugo.toml` | Add custom output format + media type for PostsIndex |
| `ai-assistant/server.js` | Refactor prompt composition (static → per-request), add posts index loading, add persona handling |
| `ai-assistant/.env.example` | Add `POSTS_INDEX_PATH` variable |
| `themes/vintage-web-hugo-theme/assets/js/main.js` | Add UserIdentity, PersonaSelector, GreetingFlow modules within `initAiChatWidget` |
| `themes/vintage-web-hugo-theme/layouts/partials/ai-chat.html` | Add persona selector `<select>` to chat header |
| `themes/vintage-web-hugo-theme/assets/css/main.css` | Add styles for persona dropdown, greeting UI, greeting form |

### Unchanged files:

| File | Reason |
|------|--------|
| `ai-assistant/package.json` | No new dependencies needed |
| `content/posts/*.md` | No content format changes |
| Nginx configuration | Existing `/api/*` proxy covers new endpoints |
| PM2 configuration | No changes needed |

## Sources

- Hugo custom output formats: [gohugo.io/configuration/outputs/](https://gohugo.io/configuration/outputs/) (MEDIUM confidence, official docs)
- Hugo `jsonify` function: [gohugo.io/functions/encoding/jsonify/](https://gohugo.io/functions/encoding/jsonify/) (MEDIUM confidence, official docs)
- Existing codebase analysis: `server.js`, `main.js`, `ai-chat.html`, `hugo.toml` (HIGH confidence, primary sources)
