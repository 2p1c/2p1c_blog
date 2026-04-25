# Technology Stack

**Project:** 2p1c Blog AI Chat Enhancement (RAG + Personality + Auto-Greeting)
**Researched:** 2026-04-26
**Confidence:** HIGH

## Executive Summary

All three features can be built with **zero new npm dependencies** and **zero new infrastructure**. The existing Hugo + Node.js Express + better-sqlite3 + vanilla JS stack already provides everything needed. Hugo v0.154.3 has built-in custom output formats and `jsonify` for JSON generation. Node.js v23.7.0 has `fs` (already imported). better-sqlite3 (already used for sessions/messages) handles the `user_profiles` table. The frontend chat widget already uses localStorage for session persistence -- same pattern for personality and greeting state.

## Recommended Stack

### Content Awareness (RAG-01, RAG-02, RAG-03)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Hugo custom output format `PostsIndex` | built-in (v0.154.3) | Generate `posts-index.json` at build time | Already in stack. Hugo's `jsonify` pipe + custom output formats produce a clean JSON array from front matter with zero runtime cost. No need for shell scripts, Node.js markdown parsers, or external tools. |
| Hugo template `layouts/_default/index.postsindex.json` | built-in | Template that iterates `where .Site.RegularPages "Section" "posts"` and outputs JSON | Standard Hugo pattern. Lives alongside theme without overriding any HTML layout. Template uses `jsonify` for safe string escaping. |
| Node.js `fs.readFileSync` | built-in (already imported) | Load `posts-index.json` at server start and on refresh | Already used for `system-prompt.txt`. Sync read at startup is fast for KB-scale JSON. |
| `POSTS_INDEX_PATH` env var | built-in (`dotenv` already used) | Configurable path to `posts-index.json` | Follows existing pattern (`PROMPT_FILE`, `DB_PATH`). Defaults to `./data/posts-index.json` for dev, overridden in production `.env`. |

### Personality Selector (PRS-01, PRS-02, PRS-03, PRS-04)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vanilla JS `<select>` element | built-in (DOM) | Personality dropdown in chat header | Already rendering chat UI in `layouts/partials/ai-chat.html`. Adding a `<select>` requires HTML only, no framework. |
| `localStorage` | built-in (Web API) | Persist `persona_id` across visits | Already used for `ai_chat_session_id` and `user_profile_id`. Same pattern, zero new overhead. |
| Server-side persona config (JS object in `server.js` or a `.json` file) | built-in | Define 4 persona system prompts | Keeps persona definitions server-side (not exposed to client). Read via `fs.readFileSync` or inline JS constant. |

### Auto-Greeting for New Users (GRT-01, GRT-02, GRT-03)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `localStorage` `user_profile_id` key | built-in (Web API) | Detect new vs. returning users | Already the pattern for session IDs. If key is absent, user is new and gets greeting flow. |
| `better-sqlite3` | ^11.10.0 (already installed) | `user_profiles` table + `POST /register` endpoint | Already managing sessions and messages. Adding one more table is trivial -- same `db.exec()` pattern, same prepared statements. |
| Express `app.post('/register', ...)` | ^4.21.2 (already installed) | Registration endpoint | Already have `/chat/stream`, `/chat/clear`, `/health`. Adding one more route follows existing patterns exactly. |

## What We Are NOT Using (and Why)

| Rejected | Why Not |
|----------|---------|
| **gray-matter / front-matter (npm)** for parsing markdown front matter | Hugo already has all front matter data during build. Parsing markdown in Node.js at runtime duplicates work Hugo already did. Adds a dependency for no benefit. |
| **Shell script (`hugo list` + `jq`)** for JSON generation | Fragile, requires `jq` on production server, harder to maintain than a Hugo template. Hugo's native `jsonify` is purpose-built for this. |
| **Vector database / embedding service** for full-text RAG | Explicitly out of scope per PROJECT.md. Title+summary+tag awareness via JSON injection is sufficient and keeps the file KB-scale. |
| **React/Vue/Alpine.js** for personality dropdown | Massive overkill. The chat widget is already vanilla JS. A `<select>` + `change` event + `localStorage.setItem` is 10 lines of code. |
| **Express session / cookie-based auth** for user recognition | Already have `localStorage` UUID pattern from Phase 1. Adding server-side sessions for user identity would complicate the stateless chat design. |
| **New npm package for anything** | The constraint is explicit: "不引入新依赖或数据库". All features are achievable with the existing stack. |

## Configuration Additions

### hugo.toml additions (RAG-01)

```toml
[mediaTypes]
  [mediaTypes."application/json"]
    suffixes = ["json"]

[outputFormats]
  [outputFormats.PostsIndex]
    mediaType = "application/json"
    baseName = "posts-index"
    isPlainText = true
    notAlternative = true

[outputs]
  home = ["HTML", "RSS", "PostsIndex"]
```

### .env additions (RAG-02)

```env
POSTS_INDEX_PATH=./data/posts-index.json
```

Note: In production, the deployment script copies `public/posts-index.json` to a path the Node.js server can read (e.g., `./data/posts-index.json` or reads directly from `/var/www/html/posts-index.json`).

### New files to create

| File | Purpose |
|------|---------|
| `layouts/_default/index.postsindex.json` | Hugo template generating aggregated posts JSON |
| `ai-assistant/config/personas.json` (or inline in `server.js`) | 4 persona system prompt definitions |
| `ai-assistant/data/posts-index.json` | Build output, read by server at startup |

## Database Schema Addition

```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
```

Uses existing `better-sqlite3` -- no new dependency.

## Frontend localStorage Keys

| Key | Purpose | Set By |
|-----|---------|--------|
| `ai_chat_session_id` | Session UUID (existing) | `getOrCreateSessionId()` |
| `ai_chat_persona_id` | Selected personality (new) | Personality dropdown `change` handler |
| `ai_chat_user_profile_id` | User profile UUID (new) | Server response from `POST /register` |
| `ai_chat_greeted` | Whether user has seen greeting (new) | Set after greeting flow completes |

## Sources

- Hugo v0.154.3 extended (confirmed via `hugo version`): custom output formats and `jsonify` built-in
- Node.js v23.7.0 (confirmed via `node --version`): `fs.readFileSync` for JSON loading
- better-sqlite3 ^11.10.0 (confirmed via `package.json`): already handles sessions/messages tables
- Hugo custom output formats: https://gohugo.io/templates/output-formats/ -- MEDIUM confidence (page 404'd, verified via third-party tutorials and `resources.FromString` docs)
- Hugo `resources.FromString` + `Publish`: https://gohugo.io/functions/resources/fromstring/ -- HIGH confidence (official docs confirmed pattern)
- Hugo `jsonify` function: built-in, HIGH confidence (standard Hugo template function)
- Existing `ai-assistant/server.js` imports `fs` from `node:fs` (line 4) -- HIGH confidence (verified in codebase)
- Existing `ai-assistant/server.js` uses `dotenv` for env vars (line 2) -- HIGH confidence
