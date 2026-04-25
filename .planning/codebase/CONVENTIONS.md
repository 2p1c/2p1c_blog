# Codebase Conventions

Generated: 2026-04-25

## General Style

The repository does not have a repo-wide formatter. Changes should preserve the local style of the file being edited.

Repository guidance in `AGENTS.md` says to keep changes small, preserve surrounding style, and avoid reformatting unrelated files.

## Markdown Content

Blog content lives in `content/posts/`.

Expected front matter fields:

- `title`.
- `date`.
- `draft`.
- `description`.
- `summary`.
- `tags`.
- `categories`.

Preferred post filenames are lowercase kebab-case, for example `content/posts/my-new-post.md`.

## Hugo Templates

Templates live under `themes/vintage-web-hugo-theme/layouts/`.

Observed conventions:

- Hugo logic is embedded directly in `.html` templates.
- Shared UI belongs in partials under `themes/vintage-web-hugo-theme/layouts/partials/`.
- The shared shell is `themes/vintage-web-hugo-theme/layouts/_default/baseof.html`.
- Template indentation is 4 spaces in the theme.
- Hugo Pipes resource handling is centralized in `baseof.html`.

Preferred approach:

- Keep template logic minimal.
- Add partials for repeated layout pieces.
- Keep site-level options in `hugo.toml` under `[params]`.

## Theme JavaScript

Theme JavaScript lives in `themes/vintage-web-hugo-theme/assets/js/main.js`.

Observed conventions:

- 4-space indentation.
- Plain browser JavaScript without a bundler.
- DOM setup begins from one `DOMContentLoaded` listener.
- Feature initializers are named `init...`, for example `initAiChatWidget()` and `initTocSidebar()`.
- Functions generally use early returns when required DOM elements are absent.
- Browser state is stored in `localStorage` where needed.
- Global helpers are exposed through `window.VintageTheme`.

The file uses some Unicode text and emoji because the theme intentionally renders a retro visual style and Chinese AI chat UI text.

## Backend JavaScript

Backend JavaScript is centralized in `ai-assistant/server.js`.

Observed conventions:

- ES modules.
- Semicolons.
- Single quotes.
- Constants near the top for environment-driven configuration.
- Small helper functions for validation, prompt loading, SSE writing, upstream SSE parsing, message normalization, and SVG data URIs.
- Prepared SQLite statements are module-level constants.
- SQLite writes that combine session updates and message changes use `db.transaction()`.
- Express routes are defined after helpers and database setup.

## Error Handling

Backend JSON errors use:

- `sendJsonError(res, status, code, message)`.
- Error codes such as `BAD_REQUEST` and `UPSTREAM_ERROR`.

Streaming errors after headers are committed are sent as SSE events through:

- `writeSseEvent(res, 'error', { code, message })`.

Frontend chat errors are displayed in the chat UI as assistant messages such as `请求失败：...`.

## Configuration

Site configuration lives in `hugo.toml`.

Backend configuration is environment-driven, with defaults in `ai-assistant/server.js` and examples in `ai-assistant/.env.example`.

System prompt configuration supports:

- Inline `AI_SYSTEM_PROMPT`.
- File-based `PROMPT_FILE`, resolved relative to `ai-assistant/` when not absolute.
- Fallback Chinese persona prompt in `ai-assistant/server.js`.

## Assets

Theme source assets live in `themes/vintage-web-hugo-theme/assets/` and are processed by Hugo Pipes.

Files in `static/` are served as-is and referenced with root-relative paths such as `/images/chat-launcher.png`.

## Git and Generated Files

Do not commit secrets in `.env`.

Avoid committing local SQLite data under `ai-assistant/data/` unless intentionally adding seed data.

Generated Hugo output under `public/` is build output, while deployment publishes the generated `public/` directory from CI.
