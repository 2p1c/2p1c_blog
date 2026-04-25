# Codebase Stack

Generated: 2026-04-25

## Overview

This repository is a Hugo static blog with a separate Node.js chat backend. The static site is built from `content/`, configured by `hugo.toml`, and rendered through the active theme in `themes/vintage-web-hugo-theme/`. The backend in `ai-assistant/` is an Express service that persists chat history in SQLite and streams model output from a DeepSeek-compatible chat completions API.

## Languages and Runtimes

- Markdown content under `content/`, especially posts in `content/posts/`.
- Hugo templates under `themes/vintage-web-hugo-theme/layouts/`.
- Browser JavaScript under `themes/vintage-web-hugo-theme/assets/js/main.js`.
- CSS under `themes/vintage-web-hugo-theme/assets/css/main.css`.
- Node.js ES modules in `ai-assistant/server.js`.
- SQLite persistence through the native Node package `better-sqlite3`.

## Static Site

- Hugo config: `hugo.toml`.
- Active theme: `theme = "vintage-web-hugo-theme"` in `hugo.toml`.
- Base URL: `https://2p1c.life/`.
- Canonical URLs are enabled with `canonifyURLs = true`.
- Pagination is configured under `[pagination]` with `pagerSize = 10`.
- Taxonomies are `categories`, `tags`, and `series`.
- Theme parameters control retro UI, sidebar, sharing, footer, edit links, and AI chat widget behavior.

## Theme Pipeline

The base layout in `themes/vintage-web-hugo-theme/layouts/_default/baseof.html` loads:

- `themes/vintage-web-hugo-theme/assets/css/main.css` through Hugo Pipes with minification and fingerprinting.
- `themes/vintage-web-hugo-theme/assets/js/main.js` through Hugo Pipes with minification and fingerprinting.
- `themes/vintage-web-hugo-theme/layouts/partials/ai-chat.html` when `.Site.Params.ai_chat.enabled` is true.
- Hugo internal Google Analytics template through `{{ template "_internal/google_analytics.html" . }}`.

## Backend Package

Backend metadata is in `ai-assistant/package.json`:

- Package type: ES modules via `"type": "module"`.
- `npm run start`: runs `node server.js`.
- `npm run dev`: runs `node --watch server.js`.
- `npm run check`: runs `node --check server.js`.

Runtime dependencies:

- `express` for HTTP routes and JSON body parsing.
- `dotenv` for `.env` loading.
- `better-sqlite3` for local SQLite persistence.

## Backend Configuration

The backend reads environment variables in `ai-assistant/server.js`, with examples in `ai-assistant/.env.example`:

- `PORT`, defaulting to `3001` in code and `4310` in `.env.example`.
- `DEEPSEEK_API_KEY`, required for `/chat/stream`.
- `DEEPSEEK_BASE_URL`, defaulting to `https://api.deepseek.com/v1`.
- `DEEPSEEK_MODEL`, defaulting to `deepseek-chat`.
- `DB_PATH`, defaulting to `./data/chat.db`.
- `MAX_MESSAGE_CHARS`, defaulting to `2000`.
- `MAX_CONTEXT_MESSAGES`, defaulting to `20`.
- `AI_SYSTEM_PROMPT` and `PROMPT_FILE` for the system prompt.
- `CHAT_LAUNCHER_IMAGE_URL` and `AI_AVATAR_URL` for the standalone backend chat UI.

## Build and Deploy

- Local Hugo development command: `hugo server -D`.
- Production Hugo build command: `hugo`.
- GitHub Actions deployment is defined in `.github/workflows/deploy.yml`.
- The workflow installs Hugo `0.154.3` extended, builds `public/`, and deploys via `rsync` over SSH to `root@39.106.85.231:/var/www/html/`.

## Generated and Local Data

- Hugo output is expected in `public/`.
- Hugo cache/resources may appear under `resources/`.
- Backend SQLite data is expected under `ai-assistant/data/`.
- Backend secrets belong in `ai-assistant/.env`, not in git.
