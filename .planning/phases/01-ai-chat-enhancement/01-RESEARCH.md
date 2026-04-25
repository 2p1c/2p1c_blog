# Research Summary: 2p1c Blog AI Chat Enhancement

**Domain:** Hugo static blog + Node.js AI chat assistant with content awareness, personality switching, and auto-greeting
**Researched:** 2026-04-26
**Overall confidence:** HIGH

## Executive Summary

This milestone adds three capabilities to the existing AI chat assistant: (1) content awareness via Hugo build-time JSON injection into the system prompt, (2) a personality selector with 4 preset personas persisted in localStorage, and (3) an auto-greeting flow for new users with name registration. All three features are achievable with **zero new npm dependencies** and **zero new infrastructure**. The existing Hugo v0.154.3 + Node.js v23.7.0 + Express + better-sqlite3 + vanilla JS stack provides everything needed.

The key architectural insight is that Hugo already processes all front matter during build. Rather than having the Node.js backend parse markdown files (adding a gray-matter dependency), we use Hugo's built-in custom output formats and `jsonify` template function to generate a `posts-index.json` at build time. This file is KB-scale (titles, summaries, tags, dates, links only -- no full text), loaded by the Node.js server at startup via `fs.readFileSync` (already imported), and injected into the system prompt. This is a zero-dependency, zero-runtime-cost approach that aligns with the constraint "不引入新依赖或数据库".

The personality selector is purely frontend work: a `<select>` dropdown in the chat header, `localStorage` persistence (already the pattern for session IDs), and a `persona_id` parameter sent in the POST body to `/chat/stream`. The backend dynamically constructs the system prompt by combining the base persona prompt with the posts index context. The auto-greeting flow reuses existing `localStorage` patterns to detect new users, displays a name-input UI inline in the chat messages area, and calls a new `POST /register` endpoint backed by a `user_profiles` table in the existing SQLite database.

All three features can be built in a single phase because they have no cross-dependencies that block parallel implementation. The personality and greeting features share frontend UI space (chat header and messages area) but operate on independent state.

## Key Findings

**Stack:** Zero new dependencies. Hugo custom output formats for JSON generation, Node.js `fs` for loading, better-sqlite3 for `user_profiles` table, vanilla JS for all frontend work.

**Architecture:** Build-time data pipeline (Hugo generates JSON at build, server loads at startup) + runtime state (personality selection and user profiles persisted in localStorage/SQLite). Clean separation: Hugo owns content data, Express owns chat logic, browser owns UI state.

**Critical pitfall:** The Hugo `posts-index.json` generation approach requires a custom output format template. If the template naming is incorrect (Hugo's lookup order for custom formats is format-name-dependent), the JSON won't generate. This needs a build verification step. Also, the production deployment script must copy `public/posts-index.json` to a path readable by the Node.js server (they run in different directories).

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Single Phase: All Three Features** - Parallel implementation with no blocking dependencies
   - RAG: Hugo template + backend system prompt injection (backend)
   - Personality: HTML/CSS/JS in chat widget (frontend-dominant, small backend change)
   - Auto-greeting: localStorage logic + /register endpoint (full-stack)
   - Avoids: No pitfall from dependency ordering -- these are three independent feature tracks

**Phase ordering rationale:**
- RAG-01 (Hugo template) is a build configuration change, independent of runtime code
- RAG-02 (backend loading) and PRS-03 (dynamic system prompt) share the system prompt construction logic -- build them together
- GRT-01/02/03 (greeting) is fully self-contained: localStorage check + /register endpoint + greeting UI
- No feature depends on another being finished first
- All three can be developed and tested independently before integration

**Research flags for phases:**
- RAG-01: LOW risk. Hugo custom output formats are well-documented. Template naming convention needs verification during build (test: run `hugo` and check for `public/posts-index.json`).
- RAG-02: LOW risk. `fs.readFileSync` pattern already used for system prompt loading. Just add a second file read and string concatenation.
- PRS-02: LOW risk. Server-side persona config as a JS object is trivial -- 4 strings in a Map.
- GRT-02: LOW risk. `POST /register` follows the exact same pattern as existing `/chat/clear` endpoint. `user_profiles` table follows the same DDL pattern as existing `sessions` table.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against existing codebase. Hugo version confirmed locally (v0.154.3). Node.js imports confirmed in server.js. No new dependencies needed. |
| Features | HIGH | All three features decompose cleanly into existing patterns. No undiscovered complexity. |
| Architecture | HIGH | Hugo-to-Node.js data pipeline is a standard pattern. Frontend state management reuses existing localStorage patterns. |
| Pitfalls | MEDIUM | Hugo custom output format template naming is version-sensitive. Need build-time verification. Production path resolution for posts-index.json needs attention. |

## Gaps to Address

- Hugo custom output format template naming convention for Hugo v0.154.3 -- the exact template filename (`layouts/index.postsindex.json` vs `layouts/_default/index.postsindex.json` vs alternative naming) should be verified by running `hugo --printPathWarnings` or equivalent during implementation. This is a one-time verification during build, not a research gap.
- Production deployment: The path from `public/posts-index.json` (Hugo output) to the Node.js server's working directory needs explicit documentation in the deployment script. Options: symlink, copy step in deployment, or absolute path in `POSTS_INDEX_PATH` env var.
- Chinese character encoding in `jsonify`: Hugo's `jsonify` uses Go's `encoding/json` which outputs valid UTF-8. Chinese characters in post titles/summaries will be preserved correctly -- no escaping issues expected, but worth a quick verification with a sample post containing Chinese text.
