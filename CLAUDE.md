# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hugo-based blog (2p1c.life) with an integrated AI chat assistant backend.

- **Frontend**: Hugo static site with `vintage-web-hugo-theme`
- **Backend**: Node.js/Express server (`ai-assistant/`) providing AI chat via DeepSeek API
- **Content**: Chinese/English blog posts in `content/posts/`
- **Skills**: Claude Code agent skills in `.agents/skills/` for workflow automation

## Development Commands

### Frontend (Hugo)
```bash
hugo server -D        # Local dev at http://localhost:1313 (includes drafts)
hugo                 # Production build to public/
hugo new posts/x.md  # Create new post
```

### Backend (ai-assistant)
```bash
cd ai-assistant
npm install          # Install dependencies
npm run dev          # Dev mode with auto-reload (--watch)
npm run start        # Production mode
npm run check        # Syntax validation
```

### Integration Testing
```bash
# Terminal 1
cd ai-assistant && npm run dev

# Terminal 2
hugo server -D

# Health check
curl -sS http://127.0.0.1:4310/health
```

### Production Deployment
```bash
cd /var/www/2p1c_blog
git pull && cd ai-assistant && npm ci && pm2 restart ai-assistant
```

## Architecture

### Frontend (Hugo)
- `hugo.toml` - Site config with AI chat integration params
- `content/posts/` - Blog posts (Markdown, lowercase kebab-case filenames)
- `static/` - Static assets served as-is
- `themes/vintage-web-hugo-theme/` - Active theme

### Backend (ai-assistant)
- `server.js` - Express server entry point
- `config/` - System prompt configuration
- `data/` - SQLite database for chat sessions (gitignored)
- **Key endpoints**: `POST /chat/stream` (SSE streaming), `POST /chat/clear`, `GET /health`

### Skills System
- `.agents/skills/` - Installed skill definitions (git-commit, skill-creator, find-skills, etc.)
- `skills.config.json` - Skill configuration (enabled/disabled, sources)
- `./install-skills.sh` - Automated skill installation

## Key Integration Points

### AI Chat Flow
1. Frontend calls `/api/chat/stream` (Nginx proxied to port 4310)
2. Backend queries DeepSeek API with session context
3. Responses streamed via Server-Sent Events (SSE)
4. Session history persisted in SQLite

### Environment Variables (ai-assistant/.env)
```
PORT=4310
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DB_PATH=./data/chat.db
MAX_MESSAGE_CHARS=2000
MAX_CONTEXT_MESSAGES=20
AI_SYSTEM_PROMPT=your_persona_prompt
PROMPT_FILE=./config/system-prompt.txt
```

### Nginx (Production)
```nginx
location /api/chat/stream {
    proxy_pass http://127.0.0.1:4310/chat/stream;
    proxy_buffering off;
    chunked_transfer_encoding off;
}
```

## Development Guidelines

### Code Style
- Follow `.github/copilot-instructions.md` - Chinese comments preferred for clarity
- ES modules with semicolons, single quotes in `ai-assistant/server.js`
- Markdown front matter: `title`, `date`, `draft`, `description`, `summary`, `tags`, `categories`
- No repo-wide formatter/linter configured - keep changes small and consistent

### Content
- Use `hugo new posts/my-new-post.md` with complete front matter
- Images go in `static/` directory

### Testing
- No automated test suite - use targeted manual checks
- Verify `/health`, `/chat/stream`, `/chat/clear` endpoints with curl
- Run `npm run check` before backend changes

## PM2 Commands (Production)
```bash
pm2 status
pm2 logs ai-assistant
pm2 restart ai-assistant
```

## Key File Locations
- `AGENTS.md` - Agent collaboration principles and communication guidelines
- `local_dev_instructions.md` - Detailed local setup with troubleshooting
- `backend_Devops_instructions.md` - Production deployment guide
- `AI_ASSISTANT_RAG_PERSONA_PLAN.md` - Future RAG/persona system design
- `backend-subscription-plan.md` - Future email subscription system (not implemented)
