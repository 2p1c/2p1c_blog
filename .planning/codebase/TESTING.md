# Codebase Testing

Generated: 2026-04-25

## Current Automated Coverage

There is no full automated test suite in the repository.

The backend has one syntax-check script in `ai-assistant/package.json`:

- `npm run check` runs `node --check server.js`.

No JavaScript unit test framework, Hugo template test suite, or end-to-end browser test suite is configured.

## Manual Checks

Repository guidance recommends targeted manual checks:

- Run `hugo server -D` and review changed pages in the browser.
- Run `cd ai-assistant && npm run check` before backend changes.
- Run the backend and verify `curl http://127.0.0.1:3001/health`.
- Smoke-test `/chat/clear` and `/chat/stream` when backend behavior changes.

## Static Site Verification

For Hugo-only changes:

- Run `hugo` to verify the site builds.
- Use `hugo server -D` for local rendering and draft visibility.
- Check changed templates under `themes/vintage-web-hugo-theme/layouts/`.
- Check changed CSS/JS behavior in browser when touching `themes/vintage-web-hugo-theme/assets/`.

The GitHub Actions workflow in `.github/workflows/deploy.yml` runs `hugo` during deployment, but it is a deployment workflow rather than a dedicated pull request test suite.

## Backend Verification

For backend changes:

- Run `cd ai-assistant && npm run check`.
- Start the backend with `npm run start` or `npm run dev`.
- Verify health with `curl`.
- Verify clear with a JSON POST to `/chat/clear`.
- Verify stream with a JSON POST to `/chat/stream` when `DEEPSEEK_API_KEY` is configured.

The stream endpoint depends on a live upstream model provider, so failures may be caused by missing credentials, model/provider issues, or network/proxy configuration.

## Integration Verification

For local Hugo plus backend integration:

1. Start Hugo with `hugo server -D`.
2. Start the backend from `ai-assistant/`.
3. Confirm the frontend widget resolves the local API base from `/api/chat` to `http://127.0.0.1:4310/chat` when running on localhost.
4. Confirm the configured backend port matches the local API base. Code defaults to `3001`, while `ai-assistant/.env.example` uses `4310`.
5. Exercise the chat widget, `/clear`, and SSE streaming behavior in a browser.

## Important Test Gaps

- No tests cover SSE parsing in `ai-assistant/server.js`.
- No tests cover frontend SSE parsing in `themes/vintage-web-hugo-theme/assets/js/main.js`.
- No tests cover SQLite transaction behavior.
- No tests cover API route compatibility between public `/api/chat/*` paths and internal `/chat/*` backend paths.
- No tests cover the AI chat widget across desktop hover and mobile click interactions.
- No tests cover Hugo template rendering for posts with and without `toc`.
- No CI check runs `npm run check` for `ai-assistant/`.

## Recommended Next Test Additions

- Add a lightweight backend test harness for validation, `/health`, `/chat/clear`, and upstream-stream parsing with mocked `fetch`.
- Add a CI job that runs `hugo` and `cd ai-assistant && npm run check`.
- Add browser smoke coverage for the AI chat widget open/close, clear, and streaming UI states.
- Add a fixture-based test for `parseSseEvent()` in the frontend and `parseUpstreamSseChunk()` in the backend if those functions are split into importable modules.
