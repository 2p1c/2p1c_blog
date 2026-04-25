# Codebase Concerns

Generated: 2026-04-25

## Summary

The codebase is small and understandable, but the chat feature crosses static Hugo, browser JavaScript, reverse proxy configuration, and a live model upstream. Most risk is in integration drift, missing automated tests, and operational assumptions that are documented but not enforced.

## API Path Drift

`API_CONTRACT.md` describes public routes under `/api/chat/stream`, `/api/chat/clear`, and `/api/health`.

`ai-assistant/server.js` implements internal routes under `/chat/stream`, `/chat/clear`, `/chat`, and `/health`.

`hugo.toml` configures the widget with `api_base = "/api/chat"`, so production depends on reverse proxy rules to map `/api/chat/*` to `/chat/*`.

`themes/vintage-web-hugo-theme/assets/js/main.js` derives health from `apiBase.replace('/stream', '').replace('/clear', '') + '/health'`. For the configured production base `/api/chat`, this becomes `/api/chat/health`, while `API_CONTRACT.md` documents `/api/health`.

## Port Drift

`ai-assistant/server.js` defaults `PORT` to `3001`.

`ai-assistant/.env.example` sets `PORT=4310`.

`ai-assistant/README.md` says the example default is `4310`, but its Nginx example proxies to `127.0.0.1:3001`.

`themes/vintage-web-hugo-theme/assets/js/main.js` maps local `/api/chat` to `http://127.0.0.1:4310/chat`.

This can make local integration fail unless `.env` and reverse proxy assumptions are aligned.

## Missing Automated Tests

There is no automated regression coverage beyond `node --check` for `ai-assistant/server.js`.

High-risk untested behavior includes:

- Upstream SSE parsing in `parseUpstreamSseChunk()`.
- Local SSE formatting in `writeSseEvent()`.
- Frontend SSE parsing in `parseSseEvent()`.
- SQLite persistence and clear behavior.
- API route compatibility through reverse proxy paths.
- Mobile versus desktop AI widget interactions.

## Monolithic Backend

`ai-assistant/server.js` combines configuration, prompt loading, database schema setup, prepared statements, Express middleware, route handlers, standalone HTML/CSS/JS generation, and upstream streaming logic.

This is manageable at current size, but it makes isolated tests and focused changes harder. Splitting route logic, persistence, and upstream client code would reduce risk when the backend grows.

## Context Selection Behavior

`selectContextStmt` orders messages by ascending id and applies `LIMIT ?`.

That selects the earliest N messages for a session, not the most recent N messages. For long sessions, the model may lose recent context while retaining old context.

## Session Validation Mismatch

`isValidSessionId()` requires 8 to 128 trimmed characters.

The theme generates ids like `sess-${Date.now()}-${random}`. The standalone backend page generates ids like `sess_${Date.now()}_${random}`. Both pass today, but two storage keys and two id formats make future migration or debugging more awkward.

## Secret and Data Handling

The backend correctly expects `DEEPSEEK_API_KEY` from environment configuration. Local `.env` and SQLite data under `ai-assistant/data/` should remain uncommitted.

The deployment workflow in `.github/workflows/deploy.yml` uses `SSH_PRIVATE_KEY` and writes it during CI. This is standard, but deploy permissions and host access are sensitive operational dependencies.

## Production Operations Gap

The GitHub Actions workflow builds and deploys only the Hugo static site. It does not deploy, restart, health-check, or monitor `ai-assistant/`.

Backend operations appear to rely on separate manual or server-side setup described in documentation files.

## Frontend Robustness

The AI chat widget uses direct DOM manipulation and parses SSE manually. It handles common failures by displaying chat messages, but there is no retry logic, no explicit timeout for stream requests, and no persisted transcript rendering after reload.

The widget opens on hover for pointer devices and click for touch devices. That interaction should be checked in browser after layout or behavior changes because panel sizing is computed dynamically.

## Content Naming Drift

Repository guidance prefers lowercase kebab-case post filenames. Existing posts include mixed-case filenames such as `content/posts/Prompting-is-a-management-skill.md` and `content/posts/build-VPS.md`.

This is not immediately harmful to Hugo, but it can create avoidable URL, portability, and consistency issues.
