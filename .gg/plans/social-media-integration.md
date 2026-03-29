# Social Media & Content Creation Integration

Project: neon-post at /mnt/e/Projects/neon-post
Stack: TypeScript, Electron, SQLite, Claude Agent SDK
Check: npm run typecheck && npm run lint

## Research Findings

**Key principle:** We port neon-cut's **domain logic** (API calls, scraping providers, video bridge, content prompts) — NOT its tool infrastructure, UI framework, or LLM layer. Everything gets adapted to neon-post's patterns.

| Source | What We Take | What We Ignore |
|--------|-------------|----------------|
| **neon-cut** | Platform API calls, scraping providers, video engine bridge, content generation prompts, DB schemas | Tool definition system, LLM chat loop, UI, preload/IPC layer |
| **Daltex** | UI patterns: discovery cards, search → results → save flow, grid layout with platform tabs | React/Next.js, tRPC, Prisma, business logic |
| **neon-post** | Everything — tool system, agent modes, MCP servers, memory layer, scheduler, IPC/preload | — |

---

## Chunk 1/11: Database Schema Extension

### Files to Read
- `src/memory/facts.ts`

### Files to Create
- `src/memory/social-accounts.ts`
- `src/memory/discovered-content.ts`
- `src/memory/social-posts.ts`
- `src/memory/engagement.ts`
- `src/memory/brand-config.ts`
- `src/memory/generated-content.ts`

### Files to Modify
- `src/memory/index.ts`

### What to Build
Extend SQLite schema with 6 new tables. Create one CRUD module per table following the exact pattern of `src/memory/facts.ts`. Wire all into MemoryManager class in `src/memory/index.ts`.

Tables: social_accounts (platform OAuth tokens), discovered_content (scraped content with engagement stats), social_posts (draft/scheduled/posted with status tracking), engagement_log (comment replies), brand_config (voice/tone settings), generated_content (captions/hooks/threads/scripts/images).

Each module should export a class with standard CRUD methods (create, getById, getAll, update, delete) plus domain-specific queries. Use `crypto.randomUUID()` for IDs, `unixepoch()` for timestamps.

### Gate
Tables created in SQLite, all 6 modules export typed CRUD classes, MemoryManager instantiates them.

---

## Chunk 2/11: Platform Posting API Layer

### Files to Read
- `src/settings/index.ts`

### Files to Create
- `src/social/posting/types.ts`
- `src/social/posting/index.ts`
- `src/social/posting/tiktok.ts`
- `src/social/posting/youtube.ts`
- `src/social/posting/instagram.ts`
- `src/social/posting/x.ts`
- `src/social/posting/linkedin.ts`

### Files to Modify

### What to Build
Port neon-cut's platform posting code (from `E:\Projects\neon-cut\src\tools\posting\`). Create `types.ts` with Platform enum (TIKTOK, YOUTUBE, INSTAGRAM, X, LINKEDIN), PostResult, TokenResult interfaces. Create per-platform posting modules: TikTok Creator API v2, YouTube Data API v3, Instagram Graph API, X/Twitter API v2 + OAuth 1.0a, LinkedIn API. Create unified `postContent()` router in `index.ts`.

Strip neon-cut-specific imports (getWorkspace, sendProgressToRenderer, decryptSecret). Use neon-post's settings system for API keys. DB access through MemoryManager.

### Gate
All platform modules export async post functions, types compile, unified router dispatches by platform.

---

## Chunk 3/11: Platform Scraping API Layer

### Files to Read
- `src/social/posting/types.ts`

### Files to Create
- `src/social/scraping/index.ts`
- `src/social/scraping/apify.ts`
- `src/social/scraping/rapidapi.ts`
- `src/social/scraping/pocket-cli.ts`

### Files to Modify

### What to Build
Port neon-cut's scraping providers (from `E:\Projects\neon-cut\src\tools\scraping\`). Apify actors for TikTok/IG, RapidAPI for TikTok, pocket-agent-cli for YT/Reddit. Create unified search router in `index.ts`. Same adaptation rules as posting layer — strip neon-cut imports, use neon-post settings for API keys.

### Gate
All scraping modules export async search/scrape functions, unified router dispatches by platform/provider.

---

## Chunk 4/11: Engagement & Content Prompts

### Files to Read
- `src/social/posting/types.ts`

### Files to Create
- `src/social/engagement/monitor.ts`
- `src/social/engagement/reply.ts`
- `src/social/content/prompts.ts`
- `src/social/content/system-prompts.ts`

### Files to Modify

### What to Build
Port engagement monitoring (comment fetching per platform) and reply posting from neon-cut (from `E:\Projects\neon-cut\src\tools\engagement\`). Port content generation prompts (caption, hook, thread, script templates) and social agent system prompts from neon-cut's config. Adapt to neon-post patterns.

### Gate
Engagement monitor/reply modules export typed async functions, prompts export template functions for each content type.

---

## Chunk 5/11: Video Engine Bridge

### Files to Read
- `src/social/posting/types.ts`

### Files to Create
- `src/social/video/types.ts`
- `src/social/video/bridge.ts`
- `src/social/video/install.ts`
- `src/social/video/pipeline.ts`
- `src/social/video/transcribe.ts`

### Files to Modify

### What to Build
Port neon-cut's Python subprocess manager for video editing (from `E:\Projects\neon-cut\src\engine\`). Create BridgeCommand/BridgeResponse types, Python venv/pip installer, processVideo and transcribeVideo wrappers. Make video tools optional — check if `effect_engine/` dir exists before using. Bridge communicates via JSON over stdin/stdout with the Python process.

### Gate
Video bridge types compile, bridge module exports spawn/communicate functions, pipeline/transcribe wrap bridge calls.

---

## Chunk 6/11: Agent Tools Registration

### Files to Read
- `src/tools/index.ts`
- `src/tools/memory-tools.ts`
- `src/social/posting/index.ts`
- `src/social/scraping/index.ts`

### Files to Create
- `src/tools/social-tools.ts`

### Files to Modify
- `src/tools/index.ts`

### What to Build
Create tool definitions for 14 social tools following the pattern of `memory-tools.ts`: search_content, scrape_profile, get_trending, download_video, post_content, schedule_post, list_social_accounts, list_social_posts, process_video, transcribe_video, generate_content, save_content, reply_to_comment, flag_comment. Each tool has typed input schema and calls the appropriate social API layer function. Register all in `getCustomTools()` and `buildSdkMcpServers()` in `src/tools/index.ts`.

### Gate
All 14 tools registered, tool definitions have valid schemas, index.ts exports them.

---

## Chunk 7/11: Creator Agent Mode

### Files to Read
- `src/agent/agent-modes.ts`
- `src/social/content/system-prompts.ts`

### Files to Modify
- `src/agent/agent-modes.ts`

### What to Build
Add `creator` mode to AgentModeId type and AGENT_MODES config alongside general/coder/researcher/writer/therapist. Engine: chat. Allowed tools: SDK_CORE_TOOLS + BROWSER_TOOLS + NOTIFY_TOOLS + MEMORY_TOOLS + all 14 SOCIAL_TOOLS + SWITCH_TOOL. System prompt adapted from neon-cut's CONTENT_AGENT_PROMPT (imported from `src/social/content/system-prompts.ts`). MCP servers: ['neon-post']. Description: 'Content creator — discover, create, repurpose, publish, engage'. Icon: 🎬.

### Gate
Creator mode appears in AGENT_MODES, type union includes 'creator', all social tools listed in allowedTools.

---

## Chunk 8/11: Social Scheduler Jobs

### Files to Read
- `src/scheduler/index.ts`
- `src/social/posting/index.ts`
- `src/social/engagement/monitor.ts`

### Files to Create
- `src/scheduler/social-scheduler.ts`

### Files to Modify

### What to Build
Two recurring jobs registered in neon-post's existing scheduler system: (1) Post Scheduler — runs every minute, queries social_posts where status='scheduled' AND scheduled_at <= now, executes posting via the posting API layer, updates status to 'posted' or 'failed'. (2) Engagement Sweep — runs every 15 min (configurable), fetches new comments on recent posts via engagement monitor, logs them to engagement_log.

### Gate
Both job functions exported, scheduler registration code present, queries use MemoryManager.

---

## Chunk 9/11: IPC and Preload Layer

### Files to Read
- `src/main/preload.ts`
- `src/main/ipc/facts-ipc.ts`

### Files to Create
- `src/main/ipc/social-ipc.ts`

### Files to Modify
- `src/main/preload.ts`

### What to Build
Add `social` namespace to preload.ts following the pattern of existing namespaces. IPC methods: searchContent, getDiscovered, saveContent, deleteContent, listAccounts, addAccount, removeAccount, listPosts, createPost, schedulePost, generateContent, getGenerated, deleteGenerated, favoriteGenerated, getBrand, saveBrand, getEngagementLog. Create `social-ipc.ts` with all `ipcMain.handle` registrations backed by MemoryManager CRUD modules and social API layer functions.

### Gate
Preload exposes social namespace, IPC handlers registered, types match between preload and handler.

---

## Chunk 10/11: Social UI Page

### Files to Read
- `ui/chat.html`
- `ui/facts.html`

### Files to Create
- `ui/social.html`
- `ui/social/social.css`
- `ui/social/social.js`

### Files to Modify

### What to Build
Standalone HTML page with 5 tabs: Discover (search bar with platform selector + results grid with cards showing thumbnails/stats/engagement/save button), Create (sub-tabs: Copy/Image/Repurpose with content type selector and generation), Posts (composer + history table with status badges), Gallery (generated content grid with lightbox and favorite/delete), Accounts & Brand (connected accounts list + brand voice editor form).

Use neon-post's CSS variables (--bg-primary, --accent, --text-primary). Dark theme matching chat.html. Platform-colored badges (TikTok cyan, YouTube red, etc.). Loading skeletons for async content. Toast notifications via Notyf. All data operations via `pocketAgent.social.*` IPC calls from preload.

### Gate
HTML page renders all 5 tabs, CSS loads, JS wires IPC calls to UI elements.

---

## Chunk 11/11: Window Management and Navigation

### Files to Read
- `src/main/windows.ts`
- `src/main/tray.ts`
- `ui/chat.html`

### Files to Modify
- `src/main/windows.ts`
- `src/main/tray.ts`
- `src/main/preload.ts`
- `ui/chat.html`

### What to Build
Add `openSocial()` function to windows.ts (following the pattern of openFacts/openCron). Add `app.openSocial()` to preload.ts. Add "Social" menu item to tray menu in tray.ts. Add sidebar button with 🎬 icon in chat.html that calls `pocketAgent.app.openSocial()`.

### Gate
Social window opens from tray menu and chat sidebar, loads social.html correctly.
