# Neon Post — My Contributions

> **Fork of [KenKaiii/pocket-agent](https://github.com/KenKaiii/pocket-agent)** — a menu-bar AI personal assistant (Electron + Claude Agent SDK + SQLite + TypeScript).
>
> I extended the core product with a full social media content creation and publishing system, a redesigned floating UI, and dozens of UX fixes — **40 commits, 34,000+ lines of code across 131 files.**

---

## What I Built

### Social Media Content Creator System
Built an end-to-end social media workflow from scratch on top of the existing AI assistant:

- **Content repurposing pipeline** — scrape sources, cache results, score content for viral potential, transcribe media, and generate repurposed posts for multiple platforms
- **Multi-platform posting** — compose, preview, and publish content to different social platforms from a single interface
- **Engagement tools** — trend card actions, inline previews, and multi-platform preview before publishing
- **Image generation** (Kie.ai integration) — generate images from prompts with a job tracker, gallery with copy-URL support, and a "Discover Saved" tab
- **Scheduling** — schedule modal with calendar merge for planning content drops across platforms
- **Brand configuration** — per-brand settings for the repurposing pipeline so content matches each brand's voice

### Floating Bubble UI (Full Redesign)
Replaced the old static copilot bar with a floating, interactive bubble:

- Draggable and resizable bubble container
- Show/hide with DOM reparenting for performance
- Session picker modal to switch between isolated conversation threads
- Minimize behavior and polish animations

### UX Overhaul (13-Part Fix Series)
Systematic pass across the entire UI to fix gaps in the user experience:

- Empty states for all views (no more blank screens)
- Button loading states throughout the app
- Navigation toasts and image generation notifications
- Cache invalidation and state reset/cleanup
- Silent error fixes — caught and surfaced errors that were being swallowed
- Label polish and visual feedback improvements

### Infrastructure
- Proxy-fetch utility for safe external requests
- Modernized ESLint configuration
- Comprehensive unit test suite
- Replaced Claude Agent SDK with custom engine for all agent modes

---

## Stats

| | |
|---|---|
| My commits | 40 of 133 total |
| Lines added | 34,000+ |
| Files touched | 131 |
| New features | Social content system, bubble UI, image generation, scheduling |
| Fixes | UX overhaul, error handling, cache invalidation, state management |

---

## Original Project

Neon Post (originally Pocket Agent) is a personal AI assistant that lives in your menu bar. It features persistent memory, routines/automations, browser automation, multi-session isolation, Telegram integration, and 40+ skill integrations. See the [upstream repo](https://github.com/KenKaiii/pocket-agent) for full documentation.

**Stack:** Electron + Claude Agent SDK + SQLite + TypeScript

---

## License

MIT
