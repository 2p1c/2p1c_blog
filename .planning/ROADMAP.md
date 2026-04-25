# Roadmap: 2p1c Blog AI Chat Enhancement

## Overview

This milestone adds three capabilities to the existing Hugo blog's AI chat assistant: content awareness (RAG via build-time JSON injection into the system prompt), personality presets (4 selectable AI personas persisted in localStorage), and auto-greeting (first-time visitor name collection with name-aware conversations). All three features converge on the system prompt composition pipeline, which is the critical-path refactor. The milestone uses zero new npm dependencies and zero new infrastructure -- everything is built on the existing Hugo + Node.js Express + better-sqlite3 + vanilla JS stack.

## Phases

- [ ] **Phase 1: AI Chat Enhancement** -- Prompt composition refactor, RAG content awareness, personality presets, and auto-greeting flow; all 10 requirements delivered as one coherent capability upgrade.

## Phase Details

### Phase 1: AI Chat Enhancement
**Goal**: Users get an AI assistant that knows the blog's content, adapts its personality on demand, and greets first-time visitors by name -- all while maintaining existing chat features and managing token budget across competing prompt components.
**Depends on**: Existing Hugo blog + Node.js AI assistant (Phase 0 foundation)
**Requirements**: RAG-01, RAG-02, RAG-03, PRS-01, PRS-02, PRS-03, PRS-04, GRT-01, GRT-02, GRT-03
**Success Criteria** (what must be TRUE):
  1. User can ask blog content questions ("你最近写了什么文章？", "有没有关于 Docker 的文章？") and the AI responds with accurate post titles, tags, and links from the actual published blog
  2. User can select from 4 personality presets (温暖学长, 幽默朋友, 文艺青年, 重金属黑色死亡摇滚青年) via a dropdown in the chat header; AI tone changes immediately on selection and persists across page reloads and return visits
  3. First-time visitor (no user profile in localStorage) sees an inline greeting with name input inside the chat panel; after submitting their name, the AI uses their name naturally in conversation
  4. Returning users (with user profile in localStorage) skip the greeting entirely and go directly to normal chat with their saved personality preference
  5. All existing chat features (streaming SSE responses, session persistence, clear conversation, character limit, mobile responsiveness, health indicator) continue to work without regression; token budget is monitored and logged per request
**Plans**: 4 plans
**UI hint**: yes

Plans:
- [x] 01-01-PLAN.md -- System Prompt Composition Refactor (PRS-02, PRS-03, RAG-02) -- Critical path. Refactors static system prompt to per-request dynamic composition: base identity + persona prompt + posts index. Implements persona config file, `composeSystemPrompt(personaId)` function, token budget logging, and backend posts-index loader with graceful degradation.
- [x] 01-02-PLAN.md -- RAG Content Pipeline (RAG-01, RAG-03) -- Hugo custom output format template generating `posts-index.json` at build time, integration testing of content-aware AI responses across all 4 personalities, and content staleness handling (file watcher or periodic reload).
- [x] 01-03-PLAN.md -- Personality Presets UI (PRS-01, PRS-04) -- Dropdown selector in chat header, localStorage persistence matching existing session ID pattern, `persona_id` transmission in chat stream POST body, responsive styling at 320px, and dropdown interaction compatibility with hover-based panel open/close.
- [x] 01-04-PLAN.md -- Auto-Greeting Flow (GRT-01, GRT-02, GRT-03) -- Three-state user model (unknown/anonymous/identified), inline greeting UI with name input replacing chat composer, `POST /chat/register` endpoint with server-side name sanitization, greeting-to-chat transition after registration, returning-user skip logic, and panel pin during onboarding.

## Progress

**Execution Order:**
Phase 1 executes as a single milestone. Plans execute in dependency order: 01-01 (critical path) first, then 01-02 and 01-03 can run in parallel, then 01-04 last.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. AI Chat Enhancement | 4/4 | In progress | - |
