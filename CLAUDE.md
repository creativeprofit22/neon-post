# Neon Post

A persistent desktop AI assistant (Electron + Claude Agent SDK) that runs 24/7 as a system tray app with continuous memory, Telegram integration, browser automation, social media management, and scheduled tasks.

## Project Structure

```
src/
├── main/           # Electron main process (app lifecycle, tray, windows)
│   └── ipc/        # IPC channel definitions
├── agent/          # Claude Agent SDK wrapper and orchestration
├── memory/         # SQLite persistence (messages, facts, embeddings, social)
├── channels/       # Communication channels (Telegram, iOS relay)
├── scheduler/      # Cron jobs, social scheduling, notifications
├── browser/        # 2-tier browser automation (Electron + CDP)
├── tools/          # Agent tool implementations
├── config/         # Configuration and system prompts
├── settings/       # User preferences and schema
├── auth/           # OAuth flows
├── image/          # Image generation (Kie.ai) with job tracking
├── social/         # Content, posting (6 platforms), scraping, engagement, video
├── mcp/            # Model Context Protocol servers
└── utils/          # General helpers

ui/
├── chat/           # Main chat interface (JS modules, CSS, panels)
├── shared/         # Theme loader, base styles, CSS variables
└── *.html          # Feature pages (settings, setup, cron, facts, soul, etc.)

tests/              # Vitest unit tests
assets/             # Tray icons and static assets
scripts/            # Build and utility scripts
```

## Organization Rules

**Keep code organized by responsibility:**
- Electron main process -> `src/main/`
- Agent logic -> `src/agent/`
- Persistence -> `src/memory/`
- External channels -> `src/channels/`
- Tool implementations -> `src/tools/`
- Configuration -> `src/config/` and `src/settings/`
- Browser automation -> `src/browser/`
- Image generation -> `src/image/`
- Social media -> `src/social/`

**Modularity principles:**
- Single responsibility per file
- Clear, descriptive file names
- Group related functionality together
- Avoid monolithic files

## Code Quality - Zero Tolerance

After editing ANY file, run:

```bash
npm run typecheck && npm run lint
```

Fix ALL errors/warnings before continuing.

**Available scripts:**
- `npm run lint` - ESLint check
- `npm run lint:fix` - Auto-fix lint issues
- `npm run typecheck` - TypeScript type checking
- `npm run format` - Prettier auto-format
- `npm run test` - Run all tests
