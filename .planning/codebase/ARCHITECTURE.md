# Codebase Architecture

Generated: 2026-04-25

## System Shape

The repository contains two deployable surfaces:

- A Hugo static site built from `hugo.toml`, `content/`, and `themes/vintage-web-hugo-theme/`.
- A Node.js Express chat backend in `ai-assistant/server.js`.

The static site owns the public blog experience. The backend owns chat API state, upstream AI calls, and an optional standalone chat page.

## Static Site Flow

1. Hugo reads global site configuration from `hugo.toml`.
2. Markdown pages and posts are read from `content/`.
3. Templates in `themes/vintage-web-hugo-theme/layouts/` render list pages, single posts, taxonomies, navigation, sidebar, footer, and chat widget markup.
4. Hugo Pipes minifies and fingerprints `themes/vintage-web-hugo-theme/assets/css/main.css` and `themes/vintage-web-hugo-theme/assets/js/main.js`.
5. Static assets in `static/` are copied as-is to the published site root.

Important entry points:

- `themes/vintage-web-hugo-theme/layouts/_default/baseof.html` is the shared HTML shell.
- `themes/vintage-web-hugo-theme/layouts/index.html` renders the home page.
- `themes/vintage-web-hugo-theme/layouts/_default/list.html` renders section, list, and taxonomy pages.
- `themes/vintage-web-hugo-theme/layouts/_default/single.html` renders posts and pages.

## Blog Content Model

Posts live in `content/posts/` and are rendered as Hugo regular pages of type `posts`.

Expected front matter fields are described by repository guidance:

- `title`.
- `date`.
- `draft`.
- `description`.
- `summary`.
- `tags`.
- `categories`.

`archetypes/default.md` provides the default new-content front matter.

## Theme Layout Model

The theme uses a retro "window" layout pattern:

- Shared shell and resource loading in `themes/vintage-web-hugo-theme/layouts/_default/baseof.html`.
- Navigation partial in `themes/vintage-web-hugo-theme/layouts/partials/navigation.html`.
- Sidebar partial in `themes/vintage-web-hugo-theme/layouts/partials/sidebar.html`.
- Footer partial in `themes/vintage-web-hugo-theme/layouts/partials/footer.html`.
- AI chat partial in `themes/vintage-web-hugo-theme/layouts/partials/ai-chat.html`.

`themes/vintage-web-hugo-theme/assets/js/main.js` layers browser behaviors over the rendered HTML: window controls, post card click navigation, copy buttons, search filtering, scroll restoration, AI chat, and table-of-contents behavior.

## Chat Widget Flow

The Hugo-rendered chat flow is:

1. `hugo.toml` supplies `.Site.Params.ai_chat`.
2. `themes/vintage-web-hugo-theme/layouts/partials/ai-chat.html` renders widget markup with API and image paths as `data-*` attributes.
3. `initAiChatWidget()` in `themes/vintage-web-hugo-theme/assets/js/main.js` initializes UI state.
4. The browser stores or reuses `ai_chat_session_id` in `localStorage`.
5. The widget calls `${apiBase}/stream` for user messages and `${apiBase}/clear` for clear actions.
6. The widget parses local SSE events and appends token deltas to the assistant message.

## Backend Flow

The backend is a single-file Express application in `ai-assistant/server.js`.

Startup sequence:

1. Load `.env` via `dotenv.config()`.
2. Resolve runtime config and system prompt.
3. Create the Express app and JSON parser.
4. Add development CORS handling for Hugo localhost origins.
5. Resolve the SQLite database path and ensure its parent directory exists.
6. Open SQLite with `better-sqlite3`.
7. Create `sessions` and `messages` tables if needed.
8. Prepare statements and transactions.
9. Register routes.
10. Listen on `PORT`.

Routes:

- `GET /health` returns `{ ok: true }`.
- `GET /chat` serves the backend's standalone embedded chat UI.
- `POST /chat/clear` clears messages for one session.
- `POST /chat/stream` validates input, persists the user message, builds context, calls the upstream model, streams token events, and persists the final assistant reply.

## Data Flow

The primary chat data flow is:

1. Browser sends `{ session_id, message }`.
2. Backend validates `session_id` and message length.
3. Backend inserts the user message in SQLite.
4. Backend selects up to `MAX_CONTEXT_MESSAGES` rows for the session.
5. Backend prepends the system prompt and filters out stored `system` roles.
6. Backend sends streaming request to DeepSeek-compatible upstream.
7. Backend converts upstream deltas into local SSE `token` events.
8. Backend saves the complete assistant reply after the upstream stream ends.
9. Backend sends local `done` event and closes the response.

## Error Handling Boundaries

Validation errors return JSON through `sendJsonError()` before streaming starts.

After SSE streaming begins, errors are returned as SSE `error` events, because the HTTP status has already been committed.

SQLite writes are wrapped in transactions for insert and clear operations.

## Deployment Architecture

`.github/workflows/deploy.yml` builds only the Hugo static site and deploys `public/` to a remote server. The backend deployment is not automated in that workflow; operational notes for reverse proxying the backend live in `ai-assistant/README.md`, `API_CONTRACT.md`, and `backend_Devops_instructions.md`.
