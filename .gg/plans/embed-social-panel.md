# Embed Social as Panel in Chat Window

Project: neon-post at /mnt/e/Projects/neon-post
Stack: Electron, TypeScript, vanilla JS/CSS UI panels
Check: npm run typecheck && npm run lint
Chunks: 4

## Research Findings

The app uses an embedded panel pattern for Routines, Brain, Personalize, and Settings inside `chat.html`. Each panel:
1. Has a `<div id="XXX-view">` in `chat.html` (hidden by default)
2. Has a `show/hide/toggle` JS file (`ui/chat/XXX-panel.js`) 
3. Has a scoped CSS file (`ui/chat/XXX-panel.css`)
4. Uses `_dismissOtherPanels('XXX-view')` from `ui/chat/settings-panel.js` to close other panels
5. The sidebar button toggles the panel (no `onclick` that opens a new window)

Currently, Social is a **separate window** (`social.html` + `social/social.js` + `social/social.css`) opened via `openSocialWindow()` in `src/main/index.ts`. The sidebar button at line 74 of `chat.html` has `onclick="window.pocketAgent.app.openSocial()"`.

**Key files to reference for the pattern:**
- `ui/chat/routines-panel.js` — show/hide/toggle + `_dismissOtherPanels` + lazy init
- `ui/chat/routines-panel.css` — all selectors scoped under `#routines-view`
- `ui/chat/settings-panel.js` lines 13-29 — `_dismissOtherPanels()` panel registry
- `ui/chat/global-chat.css` lines 35-44 — hide floating buttons when panels are active

---

## Chunk 1/4: Create Social Panel CSS and JS
**Tier**: sonnet

### Files to Read
- `ui/social/social.css` — source CSS to adapt (scope under `#social-view`)
- `ui/social/social.js` — source JS to adapt (wrap in show/hide/toggle pattern)
- `ui/chat/routines-panel.js` — reference for show/hide/toggle pattern
- `ui/chat/routines-panel.css` — reference for scoping pattern

### Files to Create
- `ui/chat/social-panel.css` — social CSS scoped under `#social-view`, matching the panel pattern. Key changes:
  - Replace `.social-layout` root with `#social-view` (hidden by default, `display: none`, `.active` shows it)
  - Scope ALL selectors under `#social-view` (e.g. `#social-view .social-header`, `#social-view .tab-bar`, etc.)
  - Remove `height: 100vh` from layout (panel fills parent, use `flex: 1; overflow: hidden; display: flex; flex-direction: column;`)
  - Remove `-webkit-app-region: drag` from header (chat window already has drag region)
  - Use `.social-header` class instead of bare `header` tag to avoid conflicting with chat.html's header
  - Keep all tab, card, form, gallery, lightbox, skeleton, badge, status styles — just scope them under `#social-view`
  
- `ui/chat/social-panel.js` — social panel controller matching the routines pattern. Structure:
  ```
  let _socInitialized = false;
  let _socNotyf = null;
  
  function showSocialPanel() {
    const chatView = document.getElementById('chat-view');
    const socialView = document.getElementById('social-view');
    if (!socialView) return;
    _dismissOtherPanels('social-view');
    chatView.classList.add('hidden');
    socialView.classList.add('active');
    const sidebarBtn = document.getElementById('sidebar-social-btn');
    if (sidebarBtn) sidebarBtn.classList.add('active');
    if (!_socInitialized) { _socInit(); _socInitialized = true; }
  }
  
  function hideSocialPanel() { ... }
  function toggleSocialPanel() { ... }
  ```
  - Port ALL logic from `ui/social/social.js` into this file
  - Remove the IIFE wrapper — use global functions like other panels
  - Prefix private vars/functions with `_soc` to avoid collisions (e.g. `_socEscapeHtml`, `_socLoadDiscovered`, `_socLoadPosts`, `_socLoadGallery`, `_socLoadAccounts`, `_socLoadBrand`)
  - `_socInit()` sets up tab switching, event listeners, and calls `_socLoadDiscovered()`
  - Keep `window.socialActions` global for inline onclick handlers
  - The "Done" button onclick should call `hideSocialPanel()` instead of `window.close()`
  - The click sound setup is NOT needed — chat.html already has global click sound handling

### Files to Modify
None in this chunk.

### What to Build
Two new files that implement the Social panel as an embedded view matching the existing panel pattern. The CSS must be scoped under `#social-view` and the JS must follow the show/hide/toggle + lazy-init pattern used by routines-panel.js.

### Gate
Files exist: `test -f ui/chat/social-panel.css && test -f ui/chat/social-panel.js`

---

## Chunk 2/4: Embed Social Panel in chat.html
**Tier**: sonnet

### Files to Read
- `ui/chat.html` — full file, understand structure for insertion points
- `ui/chat/social-panel.css` — created in chunk 1
- `ui/chat/social-panel.js` — created in chunk 1

### Files to Modify
- `ui/chat.html` — Multiple changes:
  1. **Add CSS link** (around line 30, after `routines-panel.css`): `<link rel="stylesheet" href="chat/social-panel.css">`
  2. **Fix sidebar button** (line 74): Remove `onclick="window.pocketAgent.app.openSocial()"` from the social button. It should just be a plain button like the others. Add `id="sidebar-social-btn"` (already has it).
  3. **Add social-view div**: Insert the social panel HTML inside `.main-content` after the other panel views (look for where `routines-view`, `brain-view`, `personalize-view`, `settings-view` divs are). The content is from `social.html` lines 20-334, wrapped in `<div id="social-view">` instead of `<div class="social-layout">`. The `<header>` tag should use class `social-header` to avoid conflicts. Change the "Done" button to call `hideSocialPanel()` instead of `window.close()`.
  4. **Add JS script** (near the end, after other panel scripts like `routines-panel.js` around line 1053): `<script src="chat/social-panel.js"></script>`

- `ui/chat/settings-panel.js` — Add `'social-view': 'sidebar-social-btn'` to the `panels` object in `_dismissOtherPanels()` function (line ~14-19, inside the panels map)

- `ui/chat/global-chat.css` — Add social-view selectors to the floating button hide rules (insert before the closing `{` at line 43):
  ```css
  .main-content:has(.active#social-view) .floating-fresh-btn,
  .main-content:has(.active#social-view) .floating-toggle-btn,
  .main-content:has(.active#social-view) .floating-admin-clear-btn,
  ```

### What to Build
Wire the social panel into chat.html so clicking the Social sidebar button toggles the embedded panel instead of opening a new window. The panel dismisses other panels and vice versa. The sidebar button event listener is set up in `social-panel.js` (binding to `sidebar-social-btn` click → `toggleSocialPanel()`).

### Gate
`npm run typecheck && npm run lint`

---

## Chunk 3/4: Remove Standalone Social Window (Backend)
**Tier**: sonnet

### Files to Read
- `src/main/index.ts` — find `openSocialWindow()` (lines 529-537), `WIN.SOCIAL` (line 69), `buildIPCDeps()` (line 575)
- `src/main/ipc/misc-ipc.ts` — find `app:openSocial` handler
- `src/main/ipc/index.ts` — check if IPCDependencies type references openSocialWindow

### Files to Modify
- `src/main/index.ts`:
  - Remove `openSocialWindow()` function (lines 529-537)
  - Remove `SOCIAL: 'social'` from the `WIN` object (line 69)
  - Remove `openSocialWindow` from `buildIPCDeps()` return object (line 575)
  
- `src/main/ipc/misc-ipc.ts` — Remove the `app:openSocial` IPC handler registration

- `src/main/ipc/index.ts` — Remove `openSocialWindow` from the `IPCDependencies` type if present

### What to Build
Remove all backend code for the standalone Social window — the window factory function, the WIN registry entry, the IPC handler, and the dependency type. Social is now fully embedded in the chat window.

### Gate
`npm run typecheck && npm run lint`

---

## Chunk 4/4: Remove Standalone Social Files and Preload
**Tier**: haiku

### Files to Read
- `src/main/preload.ts` — find `openSocial` binding (line 105) and type definition (line 522)
- `src/main/tray.ts` — check if Social is referenced in tray menu

### Files to Modify
- `src/main/preload.ts`:
  - Remove `openSocial: () => ipcRenderer.invoke('app:openSocial'),` from the `app` object (line 105)
  - Remove `openSocial: () => Promise<void>;` from the `PocketAgentAPI` type definition (line 522)

- `src/main/tray.ts` — Remove any Social menu item if present (may reference openSocialWindow)

### Files to Delete
- `ui/social.html` — no longer needed (content is embedded in chat.html)
- `ui/social/social.js` — replaced by `ui/chat/social-panel.js`
- `ui/social/social.css` — replaced by `ui/chat/social-panel.css`

### What to Build
Clean up the preload API bindings and delete the standalone social files that are no longer needed.

### Gate
`npm run typecheck && npm run lint`
