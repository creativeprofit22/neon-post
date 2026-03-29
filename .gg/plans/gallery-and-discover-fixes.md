# Gallery & Discover Fixes

Project: neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + vanilla JS UI + SQLite
Check: npm run typecheck && npm run lint
Chunks: 5

---

## Chunk 1/5: Fix setSocialMemoryManager Wiring
**Tier**: haiku

### Files to Read
- `src/agent/index.ts` — Lines 1-10 (imports) and lines 510-515 (memory manager init)

### Files to Create
- (none)

### Files to Modify
- `src/agent/index.ts` — Verify the fix is in place: `setSocialMemoryManager` must be imported from `'../tools'` and called as `setSocialMemoryManager(this.memory)` right after `setSoulMemoryManager(this.memory)` around line 514. The import `setSocialMemoryManager` should be in the destructured import from `'../tools'` (line 2-8). The call should be at line 514. If both are already present, this chunk is a no-op — just verify and move on. If not present, add the import to the existing import block and the call after `setSoulMemoryManager(this.memory);`.

### What to Build
This is the critical bug fix. Without `setSocialMemoryManager(this.memory)`, the agent's `generate_image` tool in `src/tools/social-tools.ts` has `memoryManager = null`, so images generated via the agent never get saved to the `generated_content` DB table, and thus never appear in the Gallery tab. The IPC path (direct UI generation) works because it uses `getMemory()` from deps, but the agent tool path is completely broken.

### Gate
`npm run typecheck && npm run lint` passes

---

## Chunk 2/5: Save Discovered Content — IPC + Preload
**Tier**: sonnet

### Files to Read
- `src/main/ipc/social-ipc.ts` — Lines 221-243 (existing discover IPC handlers)
- `src/main/preload.ts` — Lines 250-277 (social API bridge) and lines 743-780 (type declarations)
- `src/memory/discovered-content.ts` — Full file (CRUD store, CreateDiscoveredContentInput type)
- `src/social/scraping/pocket-cli.ts` — Lines 15-26 (ContentResult type — what searchContent returns)

### Files to Create
- (none)

### Files to Modify
- `src/main/ipc/social-ipc.ts` — Add two new IPC handlers after the existing `social:getDiscovered` handler (line 243):
  1. `social:saveDiscovered` — Takes `input: { platform: string, source_url?: string, source_author?: string, content_type: string, title?: string, body?: string, media_urls?: string, likes?: number, comments?: number, shares?: number, views?: number, tags?: string, metadata?: string }`. Gets memory via `getMemory()`, calls `memory.discoveredContent.create(input)`, returns `{ success: true, data: saved }`. On error returns `{ success: false, error: message }`.
  2. `social:deleteDiscovered` — Takes `id: string`. Gets memory, calls `memory.discoveredContent.delete(id)`, returns `{ success: true }` or `{ success: false, error }`.

- `src/main/preload.ts` — Add to the `social` object (around line 259, after `getDiscovered`):
  ```
  saveDiscovered: (data: Record<string, unknown>) => ipcRenderer.invoke('social:saveDiscovered', data),
  deleteDiscovered: (id: string) => ipcRenderer.invoke('social:deleteDiscovered', id),
  ```
  Also add type declarations in the Window interface (after `getDiscovered` type around line 747):
  ```
  saveDiscovered: (data: Record<string, unknown>) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;
  deleteDiscovered: (id: string) => Promise<{ success: boolean; error?: string }>;
  ```

### What to Build
Wire up the IPC layer so the renderer can save and delete discovered content. Currently `searchContent` returns results but there's no way for the UI to persist them. The `discoveredContent` store already has full CRUD — we just need the IPC bridge.

### Gate
`npm run typecheck && npm run lint` passes

---

## Chunk 3/5: Discover Tab — Search Persistence + Save Button
**Tier**: sonnet

### Files to Read
- `ui/chat/social-panel.js` — Lines 170-210 (tab switching + search binding), lines 762-839 (discover functions), lines 1004-1007 (saveDiscovered action)
- `ui/chat.html` — Lines 1010-1027 (discover tab HTML)

### Files to Create
- (none)

### Files to Modify
- `ui/chat/social-panel.js` — Multiple changes:

  1. **Add module-level cache** (near the top, around line 30 where other module vars are):
     ```js
     var _socDiscoverCache = [];      // cached search results
     var _socDiscoverQuery = '';       // last search query
     var _socDiscoverPlatform = '';    // last search platform
     var _socSavedIds = new Set();     // IDs of saved items (for UI state)
     ```

  2. **Update `_socDiscoverSearch`** (line 782): After getting results from `social.searchContent()`, store them in `_socDiscoverCache`. Also store the query and platform in `_socDiscoverQuery` / `_socDiscoverPlatform`.

  3. **Update `_socLoadDiscovered`** (line 764): If `_socDiscoverCache.length > 0`, render from cache instead of calling `social.getDiscovered()`. Also restore the search input value from `_socDiscoverQuery` and platform dropdown from `_socDiscoverPlatform`.

  4. **Fix `socPanelActions.saveDiscovered`** (line 1005): Replace the toast-only implementation. It should:
     - Find the item from `_socDiscoverCache` by id (the cards have `data-id`)
     - Call `social.saveDiscovered({ platform: item.platform, source_url: item.url, source_author: item.creatorUsername, content_type: 'post', title: item.title, body: item.caption, likes: item.likes, comments: item.comments, shares: item.shares, views: item.views })`
     - On success: add id to `_socSavedIds`, update button to show "Saved ✓" (disabled), show success toast
     - On error: show error toast

  5. **Update `_socRenderDiscoverResults`** (line 798): Update the Save button rendering — if `_socSavedIds.has(item.id || item.externalId)`, render as disabled "Saved ✓" button. Use `item.externalId` as the data-id (since `ContentResult` uses `externalId` not `id`). Also add a `data-index` attribute so we can find the item in cache by externalId.

### What to Build
Make the Discover tab functional: search results persist across tab switches (cached in JS), and the Save button actually saves content to the database. The key data mapping is `ContentResult` (from scraping) → `CreateDiscoveredContentInput` (for DB):
- `platform` → `platform`
- `url` → `source_url`
- `creatorUsername` → `source_author`
- `'post'` → `content_type`
- `title` → `title`
- `caption` → `body`
- `likes/comments/shares/views` → same fields

### Gate
`npm run lint` passes

---

## Chunk 4/5: Saved Content Sub-Tab in Discover
**Tier**: sonnet

### Files to Read
- `ui/chat.html` — Lines 1010-1027 (discover tab HTML structure)
- `ui/chat/social-panel.js` — Lines 762-839 (discover tab JS), lines 170-210 (event binding for discover)
- `ui/chat/social-panel.css` — Lines 278-354 (card grid + card styles)
- `src/main/preload.ts` — Lines 257-259 (getDiscovered + saveDiscovered from chunk 2)

### Files to Create
- (none)

### Files to Modify
- `ui/chat.html` — Replace the discover tab body (lines 1012-1026) with a sub-tab structure:
  ```html
  <div class="soc-tab-body">
    <!-- Sub-tab toggles -->
    <div class="soc-subtab-row">
      <button class="soc-subtab-btn active" data-subtab="search">🔍 Search</button>
      <button class="soc-subtab-btn" data-subtab="saved">💾 Saved <span id="soc-saved-count" class="soc-subtab-count"></span></button>
    </div>

    <!-- Search sub-tab -->
    <div class="soc-subtab-content active" id="soc-discover-search-panel">
      <div class="soc-search-row">
        <input type="text" id="soc-discover-search" placeholder="Search trending content...">
        <select id="soc-discover-platform">
          <option value="">All Platforms</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="twitter">Twitter / X</option>
          <option value="reddit">Reddit</option>
        </select>
        <button class="soc-btn soc-btn-primary" id="soc-discover-search-btn">Search</button>
      </div>
      <div id="soc-discover-results"></div>
    </div>

    <!-- Saved sub-tab -->
    <div class="soc-subtab-content" id="soc-discover-saved-panel" style="display:none">
      <div class="soc-search-row">
        <select id="soc-saved-platform-filter">
          <option value="">All Platforms</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram</option>
          <option value="twitter">Twitter / X</option>
          <option value="reddit">Reddit</option>
        </select>
        <select id="soc-saved-sort">
          <option value="recent">Most Recent</option>
          <option value="likes">Most Likes</option>
          <option value="views">Most Views</option>
          <option value="engagement">Most Engagement</option>
        </select>
      </div>
      <div id="soc-saved-results"></div>
    </div>
  </div>
  ```

- `ui/chat/social-panel.js` — Add the following:

  1. **Sub-tab switching** (in the `_socInitSocialPanel` function, after the discover search binding around line 206): Bind click handlers to `.soc-subtab-btn` buttons within `#soc-tab-discover`. On click: toggle `active` class on buttons, show/hide the corresponding `soc-subtab-content` panels. When switching to "saved", call `_socLoadSaved()`. When switching to "search", if cache exists re-render from cache.

  2. **`_socLoadSaved()` function** (add after `_socRenderDiscoverResults` around line 839): 
     - Get `social.getDiscovered(100)`
     - Read platform filter from `#soc-saved-platform-filter` and sort from `#soc-saved-sort`
     - Filter by platform if set
     - Sort: `recent` = by `discovered_at` desc (default), `likes` = by likes desc, `views` = by views desc, `engagement` = by `(likes + comments + shares + views)` desc
     - Render into `#soc-saved-results` using `_socRenderSavedCards(items)`
     - Update `#soc-saved-count` badge with total count

  3. **`_socRenderSavedCards(items)` function**: Render saved items as cards in a grid. Each card:
     - Thumbnail area: platform icon (large) + media thumbnail if `media_urls` exists
     - Title (2-line clamp)
     - Author line: "by @author" with platform badge
     - Stats row: ❤ likes · 💬 comments · 🔄 shares · 👁 views
     - Engagement indicator: calculate total engagement `(likes + comments + shares)`, show tier:
       - 🔥 if total > 10000
       - 👍 if total > 1000  
       - Regular otherwise
     - Footer: time ago + delete button (calls `socPanelActions.deleteDiscovered(id)`)
     - Click card body → open source URL in external browser

  4. **Bind filter/sort changes**: Add event listeners on `#soc-saved-platform-filter` and `#soc-saved-sort` selects to re-call `_socLoadSaved()`.

  5. **`socPanelActions.deleteDiscovered(id)`**: Call `social.deleteDiscovered(id)`, on success remove the card from DOM, update saved count, show toast.

  6. **Update `socPanelActions.saveDiscovered`**: After a successful save, also update `#soc-saved-count` badge (increment count).

- `ui/chat/social-panel.css` — Add styles for:
  ```css
  /* Sub-tab row */
  #social-view .soc-subtab-row { display: flex; gap: 4px; margin-bottom: 12px; }
  #social-view .soc-subtab-btn {
    padding: 6px 14px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500;
    background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border);
    cursor: pointer; transition: all 0.15s;
  }
  #social-view .soc-subtab-btn:hover { color: var(--text-primary); border-color: var(--accent); }
  #social-view .soc-subtab-btn.active {
    background: var(--accent); color: var(--bg-primary); border-color: var(--accent);
  }
  #social-view .soc-subtab-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 16px; border-radius: 8px; font-size: 10px; font-weight: 600;
    padding: 0 4px; margin-left: 4px;
    background: rgba(255,255,255,0.2); color: inherit;
  }
  #social-view .soc-subtab-btn:not(.active) .soc-subtab-count {
    background: var(--bg-tertiary); color: var(--text-muted);
  }

  /* Saved card enhancements */
  #social-view .soc-card-engagement {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10px; font-weight: 600; padding: 2px 6px;
    border-radius: 4px;
  }
  #social-view .soc-card-engagement.hot {
    background: rgba(239, 68, 68, 0.1); color: var(--error);
  }
  #social-view .soc-card-engagement.warm {
    background: rgba(245, 158, 11, 0.1); color: var(--warning);
  }
  #social-view .soc-card-source-link {
    cursor: pointer;
  }
  #social-view .soc-card-source-link:hover .soc-card-title {
    color: var(--accent);
  }
  ```

### What to Build
Add a "Saved" sub-tab within the Discover tab. The Discover tab now has two views: Search (existing, with cached results from chunk 3) and Saved (new, loads from DB). The Saved view shows all bookmarked discovered content with platform filtering, sorting by engagement/recency, and delete functionality. Cards show engagement tiers inspired by Daltex's pattern but adapted for content (not influencers) — engagement total drives the tier indicator. Clicking a saved card opens the source URL externally.

### Gate
`npm run lint` passes

---

## Chunk 5/5: Richer Discover Cards + Thumbnails
**Tier**: sonnet

### Files to Read
- `ui/chat/social-panel.js` — `_socRenderDiscoverResults` function (around line 798), `_socRenderSavedCards` function (from chunk 4)
- `ui/chat/social-panel.css` — Card styles (lines 278-354)
- `src/social/scraping/pocket-cli.ts` — `ContentResult` type (lines 15-26) — what search returns: `{ platform, externalId, url, title, caption, views, likes, comments, shares, creatorUsername }`
- `src/social/scraping/rapidapi.ts` — Check what extra fields TikTok results have (thumbnails, etc.)
- `src/social/scraping/apify.ts` — Check what extra fields Instagram/TikTok results have

### Files to Create
- (none)

### Files to Modify
- `ui/chat/social-panel.js` — Rewrite `_socRenderDiscoverResults` to produce richer cards:

  1. **Add `_socEngagementTier(likes, comments, shares, views)` helper**: Returns `{ label, emoji, class }`:
     - total = likes + comments + shares
     - If total >= 50000: `{ label: 'Viral', emoji: '🔥🔥', class: 'viral' }`
     - If total >= 10000: `{ label: 'Hot', emoji: '🔥', class: 'hot' }`
     - If total >= 1000: `{ label: 'Trending', emoji: '📈', class: 'warm' }`
     - If total >= 100: `{ label: 'Decent', emoji: '👍', class: '' }`
     - Else: `{ label: '', emoji: '', class: '' }` (no badge)

  2. **Add `_socFormatEngagement(num)` helper**: Like `_socFormatNumber` but with K/M suffixes (1.2K, 3.5M).

  3. **Rewrite card HTML in `_socRenderDiscoverResults`**: Each card should be:
     ```
     .soc-card[data-id][data-index]
       .soc-card-thumb
         platform icon (centered, large) — or thumbnail image if available
       .soc-card-body.soc-card-source-link(onclick → open url externally)
         .soc-card-title  → title || caption (2-line clamp)
         .soc-card-meta   → platform badge + "by @creatorUsername"
         .soc-card-stats  → 4-column stat row: ❤ likes | 💬 comments | 🔄 shares | 👁 views
                            Each formatted with _socFormatEngagement
         .soc-card-engagement[.hot|.warm|.viral]  → tier badge (if applicable)
       .soc-card-actions
         span → time context (if available) or "Just discovered"
         button.soc-btn.soc-btn-sm → Save / Saved ✓
     ```

  4. **Make `_socRenderSavedCards`** (from chunk 4) use the same card structure for consistency, but with a delete button instead of save, and the source_url as the click target.

- `ui/chat/social-panel.css` — Enhance card styles:
  ```css
  /* Engagement tier badges */
  #social-view .soc-card-engagement.viral {
    background: rgba(239, 68, 68, 0.15); color: var(--error);
    animation: soc-pulse 2s ease-in-out infinite;
  }
  @keyframes soc-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* Stat columns */
  #social-view .soc-card-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    font-size: 10px;
    color: var(--text-secondary);
    padding: 6px 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    margin: 6px 0;
  }
  #social-view .soc-card-stats span {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }
  #social-view .soc-card-stats .stat-value {
    font-weight: 600;
    font-size: 12px;
    color: var(--text-primary);
  }
  #social-view .soc-card-stats .stat-label {
    font-size: 9px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  /* Card thumb platform icon sizing */
  #social-view .soc-card-thumb svg {
    width: 36px;
    height: 36px;
    opacity: 0.4;
  }

  /* Saved button states */
  #social-view .soc-btn-saved {
    opacity: 0.6;
    pointer-events: none;
    color: var(--success);
  }
  ```

### What to Build
Upgrade the discover cards from basic text dumps to rich content cards with proper stat layouts, engagement tier badges, formatted numbers, and clickable source links. Both the search results and saved content views use the same card design for consistency. The engagement tier system is adapted from Daltex's influencer tier concept but applied to content: Viral (50K+) → Hot (10K+) → Trending (1K+) → Decent (100+). Stats are shown in a clean 4-column grid with labels. Cards are clickable to open the source URL.

### Gate
`npm run lint` passes
