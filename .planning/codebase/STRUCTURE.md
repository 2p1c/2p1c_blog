# Codebase Structure

Generated: 2026-04-25

## Top-Level Layout

- `hugo.toml` - root Hugo site configuration.
- `content/` - site content.
- `archetypes/` - default front matter templates for Hugo content.
- `static/` - static files copied directly into the Hugo output.
- `themes/vintage-web-hugo-theme/` - active Hugo theme.
- `ai-assistant/` - standalone Express chat backend.
- `.github/` - GitHub templates, prompts, contribution docs, and deployment workflow.
- `.planning/codebase/` - generated codebase map documents.

## Content

- `content/_index.md` - home page content.
- `content/about.md` - about page.
- `content/posts/` - blog posts.

Current post filenames are mixed case in some places, for example `content/posts/Prompting-is-a-management-skill.md` and `content/posts/build-VPS.md`, even though repository guidance prefers lowercase kebab-case.

## Hugo Theme

Theme metadata and examples:

- `themes/vintage-web-hugo-theme/theme.toml`.
- `themes/vintage-web-hugo-theme/config.toml`.
- `themes/vintage-web-hugo-theme/README.md`.
- `themes/vintage-web-hugo-theme/exampleSite/`.

Layouts:

- `themes/vintage-web-hugo-theme/layouts/_default/baseof.html` - shared document shell.
- `themes/vintage-web-hugo-theme/layouts/_default/list.html` - list, section, and taxonomy rendering.
- `themes/vintage-web-hugo-theme/layouts/_default/single.html` - single page/post rendering.
- `themes/vintage-web-hugo-theme/layouts/index.html` - home page rendering.
- `themes/vintage-web-hugo-theme/layouts/taxonomy/category.html` - category taxonomy.
- `themes/vintage-web-hugo-theme/layouts/taxonomy/tag.html` - tag taxonomy.

Partials:

- `themes/vintage-web-hugo-theme/layouts/partials/navigation.html`.
- `themes/vintage-web-hugo-theme/layouts/partials/sidebar.html`.
- `themes/vintage-web-hugo-theme/layouts/partials/footer.html`.
- `themes/vintage-web-hugo-theme/layouts/partials/ai-chat.html`.

Assets:

- `themes/vintage-web-hugo-theme/assets/css/main.css`.
- `themes/vintage-web-hugo-theme/assets/js/main.js`.

## Backend

- `ai-assistant/package.json` - Node package metadata and scripts.
- `ai-assistant/package-lock.json` - locked dependency graph.
- `ai-assistant/server.js` - entire Express application.
- `ai-assistant/.env.example` - sample environment variables.
- `ai-assistant/.gitignore` - backend-specific ignored files.
- `ai-assistant/README.md` - backend setup and reverse proxy notes.
- `ai-assistant/config/system_prompt.txt` - file-based default system prompt.
- `ai-assistant/data/` - expected local SQLite data directory, not intended for normal commits.

## Static Assets

- `static/favicon.ico`.
- `static/1F384.svg`.
- `static/images/ai-avatar.jpg`.
- `static/images/chat-launcher.png`.
- `static/images/image-20260130202439074.png`.

## Planning and Operations Docs

- `API_CONTRACT.md` - MVP chat API contract.
- `AI_ASSISTANT_RAG_PERSONA_PLAN.md` - planned RAG/persona work.
- `AI_ASSISTANT_RAG_PERSONA_FILE_LEVEL_PLAN.md` - file-level RAG/persona plan.
- `backend_Devops_instructions.md` - backend operations notes.
- `local_dev_instructions.md` - local development notes.
- `CLAUDE.md` and `AGENTS.md` - agent/repository guidance.

## Naming Conventions

- New blog posts should use lowercase kebab-case under `content/posts/`.
- Hugo partials are lowercase descriptive names under `themes/vintage-web-hugo-theme/layouts/partials/`.
- Backend JavaScript is currently centralized in `ai-assistant/server.js`.
- Theme JavaScript uses function names like `initAiChatWidget()`, `streamReply()`, and `parseSseEvent()`.
- CSS and template classes use descriptive hyphenated names such as `ai-chat-panel`, `post-list-item`, and `window-content`.

## Module Boundaries

- Hugo content should stay in `content/`.
- Theme behavior should stay under `themes/vintage-web-hugo-theme/`.
- Backend runtime behavior should stay under `ai-assistant/`.
- Public static media should stay under `static/`.
- Generated planning references should stay under `.planning/`.
