# Gallery & Discover Fixes — Reference Doc

Created: 28 March 2026
Purpose: If the terminal crashes during planning, reference this to rebuild context.

---

## Bug 1: Generated Images Not Showing in Gallery

**Root cause:** `setSocialMemoryManager()` is exported from `src/tools/social-tools.ts` but **never called** in `src/agent/index.ts`. So `memoryManager` is always `null` in social tools. When the agent's `generate_image` tool runs, the image generates on Kie.ai successfully, but the DB save is skipped because of:
```ts
if (memoryManager && result.imageUrl) {  // always false — memoryManager is null
```

**Fix:** Already applied — added `setSocialMemoryManager(this.memory)` call at line 514 of `src/agent/index.ts`, right after `setSoulMemoryManager(this.memory)`. Import was already there.

**Gallery UI status:** Fully built and working. Grid layout, image cards, text cards, lightbox, favorite/delete, loading skeletons, empty state — all done in `ui/chat/social-panel.js` (`_socLoadGallery` function, lines 882-936) and styled in `ui/chat/social-panel.css` (lines 537-630, 888-899). Just needed data to actually get there.

**IPC path note:** The IPC handler `social:generateImage` (line 424) saves without `media_url` — only sets `output: result.imageUrl`. But the gallery JS has a fallback (`_socIsImageItem` checks if `content_type === 'image'` and output starts with `http`), so it still works. The agent tool path (line 1244) correctly saves with `media_url`.

---

## Bug 2: Discover Tab — Save Button is a No-Op

**Root cause:** `socPanelActions.saveDiscovered()` in `ui/chat/social-panel.js` (line 1005-1007) just shows a toast, never actually saves anything:
```js
saveDiscovered(id) {
    _socShowToast('Content saved to library', 'success');
}
```

**What exists:**
- Discover tab HTML: `ui/chat.html` lines 1010-1027 — search input, platform dropdown, results div
- Discover JS: `ui/chat/social-panel.js` lines 762-839 — `_socLoadDiscovered()`, `_socDiscoverSearch()`, `_socRenderDiscoverResults()`
- IPC handlers: `social:searchContent` (line 223) and `social:getDiscovered` (line 234) in `src/main/ipc/social-ipc.ts`
- DB: `discoveredContent` store in `src/memory/discovered-content.ts` — full CRUD, schema with platform/title/body/media_urls/likes/comments/shares/views/tags
- Preload: `getDiscovered`, `searchContent` exposed in `src/main/preload.ts`
- Agent tool: `save_content` tool in `src/tools/social-tools.ts` can save to `discoveredContent` DB

**What's missing:**
1. Save button doesn't call IPC — needs to save the search result to `discoveredContent` table
2. No persistence of search results — switching tabs loses everything
3. No "Saved" view for browsing saved discovered content
4. Cards are basic — no engagement tiers, no thumbnails

---

## Plan: What Needs to Be Built

### 1. Fix setSocialMemoryManager (DONE)
- File: `src/agent/index.ts` — already applied

### 2. Fix Discover Save Button
- `socPanelActions.saveDiscovered(id)` needs to find the item from current results and call an IPC to save to `discoveredContent` DB
- Need a new IPC handler `social:saveDiscovered` that takes the card data and calls `memory.discoveredContent.create()`
- Or reuse existing data if the search already saves to DB (it doesn't — `searchContent` IPC just returns results, doesn't persist)

### 3. Persist Search Results in JS
- Keep search results in a module-level variable so tab switching doesn't lose them
- Re-render from cache when user comes back to Discover tab

### 4. Saved Content View (within Discover tab)
- Add toggle/sub-tabs within Discover: "Search Results" | "Saved"
- Saved view loads from `social:getDiscovered` (already exists) but filtered to only saved/bookmarked items
- Or simpler: just add a "Saved" sub-tab that shows all `discoveredContent` from DB

### 5. Richer Cards
- Better card layout with engagement stats prominently displayed
- Platform badges (colored)
- Engagement tier indicators (adapt from Daltex but for content not influencers)
- Thumbnail support for content with media_urls

---

## Reference: Daltex Pattern (E:\Projects\Daltex-Marketing-Agent-V2)

Different use case (influencer discovery, not content discovery), but good UX patterns:
- **DiscoverySearch** — Multi-step: Platform → Search input (auto-detects #/@ prefix) → Result count → Collapsible filters with preset buttons
- **DiscoveryResults** — Grid with platform tabs, sort dropdown, count header, clear button, loading skeletons
- **DiscoveryResultCard** — Avatar, name, stats grid, engagement stars + tier badge (🔥 Super Hot / Hot / 👍 Decent / 👎 Low), platform + status badges, Save button with importing/imported states
- **useDiscoveryResults hook** — sessionStorage persistence, dedup by platform+id, merge incoming results, track importing/imported state
- Key files:
  - `frontend/app/(dashboard)/influencers/discovery/page.tsx`
  - `frontend/app/components/features/influencers/DiscoveryResultCard.tsx`
  - `frontend/app/components/features/influencers/DiscoverySearch.tsx`
  - `frontend/app/components/features/influencers/DiscoveryResults.tsx`
  - `frontend/app/hooks/useDiscoveryResults.ts`

---

## Our App's Scraping Capabilities

| Platform   | Method      | Search Types                        |
|-----------|-------------|-------------------------------------|
| YouTube   | pocket-cli  | Keyword search, channel videos      |
| TikTok    | RapidAPI    | Keyword, hashtag, user videos, trending |
| TikTok    | Apify       | Keyword, hashtag (fallback)         |
| Instagram | Apify       | Hashtag search                      |
| Twitter   | pocket-cli  | Timeline fetch                      |
| Reddit    | pocket-cli  | Keyword search                      |

---

## Key Files in Our App

- `src/agent/index.ts` — Agent init, memory manager wiring
- `src/tools/social-tools.ts` — Agent tools (search_content, scrape_profile, generate_image, save_content)
- `src/main/ipc/social-ipc.ts` — IPC handlers for UI
- `src/main/preload.ts` — IPC bridge to renderer
- `src/memory/discovered-content.ts` — DiscoveredContent DB store
- `src/memory/generated-content.ts` — GeneratedContent DB store
- `src/social/scraping/index.ts` — Unified scraping router
- `ui/chat/social-panel.js` — All social panel UI logic
- `ui/chat/social-panel.css` — Social panel styles
- `ui/chat.html` — HTML structure (social panel starts around line 995)
