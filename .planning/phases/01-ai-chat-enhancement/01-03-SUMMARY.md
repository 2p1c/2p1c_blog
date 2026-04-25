---
phase: 01-ai-chat-enhancement
plan: 03
type: execute
subsystem: frontend-chat-widget
wave: 2
autonomous: true
depends_on: [01-01]
tags: [personality-selector, dropdown, localStorage, vintage-theme, responsive]
completed_date: "2026-04-26T00:00:00Z"
duration_seconds: 261
tech-stack:
  added: []
  patterns:
    - localStorage persistence mirroring existing session ID pattern
    - Native OS select dropdown (no custom rendering, no XSS vector)
    - Mouseleave suppression via focus/blur tracking flag
    - Streaming-state control (disable on start, re-enable in finally)
key-files:
  created: []
  modified:
    - themes/vintage-web-hugo-theme/layouts/partials/ai-chat.html
    - themes/vintage-web-hugo-theme/assets/css/main.css
    - themes/vintage-web-hugo-theme/assets/js/main.js
decisions:
  - Native <select> dropdown chosen over custom dropdown for accessibility and zero JS complexity
  - Dropdown placed between header-title and actions to maintain visual balance in the header bar
  - persona_id transmitted in POST body alongside session_id (no new endpoint needed)
  - personaDropdownOpen flag used to suppress hover-based panel close during native dropdown interaction
  - Auto-advance not enabled for checkpoints but no checkpoints existed in this plan

---

# Phase 01 Plan 03: Personality Selector Dropdown Summary

**One-liner:** Frontend-only personality selector dropdown added to chat header with localStorage persistence, streaming-state control, and persona_id transmission in stream POST body -- zero backend changes required.

## Tasks Executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add personality dropdown HTML and CSS to chat panel | `1ebdabd` | `ai-chat.html`, `main.css` |
| 2 | Add JS for persona persistence, transmission, and panel interaction | `2211975` | `main.js` |

## Implementation Details

### Task 1: HTML and CSS

**HTML** -- Inserted a `.ai-chat-persona` div containing a native `<select>` with 4 options between `.ai-chat-header-title` and `.ai-chat-actions` in the chat header. Includes a `sr-only` label for screen reader accessibility.

**CSS** -- Added `.ai-chat-persona-select` base styles with vintage translucent theme (semi-transparent background, white text, 13px font, native OS dropdown appearance). Includes hover, focus-visible, and disabled states. Two responsive breakpoints:
- 480px: `max-width: 100px`
- 375px: `max-width: 90px`, `font-size: 12px`

### Task 2: JavaScript

Seven targeted insertions into the existing `initAiChatWidget()` function and surrounding code:

1. **Element reference**: `personaSelect` variable capturing the new dropdown DOM element
2. **State variables**: `personaDropdownOpen` (tracks native dropdown visibility) and `currentPersonaId` (tracks active selection)
3. **Persistence functions**: `getOrCreatePersonaPreference()` reads from `localStorage` with a valid-ID whitelist and defaults to `warm-senior`; `savePersonaPreference()` writes to localStorage
4. **Event wiring**: Dropdown initialized from localStorage on page load; `change` event persists selection; `mousedown`/`focus`/`blur` events track dropdown open state
5. **Panel interaction**: `mouseleave` handler checks `personaDropdownOpen` and skips `closePanel()` when the native OS dropdown is expanded
6. **API transmission**: `persona_id` added to the `streamReply()` POST body alongside `session_id` and `message`
7. **Streaming control**: Dropdown disabled when `isStreaming = true`, re-enabled in the `finally` block

## Verification Results

All acceptance criteria satisfied:

- [x] Dropdown with 4 options (`warm-senior`, `humorous-friend`, `literary-youth`, `metal-rock-youth`) present in header
- [x] CSS includes translucent vintage styling with hover, focus-visible, and disabled states
- [x] Responsive breakpoints at 480px and 375px applied
- [x] Screen reader accessible via `sr-only` label
- [x] localStorage persistence with `ai_chat_persona_id` key
- [x] Valid ID whitelist enforcement with invalid value cleanup
- [x] `persona_id` transmitted in stream POST body
- [x] Panel close suppressed during native dropdown interaction
- [x] Dropdown disabled/enabled during streaming lifecycle
- [x] No existing functionality modified -- all changes are additive

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model (T-03-01: localStorage tampering mitigated by client-side whitelist; T-03-02: persona_id flooding accepted as no amplification possible).

## Known Stubs

None. All 4 persona options are real, fully wired, and transmitted to the backend.

## Requirements Satisfied

| Requirement | Description | Status |
|-------------|-------------|--------|
| PRS-01 | Personality dropdown in chat header | Implemented |
| PRS-04 | Personality persistence to localStorage | Implemented |
