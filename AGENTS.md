# Repository Guidelines

## Project Structure & Module Organization
This repository is a Hugo blog with a small Node-based chat backend.

- `content/`: site pages and posts. Blog posts live in `content/posts/`.
- `archetypes/default.md`: default front matter for new posts.
- `static/`: files served as-is, such as icons and images.
- `themes/vintage-web-hugo-theme/`: active theme templates, CSS, JS, and partials.
- `ai-assistant/`: Express service that powers `/api/chat`, with SQLite persistence in `ai-assistant/data/`.

Use lowercase kebab-case for post filenames, for example `content/posts/my-new-post.md`.

## Build, Test, and Development Commands
- `hugo server -D`: run the blog locally, including draft posts, at `http://localhost:1313`.
- `hugo`: build the production site into `public/`.
- `cd ai-assistant && npm install`: install backend dependencies.
- `cd ai-assistant && npm run dev`: start the chat service with file watching on port `3001`.
- `cd ai-assistant && npm run start`: run the backend without watch mode.
- `cd ai-assistant && npm run check`: syntax-check `server.js`.

For local integration, run Hugo and `ai-assistant` together, then verify `curl http://127.0.0.1:3001/health`.

## Coding Style & Naming Conventions
Follow the existing style in each area instead of reformatting unrelated files.

- Markdown: keep front matter complete (`title`, `date`, `draft`, `description`, `summary`, `tags`, `categories`).
- JavaScript: ES modules, semicolons, single quotes in `ai-assistant/server.js`.
- Theme assets: existing theme JS/CSS uses 4-space indentation; preserve surrounding style.
- Hugo templates: keep logic minimal and prefer partials under `themes/.../layouts/partials/`.

There is no configured repo-wide formatter or linter, so keep changes small and consistent.

## Testing Guidelines
There is no automated test suite yet. Use targeted manual checks:

- Run `hugo server -D` and review changed pages in the browser.
- Run `cd ai-assistant && npm run check` before backend changes.
- Smoke-test backend endpoints with `curl`, especially `/health`, `/chat/clear`, and `/chat/stream`.

## Commit & Pull Request Guidelines
Recent history favors short conventional commits such as `feat(ai-assistant): ...`, `fix: ...`, and `docs: ...`. Continue using clear, scoped subjects.

Pull requests should include a short description, affected paths, manual verification steps, and screenshots for visible theme or content changes. Never commit `.env` secrets or local SQLite data unless explicitly intended.
