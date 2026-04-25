---
phase: 01-ai-chat-enhancement
plan: 01
subsystem: ai-assistant-backend
tags: [system-prompt, personas, posts-index, token-budget, prompt-composition]
dependency_graph:
  provides: [dynamic-prompt-composition, persona-presets, posts-index-loading, token-budget-monitoring]
  affects: [PRS-02, PRS-03, RAG-02]
tech_stack:
  added: []
  patterns:
    - "Layered prompt structure: ## IDENTITY -> ## TONE -> ## KNOWLEDGE with bookend strategy"
    - "Pure logic extraction to testable ESM module (src/prompt-composer.js)"
    - "Graceful degradation: server starts without posts-index.json or personas.json"
    - "Per-request dynamic prompt composition via composePrompt(personaId)"
    - "TDD with node:test (built-in, zero dependencies)"
key_files:
  created:
    - ai-assistant/config/personas.json - 4 persona preset definitions (warm-senior, humorous-friend, literary-youth, metal-rock-youth)
    - ai-assistant/src/prompt-composer.js - Dynamic prompt composition pipeline (estimateTokens, loadPersonasConfig, loadPostsIndex, composeSystemPrompt)
    - ai-assistant/test/prompt-composer.test.js - 18 unit tests across 4 test suites
  modified:
    - ai-assistant/server.js - Integrated dynamic prompt composition, persona_id extraction, replaced static systemPrompt
    - ai-assistant/.env.example - Added POSTS_INDEX_PATH env var
decisions:
  - "Extracted prompt-composer module to src/prompt-composer.js for testability (follows MANY SMALL FILES > FEW LARGE FILES principle)"
  - "Used node:test (Node.js built-in test runner) instead of adding Jest/Vitest as a dependency (follows zero-new-dependencies constraint)"
  - "composePrompt wrapper in server.js captures startup-loaded configs, calls loadSystemPrompt() per-request for fresh base identity"
metrics:
  duration: ~15min
  completed_date: "2026-04-26"
  test_count: 18
  test_pass: 18
  test_fail: 0
  files_created: 3
  files_modified: 2
  commits: 3
---

# Phase 01 Plan 01: Dynamic Prompt Composition Pipeline

**One-liner:** Refactored static system prompt into per-request `composeSystemPrompt(personaId)` with 4 persona presets, posts-index loader, and token budget monitoring — foundation for PRS and RAG features.

## Summary

This plan replaced the static `systemPrompt = loadSystemPrompt()` startup constant with a dynamic per-request composition pipeline. The new pipeline assembles the system prompt from three layers: `## IDENTITY` (base identity from existing config), `## TONE` (persona-specific style from `personas.json`), and `## KNOWLEDGE` (blog content from `posts-index.json`). The TONE section uses a bookend strategy — personality reminders at both start and end — to combat attention decay in long conversations. A token budget monitor logs warnings when the composed prompt exceeds 80% of the 2500-token target.

### What Was Built

1. **`ai-assistant/config/personas.json`** — 4 persona presets, each 150-300 tokens:
   - `warm-senior` (温暖学长): warm, supportive, patient senior student
   - `humorous-friend` (幽默朋友): playful, self-deprecating humor
   - `literary-youth` (文艺青年): poetic, literary, thoughtful observer
   - `metal-rock-youth` (重金属黑色死亡摇滚青年): raw, energetic, rebellious

2. **`ai-assistant/src/prompt-composer.js`** — Pure logic module with 4 exported functions:
   - `estimateTokens(text)`: Conservative 3 chars/token for mixed CN/EN content
   - `loadPersonasConfig(configPath)`: Validates persona fields, graceful fallback to built-in warm-senior
   - `loadPostsIndex(indexPath)`: Formats posts into compact text block, graceful degradation on missing file
   - `composeSystemPrompt(personaId, personasConfig, baseIdentity, postsIndexText)`: Assembles layered prompt with bookend TONE strategy, token budget logging

3. **`ai-assistant/server.js`** (refactored):
   - Imports prompt-composer module
   - `composePrompt(personaId)` wrapper: captures startup-loaded configs, calls `loadSystemPrompt()` per-request
   - `/chat/stream` handler: extracts `persona_id` from request body, passes to `composePrompt()`
   - Existing `loadSystemPrompt()`, `buildUpstreamMessages()`, and all middleware preserved unchanged

4. **`ai-assistant/.env.example`** — Added `POSTS_INDEX_PATH=./data/posts-index.json`

### Threat Model Compliance

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-01-01 (Spoofing: unknown personaId) | Rejected — defaults to warm-senior with console.warn | Implemented |
| T-01-02 (Tampering: personas.json) | File is server-only, not user-writable | Accept |
| T-01-03 (Info Disclosure: token logs) | Server console only, no client exposure | Accept |
| T-01-04 (DoS: path traversal) | try/catch with graceful fallback to empty index | Implemented |

## Deviations from Plan

### Design Decisions (Documented)

**1. Extracted prompt-composer module for testability**
- **Reason:** The plan specified all functions go into `server.js`. However, `server.js` is a monolithic Express app with side effects (DB init, server startup) that execute on import. Testing functions inline would require complex mocking.
- **Approach:** Created `ai-assistant/src/prompt-composer.js` as a pure logic module with no side effects. `server.js` imports it and wraps with startup-loaded configs.
- **Impact:** Better testability, follows "MANY SMALL FILES > FEW LARGE FILES" coding style. `server.js` adds one import, all function signatures unchanged.
- **Plan compliance:** All plan acceptance criteria met. `composeSystemPrompt`, `loadPersonasConfig`, `loadPostsIndex`, `estimateTokens` all exist and function as specified.

### Auto-fixed Issues

**1. [Rule 1 - Test Bug] Fixed incorrect test assertion for persona default check**
- **Found during:** GREEN phase test run
- **Issue:** Test checked for persona `name` field ('温暖学长') in composed output, but `composeSystemPrompt` uses the `prompt` field content, not the `name` metadata field.
- **Fix:** Changed assertion to check for warm-senior prompt content keywords ('温暖', '支持性')
- **Files modified:** `ai-assistant/test/prompt-composer.test.js`

### No Other Deviations

The plan executed as written. No Rule 2 (missing critical functionality), Rule 3 (blocking issues), or Rule 4 (architectural changes) deviations occurred.

## Verification Results

### Automated

- `node --check server.js`: PASS (zero errors)
- Test suite: 18/18 passing across 4 suites (`composeSystemPrompt`, `loadPersonasConfig`, `loadPostsIndex`, `estimateTokens`)
- `personas.json`: Valid JSON, 4 persona keys, `"default": "warm-senior"` field present
- All plan acceptance criteria verified (see commit verification log)

### Acceptance Criteria Status

- [x] `personas.json` exists with 4 valid persona definitions
- [x] `composeSystemPrompt(personaId)` function returns dynamically composed prompt
- [x] `loadPostsIndex()` function loads and formats posts
- [x] `loadPersonasConfig()` function loads and validates config
- [x] `estimateTokens()` function calculates token estimates
- [x] `persona_id` extracted from POST body in `/chat/stream`
- [x] Upstream messages built with `composePrompt(personaId || null)`
- [x] `## IDENTITY` → `## TONE` → `## KNOWLEDGE` layered structure
- [x] Bookend strategy in TONE section
- [x] `TOKEN-BUDGET` warning logged at >80% of 2500 target
- [x] `POSTS_INDEX_PATH` in `.env.example`
- [x] `node --check server.js` passes
- [x] `loadSystemPrompt()` preserved, used as baseIdentity
- [x] `buildUpstreamMessages()` signature unchanged
- [x] SSE streaming pipeline unchanged
- [x] No new npm dependencies

### Manual Verification Available

The following can be tested by starting the server:
1. Server logs "Loaded 4 persona(s)" on startup
2. `POST /chat/stream` with `persona_id: "humorous-friend"` returns 200 with SSE stream
3. `POST /chat/stream` with `persona_id: "evil-injection"` returns 200 with warm-senior default (warning logged)
4. `POST /chat/stream` without `persona_id` defaults to warm-senior
5. Existing conversation sessions continue to work

## Known Stubs

None. All functionality is fully wired:
- `loadPostsIndex` returns empty string when file is missing (not a stub — intentional graceful degradation for an optional data file)
- All persona presets have complete prompt text
- Token budget monitoring fully operational

## Threat Flags

None. No new security surface beyond what was modeled in the plan's `<threat_model>`:
- `persona_id` in request body: validated against known presets (T-01-01 mitigated)
- `POSTS_INDEX_PATH` env var → `fs.readFileSync`: try/catch with graceful fallback (T-01-04 mitigated)

## Self-Check: PASSED

- `ai-assistant/config/personas.json`: FOUND
- `ai-assistant/src/prompt-composer.js`: FOUND
- `ai-assistant/test/prompt-composer.test.js`: FOUND
- `ai-assistant/server.js` (modified): FOUND
- `ai-assistant/.env.example` (modified): FOUND
- Commit `007f0ce` (test/RED): FOUND
- Commit `ade6bba` (feat/GREEN): FOUND
- Commit `5c24a04` (feat/integration): FOUND
