# AI Assistant RAG + Persona File-Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add blog-content-aware answers (RAG) and configurable assistant persona/temperature controls to the existing `ai-assistant` service.

**Architecture:** Use an offline indexing pipeline that reads Hugo content, creates chunked documents with embeddings, and stores them in SQLite tables. At request time, retrieve top-k relevant chunks, inject them into a constrained system prompt, and stream answers with source citations. Persona is controlled by env/config-driven prompt templates and sampling parameters.

**Tech Stack:** Node.js (ESM), Express, better-sqlite3, existing DeepSeek-compatible chat API, SQLite-backed retrieval metadata.

---

## 1) File Structure Plan (what to create/modify)

### Existing files to modify

- `ai-assistant/server.js`
  - Add retrieval call before upstream request.
  - Add persona parameter handling (temperature/top_p/max_tokens/system prompt template).
  - Append citation metadata in final `done` SSE event.

- `ai-assistant/.env.example`
  - Add RAG and persona config variables.

- `ai-assistant/README.md`
  - Add indexing and local test commands.
  - Document new env vars and expected behavior.

- `local_dev_instructions.md`
  - Add local indexing steps and RAG verification workflow.

### New files to create

- `ai-assistant/lib/rag/content-loader.js`
  - Read and normalize Hugo markdown files from `../content`.

- `ai-assistant/lib/rag/chunker.js`
  - Convert markdown to semantically useful chunks.

- `ai-assistant/lib/rag/embedder.js`
  - Embedding provider wrapper (HTTP call abstraction).

- `ai-assistant/lib/rag/store.js`
  - SQLite schema + CRUD for documents/chunks/embeddings.

- `ai-assistant/lib/rag/retriever.js`
  - Query embeddings + similarity scoring + top-k filtering.

- `ai-assistant/lib/rag/prompt-context.js`
  - Format retrieved chunks into model-safe context block.

- `ai-assistant/lib/persona/config.js`
  - Read/validate persona env config.

- `ai-assistant/lib/persona/system-prompt.js`
  - Build final system prompt from template + policy.

- `ai-assistant/scripts/build-rag-index.js`
  - Offline CLI script to (re)build index.

- `ai-assistant/scripts/check-rag-query.js`
  - CLI smoke test for retrieval quality.

- `ai-assistant/config/persona/default.md`
  - Default persona instruction template.

- `ai-assistant/config/persona/tech.md`
  - Optional technical persona variant.

---

## 2) Environment Variable Plan

Add these vars in `ai-assistant/.env.example`:

```dotenv
# Retrieval / indexing
RAG_ENABLED=true
RAG_CONTENT_DIR=../content
RAG_TOP_K=6
RAG_MAX_CONTEXT_CHARS=6000

# Embedding provider
EMBEDDING_API_BASE_URL=https://api.deepseek.com/v1
EMBEDDING_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small

# Persona / generation controls
AI_PERSONA_FILE=./config/persona/default.md
AI_TEMPERATURE=0.4
AI_TOP_P=0.9
AI_MAX_TOKENS=1024

# Citation behavior
AI_CITATION_ENABLED=true
```

---

## 3) Task Breakdown (file-level, executable order)

### Task 1: Add retrieval database schema and storage layer

**Files:**
- Create: `ai-assistant/lib/rag/store.js`
- Modify: `ai-assistant/server.js`

- [ ] Add schema for `rag_documents`, `rag_chunks`, `rag_chunk_embeddings` in `store.js`.
- [ ] Expose functions: `upsertDocument`, `replaceChunksForDocument`, `listChunks`, `getChunkById`.
- [ ] In `server.js`, initialize store alongside existing chat tables.
- [ ] Keep existing chat tables untouched and backward-compatible.

### Task 2: Implement content loading + chunking pipeline

**Files:**
- Create: `ai-assistant/lib/rag/content-loader.js`
- Create: `ai-assistant/lib/rag/chunker.js`

- [ ] Parse markdown files from `RAG_CONTENT_DIR` recursively.
- [ ] Extract front matter fields (`title`, `date`, `tags`, `categories`) and body text.
- [ ] Chunk by heading first, then size window fallback.
- [ ] Output normalized structure:
  - `docId`, `url`, `title`, `chunkIndex`, `chunkText`, `sectionTitle`.

### Task 3: Implement embedding provider + indexing script

**Files:**
- Create: `ai-assistant/lib/rag/embedder.js`
- Create: `ai-assistant/scripts/build-rag-index.js`

- [ ] Add `embedText(text)` and `embedBatch(texts)` in `embedder.js`.
- [ ] Build index script flow:
  1. Load docs
  2. Chunk docs
  3. Embed chunks
  4. Persist vectors + metadata
- [ ] Print indexed document and chunk counts.

### Task 4: Implement runtime retriever

**Files:**
- Create: `ai-assistant/lib/rag/retriever.js`
- Create: `ai-assistant/lib/rag/prompt-context.js`
- Create: `ai-assistant/scripts/check-rag-query.js`

- [ ] Add `retrieveRelevantChunks(query, topK)` API.
- [ ] Compute similarity against stored vectors (cosine or dot-product normalized).
- [ ] Return top-k chunks with `title`, `url`, `snippet`, `score`.
- [ ] Add `formatRagContext(chunks)` to produce compact prompt context.
- [ ] Add `check-rag-query.js` CLI to verify query->top-k outputs.

### Task 5: Integrate RAG into streaming chat endpoint

**Files:**
- Modify: `ai-assistant/server.js`

- [ ] Before upstream payload creation, run retrieval when `RAG_ENABLED=true`.
- [ ] Inject formatted context into system prompt section (not as user text).
- [ ] Add citation payload to SSE `done` event:
  - `sources: [{ title, url, score }]`
- [ ] Ensure retrieval failures degrade gracefully to non-RAG mode.

### Task 6: Add persona config and prompt builder

**Files:**
- Create: `ai-assistant/lib/persona/config.js`
- Create: `ai-assistant/lib/persona/system-prompt.js`
- Create: `ai-assistant/config/persona/default.md`
- Create: `ai-assistant/config/persona/tech.md`
- Modify: `ai-assistant/server.js`

- [ ] Parse and validate `AI_TEMPERATURE`, `AI_TOP_P`, `AI_MAX_TOKENS`.
- [ ] Load persona template file and merge with existing system identity.
- [ ] Apply parameters into upstream payload fields.
- [ ] Enforce safe defaults if config invalid.

### Task 7: Update docs and local runbook

**Files:**
- Modify: `ai-assistant/.env.example`
- Modify: `ai-assistant/README.md`
- Modify: `local_dev_instructions.md`

- [ ] Document new env vars and recommended default ranges.
- [ ] Add commands:
  - `node scripts/build-rag-index.js`
  - `node scripts/check-rag-query.js "你的问题"`
- [ ] Add expected outputs and troubleshooting for empty retrieval.

### Task 8: Verification checklist (manual + command level)

**Files:**
- No new file required (execute commands + record results).

- [ ] Run syntax checks:
  - `cd ai-assistant && npm run check`
- [ ] Build site:
  - `hugo --minify`
- [ ] Build index:
  - `cd ai-assistant && node scripts/build-rag-index.js`
- [ ] Query retrieval smoke test:
  - `cd ai-assistant && node scripts/check-rag-query.js "博客部署在什么平台"`
- [ ] API smoke test (SSE):
  - `curl -N -X POST http://127.0.0.1:4310/chat/stream -H "Content-Type: application/json" -d '{"session_id":"test12345","message":"你网站里写了什么关于 Docker？"}'`
- [ ] Confirm `done` event contains `sources` when RAG enabled.

---

## 4) Complexity & Effort Estimate

- Task 1-2: Medium (1-2 days)
- Task 3-4: Medium/High (1-2 days)
- Task 5-6: Medium (1-2 days)
- Task 7-8: Low/Medium (0.5-1 day)

**Total:** ~4 to 7 working days for a solid MVP.

---

## 5) Quality Gates

- Retrieval precision acceptable on at least 10 representative blog questions.
- No regression on existing `/chat/clear` and non-RAG chat flow.
- Persona changes produce stable style differences without factual drift.
- Answers with site-grounded content include source references.

---

## 6) Rollout Strategy

1. Ship with `RAG_ENABLED=false` by default.
2. Build index in staging, enable RAG for internal verification.
3. Turn on in production after 1-2 days of observation.
4. Keep quick rollback path: set `RAG_ENABLED=false`.

---

## 7) Suggested Commit Sequence (when implementation starts)

1. `feat(rag): add sqlite retrieval schema and index pipeline`
2. `feat(rag): add runtime retriever and context formatter`
3. `feat(chat): integrate retrieval context into stream endpoint`
4. `feat(persona): add prompt template and generation parameter config`
5. `docs: add rag/persona local setup and verification guide`

---

This is a file-level implementation plan only. No production code changes are included in this document.
