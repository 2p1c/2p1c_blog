# Requirements: 2p1c Blog AI Chat Enhancement

**Generated:** 2026-04-26
**Mode:** YOLO (auto-included table stakes + active features from PROJECT.md)
**Source:** PROJECT.md + FEATURES.md + ARCHITECTURE.md + STACK.md + PITFALLS.md

## Requirement Categories

### RAG -- Content Awareness (3 requirements)

#### RAG-01: Hugo Build-Time JSON Generation
- **Priority:** P0 (blocks RAG-02)
- **Description:** Hugo build process generates `posts-index.json` containing title, summary, tags, date, and link for all non-draft posts.
- **Acceptance Criteria:**
  - `public/posts-index.json` exists after `hugo --minify`
  - JSON is a valid array of post objects
  - Each object has: `title`, `description`, `summary`, `date`, `link`, `tags` (array), `categories` (array)
  - Draft posts (`draft: true`) are excluded
  - File size < 50KB for typical post volume (~20-50 posts)
  - Chinese characters preserved correctly in output
- **Implementation:** Hugo custom output format `PostsIndex` with template `layouts/_default/index.postsindex.json`
- **Pitfalls:** Template naming convention must match Hugo v0.154.3 lookup order; build verification required
- **Dependencies:** None

#### RAG-02: Backend Posts Index Loading
- **Priority:** P0 (blocks RAG-03)
- **Description:** Node.js server loads `posts-index.json` at startup and formats it into a system-prompt-ready text block. Supports hot-reload via file watcher or restart.
- **Acceptance Criteria:**
  - Server reads `posts-index.json` on startup via `fs.readFileSync`
  - Path configurable via `POSTS_INDEX_PATH` env var (default: `./data/posts-index.json`)
  - Server starts successfully even if file is missing (graceful degradation with log warning)
  - Formatted text block is token-efficient: includes title, date, tags, and link per post in compact format
  - Token budget for posts block capped at 2,500 tokens
- **Implementation:** New function `loadPostsIndex(filePath)` in `server.js` or `ai-assistant/src/posts-index.js`
- **Pitfalls:** Token budget management critical -- posts block competes with personality and history for context window
- **Dependencies:** RAG-01 (needs JSON file to exist)

#### RAG-03: AI Content-Aware Responses
- **Priority:** P0
- **Description:** AI can answer blog content questions using the injected posts index. Queries include: article recommendations, tag/topic search, latest articles list.
- **Acceptance Criteria:**
  - User asks "你最近写了什么文章？" → AI lists recent posts from index
  - User asks "有没有关于 Docker 的文章？" → AI finds relevant posts by tag/title match
  - AI recommends posts in-character (personality is maintained while answering)
  - AI does not hallucinate non-existent posts
  - Content answers stay within the TONE layer even when retrieving factual data from KNOWLEDGE layer
- **Implementation:** Posts index injected into system prompt under `## KNOWLEDGE` section
- **Pitfalls:** Attention competition between personality and content (mitigated by layered prompt structure); verify with explicit cross-tests
- **Dependencies:** RAG-02

### PRS -- Personality Presets (4 requirements)

#### PRS-01: Personality Selector UI
- **Priority:** P0
- **Description:** Dropdown selector in chat panel header allowing users to choose from 4 preset personalities.
- **Acceptance Criteria:**
  - `<select>` dropdown visible at top of chat panel (above messages)
  - 4 options displayed: 温暖学长, 幽默朋友, 文艺青年, 重金属黑色死亡摇滚青年
  - Dropdown styled consistently with existing chat widget (retro/vintage theme)
  - Mobile-responsive: touch-friendly, no layout break at 320px
  - Current selection clearly indicated
- **Implementation:** HTML `<select>` in `layouts/partials/ai-chat.html` + CSS in `assets/css/` + JS event handler
- **Pitfalls:** Chat panel hover-based open/close must not interfere with dropdown interaction
- **Dependencies:** None (UI-only, testable without backend)

#### PRS-02: Persona Prompt Definitions
- **Priority:** P0 (blocks PRS-03)
- **Description:** Server-side definitions for 4 personality presets as system prompt fragments (150-300 tokens each).
- **Acceptance Criteria:**
  - 4 persona prompts defined in `ai-assistant/config/personas.json`
  - Each persona is 150-300 tokens (concise, focused on tone/style)
  - Personalities are distinct: warm/supportive, playful/humorous, literary/poetic, aggressive/raw
  - Prompts avoid complex role-play scenarios (reduces drift)
  - Default persona: 温暖学长 (warmest, closest to base model behavior, least drift risk)
  - Server validates persona config on startup; fails fast if malformed
- **Implementation:** JSON config file with `{ id, name, prompt }` structure, loaded via `fs.readFileSync`
- **Pitfalls:** Overly long persona prompts accelerate drift and consume token budget; keep concise
- **Dependencies:** None

#### PRS-03: Dynamic System Prompt Composition
- **Priority:** P0 (critical path -- both RAG and PRS depend on this)
- **Description:** Refactor system prompt from static startup-loaded string to per-request dynamic composition: `basePrompt + personaPrompt(personaId) + postsIndexBlock`.
- **Acceptance Criteria:**
  - `composeSystemPrompt(personaId)` function returns complete prompt string
  - Prompt structure follows layered format: `## IDENTITY` → `## TONE` → `## KNOWLEDGE`
  - TONE section uses bookend strategy: personality reminder at both start and end positions
  - KNOWLEDGE section placed at end (recency position) for retrieval accuracy
  - Token budget computed per-request; logged when exceeds 80% of target
  - Backward compatible: existing conversations continue to work
  - `persona_id` received from client POST body; defaults to "warm-senior" if missing
- **Implementation:** Refactor `systemPrompt` constant to `composeSystemPrompt(personaId)` function in `server.js`
- **Pitfalls:** Token budget silent overflow degrades all three features; implement explicit logging
- **Dependencies:** PRS-02, RAG-02

#### PRS-04: Personality Persistence
- **Priority:** P1
- **Description:** User's selected personality persists in localStorage across page loads and return visits.
- **Acceptance Criteria:**
  - `persona_id` saved to `localStorage` key `ai_chat_persona_id` on selection change
  - On page load, reads `ai_chat_persona_id` and pre-selects the saved personality
  - If no saved preference, defaults to "warm-senior" (温暖学长)
  - `persona_id` sent in POST body to `/chat/stream` with each message
  - Works correctly with existing `ai_chat_session_id` localStorage pattern
- **Implementation:** Vanilla JS, identical pattern to existing session ID persistence
- **Pitfalls:** None (proven pattern, already used for session IDs)
- **Dependencies:** PRS-01, PRS-03

### GRT -- Auto-Greeting for New Users (3 requirements)

#### GRT-01: New User Detection + Greeting Flow
- **Priority:** P0
- **Description:** First-time visitors see an AI greeting message with a name input field inline in the chat messages area. Returning users skip directly to normal chat.
- **Acceptance Criteria:**
  - New user (no `ai_chat_user_profile_id` in localStorage): greeting message appears as first AI message
  - Greeting text: AI introduces itself and asks user's name
  - Inline name input field rendered below greeting message (text input + submit button)
  - Chat panel pinned open during greeting flow (mouseleave close disabled)
  - Returning user (has `ai_chat_user_profile_id`): greeting skipped, normal chat UI shown
  - `ai_chat_greeted` flag set in localStorage after greeting flow completes
- **Implementation:** Frontend state machine: check localStorage → if new: render greeting + input → if returning: normal UI
- **Pitfalls:** Race condition between chat panel hover-open and greeting pin; input focus/blur must work with panel pin state
- **Dependencies:** None (frontend-only detection)

#### GRT-02: Name Registration Endpoint
- **Priority:** P0
- **Description:** POST endpoint that creates or updates a user profile record in SQLite.
- **Acceptance Criteria:**
  - `POST /chat/register` accepts `{ uuid, name }` JSON body
  - Creates row in `user_profiles` table: `id`, `display_name`, `created_at`, `last_seen_at`
  - UUID uniqueness enforced (PRIMARY KEY)
  - Returns `{ success: true, profile: { id, display_name } }` on success
  - Returns `{ success: false, error: "..." }` on validation failure (empty name, missing uuid)
  - Name length: 1-50 characters
  - Input sanitized (trim whitespace, no HTML/script injection)
  - `last_seen_at` updated on re-registration (idempotent)
- **Implementation:** Express route + better-sqlite3 prepared statement + `user_profiles` table
- **Pitfalls:** XSS in display name; sanitize server-side before storage and rendering
- **Dependencies:** GRT-01 (called by frontend after name submission)

#### GRT-03: Name-Aware Conversation
- **Priority:** P1
- **Description:** After registration, AI uses the user's name in conversation and injects it into the system prompt identity section.
- **Acceptance Criteria:**
  - `/chat/profile?uuid=xxx` returns `{ id, display_name }` or `null` (existing endpoint, validated working)
  - System prompt includes user's name in `## IDENTITY` section: `当前正在和你对话的用户叫「{name}」`
  - AI naturally uses the name in greetings and occasionally in conversation
  - Name retrieval is fast (<5ms, single indexed query)
- **Implementation:** Existing `GET /chat/profile` endpoint (Phase 1), name injected into composed system prompt
- **Pitfalls:** Name should not dominate conversation; inject as context, not as instruction to use constantly
- **Dependencies:** GRT-02

## Table Stakes (Already Validated)

These are baseline requirements from Phase 1. They must continue working after this milestone's changes.

| Requirement | Status | Regression Risk |
|-------------|--------|-----------------|
| Streaming AI responses (SSE) | Existing | LOW -- SSE relay unchanged |
| Session persistence (SQLite + localStorage) | Existing | LOW -- session table untouched |
| Clear conversation button | Existing | LOW -- `/chat/clear` unchanged |
| Character limit indicator | Existing | LOW -- frontend-only |
| Mobile-responsive chat widget | Existing | MEDIUM -- new dropdown and greeting input must be tested at 320px |
| API health indicator | Existing | LOW -- `/health` endpoint unchanged |
| CORS for local development | Existing | LOW -- middleware unchanged |
| User profile query (GET /chat/profile) | Existing | LOW -- reused, not modified |

## Non-Functional Requirements

### Performance
- `posts-index.json` < 50KB for typical post volume
- System prompt composition < 5ms (string concatenation, no I/O)
- `/chat/register` response < 50ms (simple SQLite insert)
- First-meaningful-paint impact: zero (JSON static file, no JS overhead for non-chat pages)
- Token budget per request logged when >80% of target

### Security
- Display name sanitized server-side before storage (XSS prevention)
- `persona_id` validated against known presets (reject unknown values)
- `/chat/register` rate-limited (reuse existing rate limit middleware if present)
- `posts-index.json` path validated (no path traversal via env var)
- No new secrets or API keys introduced

### Compatibility
- All existing chat features continue to work
- No breaking changes to `/chat/stream` request format (new fields are additive: `persona_id`, `user_id`)
- Existing sessions and messages preserved
- Hugo `hugo server -D` still works (PostsIndex output excluded from dev server or handled gracefully)

### Maintainability
- Persona config as JSON file (easy to add/remove presets without code changes)
- `POSTS_INDEX_PATH` env var for deployment flexibility
- Layered prompt structure with explicit section markers (debuggable)
- Token budget logging for monitoring

## Out of Scope (Confirmed)

| Item | Reason |
|------|--------|
| Full-text vector RAG (embeddings + vector DB) | Complexity-to-value ratio terrible at current post volume; revisit at 200+ posts |
| Free-text custom system prompt | Security risk (prompt injection); curated presets sufficient |
| Server-side persona/user preference storage | GDPR/auth overhead; localStorage is zero-latency and privacy-preserving |
| Personality-specific avatars or visual theming | Increases CSS surface area 4x; personality lives in text, not chrome |
| Popup/Modal-based greeting | Modal fatigue; embedded chat greeting keeps user in flow |
| Permanent conversation starter buttons | Visual clutter for returning users; only during first-visit greeting |
| User dashboard or admin panel | Explicitly excluded; persona config via file, user data via SQLite |

## Traceability

All 10 requirements map to a single Phase 1 (the next sequential integer phase). They share the system prompt composition refactor as a critical-path prerequisite.

| Requirement | Category | Phase | Plan | Status |
|-------------|----------|-------|------|--------|
| RAG-01 | Content Awareness | Phase 1 | 01-02 | Verified |
| RAG-02 | Content Awareness | Phase 1 | 01-01 | Verified |
| RAG-03 | Content Awareness | Phase 1 | 01-02 | Verified |
| PRS-01 | Personality Presets | Phase 1 | 01-03 | Verified |
| PRS-02 | Personality Presets | Phase 1 | 01-01 | Verified |
| PRS-03 | Personality Presets | Phase 1 | 01-01 | Verified |
| PRS-04 | Personality Presets | Phase 1 | 01-03 | Verified |
| GRT-01 | Auto-Greeting | Phase 1 | 01-04 | Verified |
| GRT-02 | Auto-Greeting | Phase 1 | 01-04 | Verified |
| GRT-03 | Auto-Greeting | Phase 1 | 01-04 | Verified |

**Mapped: 10/10** ✓

```
Phase 1: Prompt Refactor + All Three Features
├── Plan 01-01: Prompt Composition Refactor (PRS-02, PRS-03, RAG-02) -- critical path
├── Plan 01-02: RAG Content Pipeline (RAG-01, RAG-03)
├── Plan 01-03: Personality Presets UI (PRS-01, PRS-04)
└── Plan 01-04: Auto-Greeting Flow (GRT-01, GRT-02, GRT-03)
```

**Build order within phase:**
1. 01-01: PRS-02 + PRS-03 + RAG-02 (prompt composition refactor -- critical path)
2. 01-02: RAG-01 + RAG-03 (Hugo template + content-aware integration -- can run parallel with 01-03)
3. 01-03: PRS-01 + PRS-04 (frontend dropdown + persistence -- can run parallel with 01-02)
4. 01-04: GRT-01 + GRT-02 + GRT-03 (greeting flow -- least dependency, most UX complexity)

---

*Generated from PROJECT.md requirements, 4 research agents (Features, Architecture, Pitfalls, Stack), and YOLO auto-inclusion of table stakes.*
