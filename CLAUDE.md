# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Hugo-based blog website (2p1c.life) with an integrated AI chat assistant backend. The project consists of:
- **Frontend**: Hugo static site generator using the `vintage-web-hugo-theme`
- **Backend**: Node.js Express server (`ai-assistant/`) providing AI chat functionality via DeepSeek API
- **Content**: Markdown blog posts in Chinese and English
- **Skills**: Claude Code agent skills for development workflow automation

## Development Commands

### Local Development Setup
```bash
# Install backend dependencies
cd ai-assistant
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys and configuration

# Start backend server (with auto-reload)
npm run dev

# In a separate terminal, start Hugo frontend
hugo server -D
```

### Skills Management
```bash
# Install all enabled skills from configuration
./install-skills.sh

# Check installed skills
npx skills list

# Add individual skill
npx skills add source/skill-name -a claude-code
```

### Production Deployment
```bash
# Backend deployment on server
cd /var/www/2p1c_blog
git pull
cd ai-assistant
npm ci
pm2 restart ai-assistant

# Check deployment health
curl -sS https://yourdomain.com/api/health
```

### Common Development Tasks
```bash
# Hugo content management
hugo new posts/new-post.md          # Create new blog post
hugo server -D                      # Run with drafts
hugo --minify                       # Build for production

# Backend operations
cd ai-assistant
npm run check                       # Syntax validation
npm run start                       # Production mode
npm run dev                         # Development with watch mode

# PM2 management (production)
pm2 status                          # Check service status
pm2 logs ai-assistant               # View logs
pm2 restart ai-assistant            # Restart service
```

## Architecture Overview

### Frontend (Hugo)
- **Configuration**: `hugo.toml` - Main site configuration with theme settings and AI chat integration
- **Theme**: `vintage-web-hugo-theme` in `themes/` directory with retro aesthetic
- **Theme Customization**: AI chat integration via `[params.ai_chat]` settings and custom partials
- **Content Structure**:
  - `content/posts/` - Blog posts in Markdown (Chinese and English)
  - `content/_index.md` - Homepage content
  - `content/about.md` - About page
- **Static Assets**: `static/` directory for images and other assets
- **Build Output**: `public/` directory (generated, not version controlled)

### Backend (AI Assistant)
- **Entry Point**: `ai-assistant/server.js` - Express server with AI chat endpoints
- **Key Endpoints**:
  - `POST /chat/stream` - Streaming chat responses via Server-Sent Events (SSE)
  - `POST /chat/clear` - Clear session history 
  - `GET /health` - Health check endpoint
  - `GET /chat` - Built-in chat UI for testing
- **Features**:
  - Session management with SQLite database
  - CORS configuration for local development
  - System prompt loading from file or environment variable
  - Message length and context limits
- **Database**: SQLite database for chat history (configurable path)
- **API Integration**: DeepSeek API for AI responses

### Configuration Files
- `ai-assistant/.env` - Backend environment configuration (API keys, database path, etc.)
- `ai-assistant/.env.example` - Template for environment configuration
- `hugo.toml` - Hugo site configuration and theme parameters with AI chat integration settings
- `skills.config.json` - Claude Code agent skills configuration
- `.claude/settings.local.json` - Local Claude Code settings and preferences
- `.github/copilot-instructions.md` - Development guidelines and coding standards (Chinese comments preferred)
- `install-skills.sh` - Automated skills installation script

## Key Integration Points

### AI Chat Integration
The Hugo frontend integrates with the backend through:
- Frontend chat UI calls `/api/chat/stream` for AI responses
- Nginx proxy configuration routes `/api/*` to backend on port 4310
- Session-based conversation history with `/chat/clear` endpoint

### Environment Variables (Backend)
Required configuration in `ai-assistant/.env`:
```
PORT=4310
DEEPSEEK_API_KEY=your_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
DB_PATH=./data/chat.db
MAX_MESSAGE_CHARS=2000
MAX_CONTEXT_MESSAGES=20
AI_SYSTEM_PROMPT=你是朱禹同，天津大学研二的学生。
PROMPT_FILE=./config/system-prompt.txt
```

### Nginx Configuration (Production)
Backend is served behind Nginx reverse proxy with specific configuration for streaming responses:
```nginx
location /api/chat/stream {
    proxy_pass http://127.0.0.1:4310/chat/stream;
    proxy_buffering off;
    chunked_transfer_encoding off;
}
```

## Development Guidelines

### Code Quality Standards
- Follow the guidelines in `.github/copilot-instructions.md`
- **Understanding First**: Always clarify requirements before implementing
- **Chinese Comments**: Use Chinese comments for complex logic
- **Error Handling**: Include proper error handling for all operations
- **Security**: Never expose API keys; use environment variables

### Content Creation
- Blog posts are in Markdown format under `content/posts/`
- Use Hugo's front matter for metadata (title, date, tags, etc.)
- Images should be placed in `static/` directory

### Skill Management
- **Configuration**: `skills.config.json` - Defines available Claude Code agent skills and their sources
- **Installation**: `./install-skills.sh` - Automated script to install all enabled skills from config
- **Skills Directory**: `.agents/skills/` - Contains installed skill definitions and documentation
- **Available Skills**: git-commit, skill-creator, find-skills, git-flow-branch-creator, and various Lark/Feishu skills
- **Claude Code Settings**: `.claude/settings.local.json` - Local Claude Code configuration

## Testing and Validation

### Backend Health Check
```bash
# Local development
curl -sS http://127.0.0.1:4310/health

# Production
curl -sS https://yourdomain.com/api/health
```

### Frontend Development
- Use `hugo server -D` for development with draft content
- Test AI chat functionality by interacting with the chat interface
- Verify streaming responses and session management

## Deployment Notes

- **Backend**: Managed via PM2 on production server
- **Frontend**: Static files built with Hugo and served via Nginx
- **Database**: SQLite file-based database for chat sessions
- **Monitoring**: Use PM2 logs and Nginx access logs for troubleshooting