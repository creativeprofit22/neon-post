# Move Toolbar Buttons to Input Area with Slide-Up Panels

## Overview
Move search, workflows, and chat toggle buttons from `#toolbar-row` into the input container (bottom-left, mirroring mode-select/model-badge on the right). When clicked, expanded content (search bar, workflow grid) slides up from above the input area with smooth animation.

## File: `ui/chat.html`

### 1. CSS Changes

**Remove/repurpose `#toolbar-row`**
- Keep `#toolbar-row` as an invisible anchor element for mention list / reply banner insertion (they use `toolbarRow.parentNode.insertBefore`), but hide it visually — set `display: none` or remove border/padding. Actually simpler: just keep it as a zero-height div above input-area so insertBefore still works.
- Change `#toolbar-row` to: `display: none;` (keep in DOM for JS references)

**New: Input toolbar buttons (bottom-left of input-container)**
- Add `.input-toolbar-btns` — absolutely positioned at `bottom: 8px; left: 8px;`, `display: flex; gap: 4px; z-index: 2;`
- Each button is a small icon-only button (no text label, ~28x28px) styled like the muted controls
- `.input-toolbar-btn` — transparent bg, muted color, border-radius, hover accent

**New: Slide-up panel**
- `.slide-up-panel` — positioned above `#input-area`, initially `max-height: 0; overflow: hidden; transition: max-height 0.25s ease;`
- When `.slide-up-panel.open`, `max-height: 250px;` (or whatever fits)
- Contains the search expanded content and workflow grid
- Background: `var(--bg-secondary)`, border-top: `1px solid var(--border)`

**Adjust search/workflow CSS:**
- `.search-toggle`, `.workflows-toggle`, `.chat-toggle` → replaced by icon buttons in input-toolbar
- `#search-expanded` → moves into slide-up panel, flex layout
- `#workflows-expanded` → moves into slide-up panel
- Remove old toolbar-specific styling

**Adjust input-container left padding** to accommodate the 3 buttons: add `padding-left` or ensure attach-btn and new buttons don't overlap

### 2. HTML Changes

**Add icon buttons inside `.input-container`** (at bottom-left, after textarea):
```html
<div class="input-toolbar-btns">
  <button class="input-toolbar-btn" id="search-toolbar-btn" onclick="playNormalClick(); toggleSearch()" title="Search">
    <!-- search icon SVG -->
  </button>
  <button class="input-toolbar-btn" id="workflows-toolbar-btn" onclick="playNormalClick(); toggleWorkflows()" title="Workflows">
    <!-- code icon SVG -->
  </button>
  <button class="input-toolbar-btn" id="chat-toolbar-btn" onclick="playNormalClick(); toggleGlobalChat()" title="Chat">
    <!-- chat icon SVG -->
  </button>
  <div id="background-tasks-area" class="hidden">
    <!-- keep existing bg task toggle + dropdown -->
  </div>
</div>
```

**Add slide-up panel above `#input-area`:**
```html
<div id="slide-up-panel" class="slide-up-panel">
  <!-- Search expanded content (moved from toolbar-row) -->
  <div id="search-panel" class="slide-panel-content hidden">
    <!-- existing search-expanded contents -->
  </div>
  <!-- Workflows expanded content (moved from toolbar-row) -->
  <div id="workflows-panel" class="slide-panel-content hidden">
    <!-- existing workflows-grid + close btn -->
  </div>
</div>
```

**Keep `#toolbar-row` in DOM** but empty/hidden (for mention list + reply banner insertion point). Or change the JS references to use `#input-area` instead.

### 3. JavaScript Changes

**`toggleSearch()`**: Instead of toggling classes on `#search-area`, show/hide `#search-panel` inside slide-up panel + add `.open` to `#slide-up-panel`. Close workflows panel if open.

**`closeSearch()`**: Hide `#search-panel`, remove `.open` from slide-up panel if nothing else is open.

**`toggleWorkflows()`**: Show/hide `#workflows-panel` inside slide-up panel. Close search if open.

**`closeWorkflows()`**: Hide `#workflows-panel`, remove `.open`.

**Chat toggle**: Still calls `toggleGlobalChat()` — no panel needed, it switches the whole view.

**Mention list & reply banner**: Change `toolbarRow` reference to `document.getElementById('input-area')` and use `insertBefore` on that instead.

**`toggleGlobalChat()`**: Update to hide/show `.input-toolbar-btns` elements, the search/workflow toolbar buttons, etc. The `toolbarRow` hide/show references need updating.

### 4. Layout Summary (bottom of input container)

```
[attach] [workflow-badge] [textarea_________________________]
[🔍] [⚡] [💬] [bg]           [mode ▾] [model ▾] [🐾 send]
```

Left side: icon buttons for search, workflows, chat, bg tasks
Right side: mode select, model select, send button

### 5. Risks
- Mention list/reply banner insertion needs updating since toolbar-row is being hidden
- Background tasks dropdown positioning (currently absolute from bg-tasks-area) should still work if bg-tasks-area is in the input-toolbar-btns
- Global chat toggle hides many elements — need to update all references
- The slide-up panel animation needs careful max-height calculation
