#!/bin/bash
set -eo pipefail

PROJECT_DIR="/mnt/e/Projects/neon-post"
LOG_DIR="$PROJECT_DIR/.claude/logs"
CHECK_CMD="npm run typecheck && npm run lint"
FEATURE_NAME="Social Panel UX Overhaul — Tab Consolidation, Media Attach, Copilot"
TOTAL_CHUNKS=12

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

START_CHUNK=1
SKIP_FINAL_CHECK=false
CLEANUP_EVERY=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --start) START_CHUNK="$2"; shift 2 ;;
    --skip-final-check) SKIP_FINAL_CHECK=true; shift ;;
    --cleanup-every) CLEANUP_EVERY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

mkdir -p "$LOG_DIR"

echo -e "${BLUE}══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Plan Executor - $FEATURE_NAME${NC}"
echo -e "${BLUE}  $TOTAL_CHUNKS chunks, starting from $START_CHUNK${NC}"
[[ "$CLEANUP_EVERY" -gt 0 ]] && echo -e "${BLUE}  CLAUDE.md cleanup every $CLEANUP_EVERY chunks${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════${NC}"
echo ""

PREV_CONTEXT=""
PREV_CONTEXT_STAT=""
CHUNKS_SINCE_CLEANUP=0

capture_context() {
  cd "$PROJECT_DIR"
  PREV_CONTEXT=$(git diff HEAD 2>/dev/null | head -300 || echo "")
  PREV_CONTEXT_STAT=$(git diff --stat HEAD 2>/dev/null || echo "")
}

run_quality_gate() {
  local num=$1
  local gate_log="$LOG_DIR/gate-${num}.log"

  echo -e "${CYAN}  Running quality gate...${NC}"
  cd "$PROJECT_DIR"

  if eval "$CHECK_CMD" > "$gate_log" 2>&1; then
    echo -e "${GREEN}  ✓ Quality gate passed${NC}"
    return 0
  else
    echo -e "${YELLOW}  ⚠ Quality gate failed — spawning fix pass...${NC}"
    local errors
    errors=$(cat "$gate_log")
    local fix_log="$LOG_DIR/fix-${num}.log"

    claude --dangerously-skip-permissions --max-turns 20 \
      -p "$(cat <<FIXPROMPT
Fix quality check errors in neon-post at $PROJECT_DIR

Errors:
\`\`\`
$errors
\`\`\`

Rules:
- Read each file mentioned in the errors
- Fix errors with minimal changes — do NOT refactor or improve surrounding code
- Re-run: $CHECK_CMD
- Loop until clean
- Do NOT ask questions
FIXPROMPT
)" < /dev/null 2>&1 | tee "$fix_log"

    if eval "$CHECK_CMD" > "$gate_log" 2>&1; then
      echo -e "${GREEN}  ✓ Fix pass succeeded${NC}"
      return 0
    else
      echo -e "${RED}  ✗ Still failing after fix pass — STOPPING${NC}"
      echo -e "${RED}  Fix manually, then resume: ./scripts/run-plan.sh --start $((num + 1))${NC}"
      exit 1
    fi
  fi
}

auto_commit() {
  local num=$1
  local name=$2
  cd "$PROJECT_DIR"

  if ! git diff --quiet HEAD 2>/dev/null; then
    git add -A
    git commit -m "chunk ${num}/${TOTAL_CHUNKS}: ${name}

Auto-committed by plan executor after quality gate passed." --no-gpg-sign 2>/dev/null || true
    echo -e "${GREEN}  ✓ Auto-committed chunk $num${NC}"
  fi
}

run_cleanup() {
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}Running CLAUDE.md cleanup...${NC}"
  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 10 \
    -p "Run /minimal-claude:setup-claude-md to clean up CLAUDE.md at $PROJECT_DIR. Keep it minimal and under 150 lines. Do NOT ask questions." \
    < /dev/null 2>&1 | tee "$LOG_DIR/cleanup.log"
  echo -e "${CYAN}✓ Cleanup done${NC}"
}

# ══════════════════════════════════════════════════════
# CHUNK FUNCTIONS — one per chunk, prompt baked in
# ══════════════════════════════════════════════════════

run_chunk_1() {
  local log="$LOG_DIR/chunk-1.log"
  echo -e "${YELLOW}▶ Chunk 1/$TOTAL_CHUNKS: Tab Bar — Consolidate 8 Tabs to 4 + Gear Icon${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_1_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [ADAPT] latewiz — 5-Section Navigation (from zernio-dev/latewiz)
Production social scheduling tools use 5 navigation sections max:
- Dashboard (overview), Compose (create), Calendar (schedule), Accounts (settings), Queue (posting schedule)
- "Discover" is NOT a separate section — it feeds content INTO compose
- Accounts/settings are separated from the main workflow

Key code pattern for nav items:
```typescript
const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Compose",   href: "/dashboard/compose", icon: PenSquare },
  { label: "Calendar",  href: "/dashboard/calendar", icon: Calendar },
  { label: "Accounts",  href: "/dashboard/accounts", icon: Users },
  { label: "Queue",     href: "/dashboard/queue", icon: ListOrdered },
];
```

### [ADAPT] Existing Codebase — Tab Switching Pattern
```javascript
// Current: toggles .active on .soc-tab-btn and #soc-tab-{name}
root.querySelectorAll('.soc-tab-btn').forEach(b => b.classList.remove('active'));
root.querySelectorAll('.soc-tab-content').forEach(c => c.classList.remove('active'));
btn.classList.add('active');
root.querySelector('#soc-tab-' + target).classList.add('active');
// Lazy-loads data per tab
```

## Chunk 1/12: Tab Bar — Consolidate 8 Tabs to 4 + Gear Icon

Depends on: None

**Read these files first** (do NOT explore beyond this list):
- `ui/chat.html` — current tab bar structure (`.soc-tab-bar`), all 8 `soc-tab-btn` buttons, all 8 `soc-tab-content` sections
- `ui/chat/social-panel.js` — `navigateToSocialTab()` (line 53), `_socInit()` tab switching (line 864)
- `ui/chat/social-panel.css` — `.soc-tab-bar`, `.soc-tab-btn` styles

**Modify:**
- `ui/chat.html` — replace 8 tab buttons with 4: Content (🔍), Create (✨), Calendar (📅), Preview (👁). Add a gear icon button (⚙) in the panel header (`.soc-header-actions`), NOT in the tab bar. Rename tab content containers: `soc-tab-discover` → `soc-tab-content-browse`, keep `soc-tab-create`, merge `soc-tab-drafts` INTO `soc-tab-create`, keep `soc-tab-calendar`, keep `soc-tab-preview`. Hide `soc-tab-posts`, `soc-tab-gallery`, `soc-tab-accounts` (don't delete — they move in later chunks).
- `ui/chat/social-panel.js` — update `navigateToSocialTab()` to handle new tab names. Update `_socInit()` tab click handlers. Add backward-compat mapping: `'discover'→'content-browse'`, `'drafts'→'create'`.
- `ui/chat/social-panel.css` — adjust tab bar for 4 tabs (slightly wider buttons, better spacing). Add `.soc-header-gear` style for the gear icon button.

**What to Build:**
Consolidate the tab bar from 8 tabs to 4 workflow tabs (Content, Create, Calendar, Preview) plus a gear icon in the header for settings. The Content tab gets what was Discover. The Create tab will eventually get Drafts merged in (next chunks). For now, just rename and hide the old tabs. Ensure all existing lazy-load triggers still fire correctly.

**Expected Layout:**
```
┌─────────────────────────────────────────────────┐
│ Social                              [←] [⚙]    │  ← gear icon in header
├─────────────────────────────────────────────────┤
│  🔍 Content  │  ✨ Create  │  📅 Calendar  │  👁 Preview  │
├─────────────────────────────────────────────────┤
│                                                 │
│  [tab content]                                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. 4 tabs visible in tab bar. Clicking each tab shows correct content. Gear icon visible in header. Old tab data still loads (discover search, calendar, preview mockups).
CHUNK_1_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_2() {
  local log="$LOG_DIR/chunk-2.log"
  echo -e "${YELLOW}▶ Chunk 2/$TOTAL_CHUNKS: Accounts → Gear Icon Modal${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_2_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [ADAPT] Existing Codebase — Tab Switching Pattern
```javascript
root.querySelectorAll('.soc-tab-btn').forEach(b => b.classList.remove('active'));
root.querySelectorAll('.soc-tab-content').forEach(c => c.classList.remove('active'));
btn.classList.add('active');
root.querySelector('#soc-tab-' + target).classList.add('active');
```

### [ADAPT] Existing Codebase — Preload Bridge Pattern
```typescript
social: {
  methodName: (...args) => ipcRenderer.invoke('social:channelName', ...args),
  onEventName: (cb) => { ipcRenderer.on('social:event-name', (_, data) => cb(data)); },
}
```

## Chunk 2/12: Accounts → Gear Icon Modal

Depends on: Chunk 1 (for gear icon button)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat.html` — `#soc-tab-accounts` section (connected accounts form, API keys, brand voice)
- `ui/chat/social-panel.js` — `_socLoadAccounts()`, `_socLoadBrand()`, `_socTogglePlatformFields()`, `_socResetAccountForm()`
- `ui/chat/social-panel.css` — accounts styles (`.soc-accounts-list`, `.soc-add-account-form`, `.soc-scraping-keys`, `.soc-brand-form`)

**Modify:**
- `ui/chat.html` — wrap the accounts content in a modal overlay `#soc-accounts-modal`. The modal has a dark backdrop, centered panel (~500px wide, scrollable), close button. Move ALL accounts HTML (accounts list, add/edit form, API keys, brand voice) into the modal.
- `ui/chat/social-panel.js` — add `_socOpenAccountsModal()` and `_socCloseAccountsModal()`. Wire gear icon to open. Wire close button and backdrop click to close. Call `_socLoadAccounts()` and `_socLoadBrand()` on open.
- `ui/chat/social-panel.css` — add modal styles: `.soc-modal-overlay` (fixed, inset 0, bg rgba(0,0,0,0.6), z-index 100, flex center), `.soc-modal-panel` (bg var(--bg-secondary), border, rounded, max-height 85vh, overflow-y auto, padding 24px, width 500px).

**What to Build:**
Move the Accounts tab content (connected accounts, API keys, brand voice) into a modal that opens when clicking the gear icon. This removes Accounts from the main workflow tabs.

**Expected Layout:**
```
┌─ Modal ─────────────────────────────┐
│ Settings                        [✕] │
├─────────────────────────────────────┤
│ Connected Accounts                  │
│ [account list + add form]           │
│                                     │
│ Scraping API Keys                   │
│ [Apify] [RapidAPI] [Kie.ai] [Asm]  │
│                                     │
│ Brand Voice                         │
│ [brand form fields]                 │
│                                     │
│              [Save Brand]           │
└─────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Gear icon opens modal with all account settings. Modal closes on X, backdrop click, and Escape. Account save/edit still works from within the modal.
CHUNK_2_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_3() {
  local log="$LOG_DIR/chunk-3.log"
  echo -e "${YELLOW}▶ Chunk 3/$TOTAL_CHUNKS: Content Tab — Add Gallery as Sub-Tab${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_3_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [ADAPT] Existing Codebase — Tab Switching Pattern
```javascript
root.querySelectorAll('.soc-tab-btn').forEach(b => b.classList.remove('active'));
root.querySelectorAll('.soc-tab-content').forEach(c => c.classList.remove('active'));
btn.classList.add('active');
root.querySelector('#soc-tab-' + target).classList.add('active');
```

## Chunk 3/12: Content Tab — Add Gallery as Sub-Tab

Depends on: Chunk 1 (for Content tab rename)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat.html` — `#soc-tab-discover` section (sub-tabs: Search, Saved, Trends), `#soc-tab-gallery` section (filter bar, grid, select toolbar)
- `ui/chat/social-panel.js` — `_socLoadGallery()`, `_socApplyGalleryFilters()`, `_socToggleSelectMode()`, `_socDeleteSelected()`, `_socLightboxShowItem()`, discover sub-tab switching
- `ui/chat/social-panel.css` — gallery styles (`.soc-gallery-*`), discover sub-tab styles (`.soc-discover-sub-tab`)

**Modify:**
- `ui/chat.html` — add a 4th discover sub-tab button: `data-discover-view="gallery"` with label "🖼 Gallery". Add a new `#soc-discover-view-gallery` div containing the gallery filter bar, select toolbar, and grid (move from `#soc-tab-gallery`). Remove `#soc-tab-gallery` section entirely.
- `ui/chat/social-panel.js` — update discover sub-tab switching to handle `gallery` view. Call `_socLoadGallery()` when gallery sub-tab is selected. Remove gallery lazy-load from old tab handler.
- `ui/chat/social-panel.css` — ensure gallery styles work within the content tab context (no ID-dependent selectors).

**What to Build:**
Move the Gallery into the Content tab as a 4th sub-tab alongside Search, Saved, and Trends. This puts all content (found, saved, generated) in one place.

**Expected Layout:**
```
┌─ Content Tab ───────────────────────────────────┐
│  🔍 Search  │  💾 Saved  │  📈 Trends  │ 🖼 Gallery │
├─────────────────────────────────────────────────┤
│ [Gallery sub-tab selected:]                     │
│ [search] [type filter] [★ fav] [sort] [select]  │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│ │ img  │ │ img  │ │ img  │ │ img  │            │
│ └──────┘ └──────┘ └──────┘ └──────┘            │
│ ┌──────┐ ┌──────┐ ┌──────┐                     │
│ │ img  │ │ img  │ │ img  │                     │
│ └──────┘ └──────┘ └──────┘                     │
└─────────────────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Gallery sub-tab loads images. Search, filter, sort, select-mode, delete all work. Lightbox opens from gallery items.
CHUNK_3_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_4() {
  local log="$LOG_DIR/chunk-4.log"
  echo -e "${YELLOW}▶ Chunk 4/$TOTAL_CHUNKS: Create Tab — Merge Drafts, Add 3 Entry Points${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_4_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [ADAPT] Existing Codebase — Preload Bridge Pattern
```typescript
social: {
  methodName: (...args) => ipcRenderer.invoke('social:channelName', ...args),
  onEventName: (cb) => { ipcRenderer.on('social:event-name', (_, data) => cb(data)); },
}
```

### [ADAPT] Existing Codebase — Tab Switching Pattern
```javascript
root.querySelectorAll('.soc-tab-btn').forEach(b => b.classList.remove('active'));
root.querySelectorAll('.soc-tab-content').forEach(c => c.classList.remove('active'));
btn.classList.add('active');
root.querySelector('#soc-tab-' + target).classList.add('active');
```

## Chunk 4/12: Create Tab — Merge Drafts, Add 3 Entry Points

Depends on: Chunk 1 (for Create tab restructure)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat.html` — `#soc-tab-create` (Generate, Repurpose, Image sub-panels), `#soc-tab-drafts` (repurpose context, create-from-video, drafts list)
- `ui/chat/social-panel.js` — `_socLoadDrafts()`, `_socRenderDraftsList()`, `_socShowDraftsRepurposeCtx()`, `_socInitColdUpload()`, Create sub-tab switching, `socPanelActions.repurposeSaved()`
- `ui/chat/social-panel.css` — create sub-tab styles, draft card styles, create-from-video styles

**Modify:**
- `ui/chat.html` — restructure `#soc-tab-create` to have: (1) "Start a Post" section at top with 3 large buttons, (2) repurpose context section (moved from drafts), (3) drafts list section (moved from drafts). Remove `#soc-tab-drafts` entirely — its content is now inside Create. Keep the old Create sub-panels (Generate, Repurpose, Image) accessible via the "Write from Scratch" entry point.
- `ui/chat/social-panel.js` — update `socPanelActions.repurposeSaved()` to navigate to `create` tab (not `drafts`). Update `_socInit()` to wire new entry point buttons. Wire "From Saved Content" to show a saved content picker (reuse `_socSavedCache`). Wire "From Video" to call `social.pickVideoFile()` + attach only (NO auto-transcription). Wire "Write from Scratch" to show Generate sub-panel. Load drafts when Create tab opens.
- `ui/chat/social-panel.css` — add `.soc-entry-points` grid (3 columns, large clickable cards with icons), update draft list positioning within Create tab.

**What to Build:**
Merge the Drafts tab into Create. At the top: three entry points (From Saved Content, From Video, Write from Scratch). Below: the repurpose context panel (shown when repurposing). Below that: the drafts list. This creates a single place for all post creation and draft management.

**Expected Layout:**
```
┌─ Create Tab ────────────────────────────────────┐
│ Start a Post                                    │
│ ┌──────────────┐ ┌──────────────┐ ┌────────────┐│
│ │ 💾           │ │ 🎬           │ │ ✍️         ││
│ │ From Saved   │ │ From Video   │ │ Write from ││
│ │ Content      │ │              │ │ Scratch    ││
│ └──────────────┘ └──────────────┘ └────────────┘│
│                                                 │
│ [Repurpose context - hidden unless repurposing] │
│                                                 │
│ ── Drafts ──────────── [filter: All Platforms] ─│
│ ┌─ TikTok ─────────────────────────────────────┐│
│ │ Post content preview...           120/2200   ││
│ └──────────────────────────────────────────────┘│
│ ┌─ Instagram ──────────────────────────────────┐│
│ │ Post content preview...            85/2200   ││
│ └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Three entry points visible. "From Saved" shows saved items picker. "From Video" opens file dialog and attaches video WITHOUT auto-transcription. "Write from Scratch" shows text editor. Drafts list renders below. Repurpose from Saved tab still works (navigates to Create tab with context).
CHUNK_4_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_5() {
  local log="$LOG_DIR/chunk-5.log"
  echo -e "${YELLOW}▶ Chunk 5/$TOTAL_CHUNKS: Media Attachment System — Unified Attach Button${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_5_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [ADAPT] latewiz — Platform Selector with Constraint Warnings
When media is incompatible with a platform, show inline warning:
```
🎵 TikTok                    ⚠ Requires video
📸 Instagram     @user       ✓
🐦 X / Twitter   @user       ✓
```

### [ADAPT] Existing Codebase — Preload Bridge Pattern
```typescript
social: {
  methodName: (...args) => ipcRenderer.invoke('social:channelName', ...args),
  onEventName: (cb) => { ipcRenderer.on('social:event-name', (_, data) => cb(data)); },
}
```

## Chunk 5/12: Media Attachment System — Unified Attach Button

Depends on: Chunk 4 (for draft cards in Create tab)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — `_socRenderDraftsList()`, `_socPickVideoForDraft()`
- `src/main/ipc/social-ipc.ts` — `social:pickVideoFile` handler, `social:uploadVideo` handler
- `src/main/preload.ts` — `pickVideoFile()`, `uploadVideo()` methods
- `ui/chat/social-panel.css` — draft card styles

**Create:**
- (none — all changes in existing files)

**Modify:**
- `src/main/ipc/social-ipc.ts` — add `social:pickMediaFiles` IPC handler that opens `dialog.showOpenDialog` with multi-select, filters for images (jpg, png, gif, webp) AND videos (mp4, mov, avi, mkv, webm). Returns array of `{ filePath, fileName, type: 'image'|'video' }`. Add `social:attachMedia` handler that copies files to userData storage and updates the social_post's media fields.
- `src/main/preload.ts` — expose `social.pickMediaFiles()` and `social.attachMedia(draftId, files)`.
- `ui/chat/social-panel.js` — replace "Upload Video" button on draft cards with "Attach Media" button. On click: call `pickMediaFiles()`, then `attachMedia()`. After attach, show thumbnail strip on the card. Add `_socRenderMediaThumbnails(mediaItems)` function. Add remove button (✕) on each thumbnail. Add platform constraint warning (e.g. "TikTok: video required") based on `data-platform`.
- `ui/chat/social-panel.css` — add `.soc-media-strip` (flex row, gap 8px, overflow-x auto), `.soc-media-thumb` (48x48, rounded, object-cover, relative), `.soc-media-thumb__remove` (absolute top-right, 16x16, bg red, white ✕), `.soc-platform-warning` (font-size 11px, color var(--warning), flex with ⚠ icon).
- `src/memory/social-posts.ts` — add `media_items` TEXT column (JSON array of `{path, type, name}`). Add migration ALTER TABLE.

**What to Build:**
Replace the video-only upload with a unified "Attach Media" system. Users can attach multiple images AND/OR videos to a draft. Each attached file shows as a thumbnail in a horizontal strip. Thumbnails have an ✕ to remove. Platform-specific warnings appear when media doesn't match requirements (TikTok needs video, Instagram allows up to 10 images, etc.).

**Expected Layout:**
```
┌─ Draft Card ────────────────────────────────────┐
│ 🎵 TIKTOK    Post content preview...   120/2200 │
│──────────────────────────────────────────────────│
│ [editable textarea]                              │
│                                                  │
│ ┌──────┐ ┌──────┐ ┌──────┐  [+ Attach Media]   │
│ │ img1 │ │ img2 │ │🎬vid │                      │
│ │  ✕   │ │  ✕   │ │  ✕   │                      │
│ └──────┘ └──────┘ └──────┘                      │
│ ⚠ TikTok requires a video                       │
│                                                  │
│ from: NFL viral content · 2h ago                 │
│ [Schedule] [Copy] [Delete]                       │
└──────────────────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. "Attach Media" opens file dialog with image+video filters. Selected files appear as thumbnails. Remove button works. Platform warnings show for incompatible media. Media persisted in social_posts.media_items column.
CHUNK_5_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_6() {
  local log="$LOG_DIR/chunk-6.log"
  echo -e "${YELLOW}▶ Chunk 6/$TOTAL_CHUNKS: Video Upload — Decouple from Transcription${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_6_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [ADAPT] Existing Codebase — Preload Bridge Pattern
```typescript
social: {
  methodName: (...args) => ipcRenderer.invoke('social:channelName', ...args),
  onEventName: (cb) => { ipcRenderer.on('social:event-name', (_, data) => cb(data)); },
}
```

## Chunk 6/12: Video Upload — Decouple from Transcription

Depends on: Chunk 5 (for media attachment system)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — `_socInitColdUpload()`, current auto-transcription flow
- `src/main/ipc/social-ipc.ts` — `social:coldUpload` handler
- `src/social/content/finalize.ts` — finalize function
- `ui/chat/social-panel.css` — create-from-video step styles

**Modify:**
- `ui/chat/social-panel.js` — rewrite "From Video" entry point flow: (1) pick file via `pickMediaFiles()`, (2) create a draft with video attached (call `social.createPost` with status='draft' + media), (3) show the new draft card with video thumbnail. NO automatic transcription. Add a "Generate Copy from Video" button on draft cards that have a video but no content. THIS button triggers transcription + generation with real progress steps.
- `ui/chat/social-panel.css` — add `.soc-generate-from-video-btn` style (prominent accent button, only on video-attached drafts without content). Update step progress to show real percentages if available.
- `src/main/ipc/social-ipc.ts` — add `social:generateFromVideo` handler: takes `{draftId}`, reads video_path from the draft, transcribes, generates copy, updates the draft. Emits progress events: `video:transcribing` (with %), `video:generating`, `video:complete`.

**What to Build:**
Decouple video attachment from transcription/generation. Attaching a video = just attaching, showing thumbnail. Generating copy = separate explicit action the user triggers when ready. Progress shows real steps with the transcription status.

**Expected Layout:**
```
[Draft card with video attached but no content yet:]
┌──────────────────────────────────────────────────┐
│ 🎵 TIKTOK    (no content yet)            0/2200 │
│──────────────────────────────────────────────────│
│ ┌──────────┐                                     │
│ │ 🎬 video │  workout-clip.mp4                   │
│ │ thumbnail│  (12.4 MB)                          │
│ └──────────┘                                     │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │  ✨ Generate Copy from Video                 │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [When generating:]                               │
│  ✓ Upload  →  ● Transcribing (62%)  →  ○ Generate│
└──────────────────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. "From Video" creates draft with video attached, NO auto-transcription. "Generate Copy from Video" button appears only on drafts with video + no content. Clicking it transcribes and generates with visible progress. Draft updates with generated content.
CHUNK_6_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_7() {
  local log="$LOG_DIR/chunk-7.log"
  echo -e "${YELLOW}▶ Chunk 7/$TOTAL_CHUNKS: Schedule Modal — 3-Way Toggle with Quick Presets${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_7_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [REPLICATE] latewiz — Schedule Picker 3-Way Toggle
Three options in a grid instead of raw datetime picker:
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    ⚡ Zap     │ │  📅 Calendar │ │   🕐 Clock   │
│ Publish Now  │ │   Schedule   │ │ Add to Queue │
└──────────────┘ └──────────────┘ └──────────────┘

[Quick presets when "Schedule" selected:]
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Tomorrow 9AM│ │Tomorrow 6PM │ │ Next Monday │
└─────────────┘ └─────────────┘ └─────────────┘

┌─────────────────┐ ┌──────────┐
│ Date:  Apr 3    │ │ Time: 14:│
└─────────────────┘ └──────────┘
```

## Chunk 7/12: Schedule Modal — 3-Way Toggle with Quick Presets

Depends on: Chunk 4 (for draft cards in Create tab)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — `socPanelActions.draftSchedule()`, `socPanelActions.draftConfirmSchedule()`, `_socShowScheduleSuccessToast()`, `_socRefreshAfterSchedule()`
- `ui/chat/social-panel.css` — draft card schedule section styles

**Modify:**
- `ui/chat.html` — add `#soc-schedule-modal` overlay with: title showing draft platform, 3-way toggle grid (Publish Now / Schedule / Add to Queue), quick preset buttons (Tomorrow 9 AM, Tomorrow 6 PM, Next Monday), date+time pickers, confirm button.
- `ui/chat/social-panel.js` — `socPanelActions.draftSchedule()` now opens the modal instead of inline datetime. Modal stores the draftId. "Publish Now" calls post immediately. "Schedule" shows date+time pickers. Quick presets auto-fill the pickers. Confirm calls the appropriate action. On success: close modal, show success toast with "View in Calendar" link, refresh calendar + posts.
- `ui/chat/social-panel.css` — style the schedule modal: `.soc-schedule-modal` (same overlay pattern as accounts modal), `.soc-schedule-toggle` (3-col grid, each option is a clickable card with icon+label, selected state = border-primary bg-primary/5), `.soc-schedule-presets` (flex-wrap gap-8, small outline buttons), `.soc-schedule-pickers` (grid 2-col for date+time).

**What to Build:**
Replace the cramped inline datetime picker with a proper schedule modal. Three options: Publish Now, Schedule (with date+time), Add to Queue. Quick presets for common times. Clean confirmation flow.

**Expected Layout:**
```
┌─ Schedule Modal ─────────────────────────────┐
│ Schedule Post                            [✕] │
│ 🎵 TikTok draft                              │
├──────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────┐ ┌────────────┐│
│ │    ⚡      │ │    📅      │ │    🕐      ││
│ │Publish Now │ │  Schedule  │ │Add to Queue││
│ └────────────┘ └────────────┘ └────────────┘│
│                                              │
│ Quick picks:                                 │
│ [Tomorrow 9AM] [Tomorrow 6PM] [Next Monday]  │
│                                              │
│ ┌────────────────┐ ┌──────────┐              │
│ │ Date: Apr 3    │ │Time: 14: │              │
│ └────────────────┘ └──────────┘              │
│                                              │
│           [Schedule Post →]                  │
└──────────────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For findings tagged `[REPLICATE]`: adapt the provided code to this project's stack. Do NOT improvise the visuals or invent your own approach — the code is there because it produces the exact look we want.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Schedule button on draft opens modal. Three toggle options work. Quick presets fill date+time. "Schedule Post" schedules the draft. Calendar refreshes. Success toast with "View in Calendar" link appears.
CHUNK_7_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_8() {
  local log="$LOG_DIR/chunk-8.log"
  echo -e "${YELLOW}▶ Chunk 8/$TOTAL_CHUNKS: Calendar Tab — Merge Posts, Add Agenda List View${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_8_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [REPLICATE] latewiz — Calendar Agenda with Sticky Day Headers
Grouped posts by date with sticky headers, today highlighting:
```
┌──── Today ──────────────────── 3 posts ────┐
│ [thumb] Post content...  ●TT ●IG  2:00 PM │
│ [thumb] Another post...  ●X       4:30 PM │
│ [thumb] Third post...    ●LI      6:00 PM │
├──── Tomorrow ───────────────── 1 post ─────┤
│ [thumb] Scheduled post   ●IG      9:00 AM │
├──── Friday, April 5 ────────── 2 posts ────┤
│ ...                                        │
└────────────────────────────────────────────┘
```

### [REPLICATE] latewiz — PostCard with Media Preview + Platform Icons + Status Badge
Status badge colors:
```
draft:      bg-zinc-100  text-zinc-500    (outline)
scheduled:  bg-blue-100  text-blue-700
publishing: bg-yellow-100 text-yellow-700
published:  bg-green-100 text-green-700
failed:     bg-red        text-white       (destructive)
```

Platform icons as overlapping circles with `flex -space-x-1`, each in a `h-6 w-6 rounded-full border-2 border-muted bg-background` container.

## Chunk 8/12: Calendar Tab — Merge Posts, Add Agenda List View

Depends on: Chunk 1 (for Calendar tab)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat.html` — `#soc-tab-calendar` section, `#soc-tab-posts` section (composer + posts table)
- `ui/chat/social-panel.js` — `_socCalendarRender()`, `_socRenderAgendaView()`, `_socLoadPosts()`, view switcher logic
- `ui/chat/social-panel.css` — calendar styles, posts table styles, agenda view styles

**Modify:**
- `ui/chat.html` — remove `#soc-tab-posts` entirely. Move the composer (textarea + platform + status + datetime + create button) into the Calendar tab as a collapsible "Quick Post" section at the top. Update the view switcher to have: Month, Week, Agenda, Posts (table view).
- `ui/chat/social-panel.js` — add "Posts" as 4th calendar view. When selected, render the posts table (reuse existing `_socLoadPosts()` rendering). Update agenda view to use the sticky day headers pattern from research (group by date, "Today"/"Tomorrow" labels, thumbnails, platform icons, status badges). Move composer logic to Calendar context.
- `ui/chat/social-panel.css` — add `.soc-agenda-day-header` (sticky, bg-muted/80, backdrop-blur, padding), `.soc-agenda-post` (flex row, thumbnail + content + platform icons + time + status badge). Update calendar view switcher for 4 options.

**What to Build:**
Merge Posts into Calendar. The Calendar tab now has 4 views: Month (grid), Week, Agenda (grouped list with sticky day headers), Posts (table). A collapsible "Quick Post" section at top replaces the old composer. The agenda view shows posts grouped by date with thumbnails, platform icons, and status badges.

**Expected Layout:**
```
┌─ Calendar Tab ──────────────────────────────────┐
│ [Quick Post ▼]  (collapsible)                   │
│                                                 │
│ ← Apr 2026 →  [Today]  Month|Week|Agenda|Posts  │
│                                                 │
│ [Agenda view selected:]                         │
│ ┌─── Today ──────────────────── 3 posts ──────┐ │
│ │ [🎬] Caption text...  ●TT ●IG    2:00 PM   │ │
│ │      Scheduled ●                            │ │
│ │ [📸] Another post...  ●X         4:30 PM   │ │
│ │      Draft ○                                │ │
│ ├─── Tomorrow ───────────────── 1 post ───────┤ │
│ │ [📸] Scheduled post   ●LI       9:00 AM    │ │
│ │      Scheduled ●                            │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For findings tagged `[REPLICATE]`: adapt the provided code to this project's stack. Do NOT improvise the visuals or invent your own approach — the code is there because it produces the exact look we want.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. All 4 calendar views work (Month, Week, Agenda, Posts). Agenda shows grouped posts with sticky headers and "Today"/"Tomorrow" labels. Quick Post section creates posts. Posts table view shows same data as old Posts tab.
CHUNK_8_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_9() {
  local log="$LOG_DIR/chunk-9.log"
  echo -e "${YELLOW}▶ Chunk 9/$TOTAL_CHUNKS: Inline Preview on Draft Cards${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_9_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [ADAPT] Existing Codebase — Mockup Rendering Functions
The app has per-platform mockup renderers: `_socRenderIGMockup()`, `_socRenderTTMockup()`, `_socRenderTWMockup()`, `_socRenderFBMockup()`, `_socRenderLIMockup()`. Each takes content data and renders a phone-frame mockup into a container element.

## Chunk 9/12: Inline Preview on Draft Cards

Depends on: Chunk 4 (for draft cards in Create tab)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — `_socRenderDraftsList()`, `_socRenderIGMockup()`, `_socRenderTTMockup()`, `_socRenderTWMockup()`, `_socRenderFBMockup()`, `_socRenderLIMockup()`, existing mockup rendering
- `ui/chat/social-panel.css` — preview mockup styles (`.soc-mockup-*`)

**Modify:**
- `ui/chat/social-panel.js` — add "Preview" button to draft card actions. On click: toggle a `.soc-draft-card__preview` section below the card body. Render ONLY the mockup for this draft's platform (not all 5). Reuse existing mockup rendering functions. Pass draft content + media as the mockup data.
- `ui/chat/social-panel.css` — add `.soc-draft-card__preview` (border-top, padding 16px, background var(--bg-primary)). Constrain mockup to max-width 320px, centered. Add slide-down animation.

**What to Build:**
Add inline preview to draft cards. Clicking "Preview" on a TikTok draft shows the TikTok phone mockup with that draft's content rendered inside. Only one platform mockup per card — the one matching the draft's platform. Toggling preview again collapses it.

**Expected Layout:**
```
┌─ Draft Card ────────────────────────────────────┐
│ 🎵 TIKTOK    Post content...            120/2200│
│──────────────────────────────────────────────────│
│ [textarea]                                       │
│ [Schedule] [Copy] [Preview ▼] [Delete]           │
│──────────────────────────────────────────────────│
│         ┌─────────────────┐                      │
│         │   TikTok Phone  │                      │
│         │   ┌───────────┐ │                      │
│         │   │ @user     │ │                      │
│         │   │           │ │                      │
│         │   │ Your post │ │                      │
│         │   │ content   │ │                      │
│         │   │ here...   │ │                      │
│         │   └───────────┘ │                      │
│         └─────────────────┘                      │
│         [Open Full Preview →]                    │
└──────────────────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. "Preview" button toggles mockup below draft card. Correct platform mockup renders (TikTok for TikTok drafts, Instagram for IG drafts, etc.). Content from draft textarea appears in mockup. "Open Full Preview" navigates to Preview tab.
CHUNK_9_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_10() {
  local log="$LOG_DIR/chunk-10.log"
  echo -e "${YELLOW}▶ Chunk 10/$TOTAL_CHUNKS: Preview Tab → Multi-Platform Comparison${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_10_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [ADAPT] Existing Codebase — Mockup Rendering Functions
The app has per-platform mockup renderers: `_socRenderIGMockup()`, `_socRenderTTMockup()`, `_socRenderTWMockup()`, `_socRenderFBMockup()`, `_socRenderLIMockup()`. Each takes content data and renders a phone-frame mockup into a container element.

## Chunk 10/12: Preview Tab → Multi-Platform Comparison

Depends on: Chunk 9 (for inline preview concept)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat.html` — `#soc-tab-preview` section (source selector, mockup strip)
- `ui/chat/social-panel.js` — `_socInitPreviewTab()`, `_socPreviewLoadSources()`, `_socRenderAllPreviews()`

**Modify:**
- `ui/chat/social-panel.js` — update `_socPreviewLoadSources()` to group drafts by source_content_id. When a repurposed set is selected, show all platform mockups for that set side by side. Add a "Preview All" button on the repurpose context section (Create tab) that navigates to Preview tab with the source pre-selected.
- `ui/chat/social-panel.css` — update `.soc-preview-strip` to use a cleaner horizontal scroll with snap points. Add a header showing "Comparing [N] platforms for: [source title]".

**What to Build:**
The Preview tab becomes a multi-platform comparison view. When you repurpose content to 3 platforms, Preview shows all 3 mockups side by side so you can compare how the same content looks across platforms. A "Preview All" button on the repurpose context panel jumps directly here.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Selecting a repurposed content set shows all platform mockups. "Preview All" from Create tab navigates to Preview with source selected. Mockups scroll horizontally with snap.
CHUNK_10_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_11() {
  local log="$LOG_DIR/chunk-11.log"
  echo -e "${YELLOW}▶ Chunk 11/$TOTAL_CHUNKS: Inline AI Copilot Bar${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_11_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### [REFERENCE] Inline AI Copilot Concept
A small chat input bar docked at the bottom of the social panel. Context-aware — sends current tab + selected draft info as context to the agent. The agent responds through the existing tool/event system. This is NOT a full chat UI — it's a command bar that triggers agent actions.

### [ADAPT] Existing Codebase — Preload Bridge Pattern
```typescript
social: {
  methodName: (...args) => ipcRenderer.invoke('social:channelName', ...args),
  onEventName: (cb) => { ipcRenderer.on('social:event-name', (_, data) => cb(data)); },
}
```

## Chunk 11/12: Inline AI Copilot Bar

Depends on: Chunk 1 (for social panel structure)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat.html` — social panel structure, how main chat input works
- `ui/chat/init.js` — how messages are sent to the agent, `pocketAgent` bridge
- `src/main/preload.ts` — agent messaging methods
- `ui/chat/social-panel.js` — `_socInit()` for event wiring patterns

**Modify:**
- `ui/chat.html` — add `#soc-copilot-bar` at the bottom of `#social-view` (outside tab content, always visible). Contains: small text input, send button, and a response area above the input (auto-scrolls, max-height 150px).
- `ui/chat/social-panel.js` — add `_socInitCopilot()`. On send: collect context (current tab, selected draft if any, current filters). Send to agent via existing `pocketAgent.sendMessage()` with a system prefix like `[Social Panel Context: Create tab, editing TikTok draft #123]`. Display response in the copilot response area. Add quick-action buttons for common commands: "Find trending", "Rewrite this", "Schedule all drafts".
- `ui/chat/social-panel.css` — style `.soc-copilot-bar` (border-top, padding 8px 12px, background var(--bg-secondary), flex column). `.soc-copilot-input` (flex row: input fills space, small send button). `.soc-copilot-response` (max-height 150px, overflow-y auto, font-size 13px, padding 8px, hidden when empty). `.soc-copilot-actions` (flex row, small pill buttons for quick actions).

**What to Build:**
A context-aware chat bar docked at the bottom of the social panel. It knows what tab you're on and what you're working with. Type a command like "make this punchier" and it rewrites the draft you're editing. Quick-action pills for common tasks. Responses appear inline above the input.

**Expected Layout:**
```
┌─ Social Panel ──────────────────────────────────┐
│ [tab bar]                                       │
│ [tab content — scrollable]                      │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ [Copilot response area — scrollable, 150px max] │
│ "Here's a punchier version: ..."                │
├─────────────────────────────────────────────────┤
│ [Find trending] [Rewrite] [Schedule all]        │
│ ┌─────────────────────────────────┐ [Send →]    │
│ │ Ask the copilot...              │             │
│ └─────────────────────────────────┘             │
└─────────────────────────────────────────────────┘
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- For ASCII mockups in "Expected Layout": the layout MUST match the mockup. Element order, hierarchy, and spacing as shown. This is not a suggestion.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Copilot bar visible at bottom of social panel on all tabs. Typing a message and clicking send delivers it to the agent with context. Agent response appears in response area. Quick action buttons trigger appropriate commands.
CHUNK_11_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_12() {
  local log="$LOG_DIR/chunk-12.log"
  echo -e "${YELLOW}▶ Chunk 12/$TOTAL_CHUNKS: Visual Feedback Pass — Progress, Animations, Toasts${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes (Summary)
\`\`\`
$PREV_CONTEXT_STAT
\`\`\`

### Previous Chunk Changes (Code)
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_12_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

(No specific research for this chunk — it builds on all prior chunks.)

## Chunk 12/12: Visual Feedback Pass — Progress, Animations, Toasts

Depends on: Chunks 5, 6, 7 (for media attach, video processing, schedule modal)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — `_socShowToast()`, all places where operations complete (upload, generate, schedule, delete)
- `ui/chat/social-panel.css` — toast styles, existing animation keyframes

**Modify:**
- `ui/chat/social-panel.css` — add progress bar styles (`.soc-progress-bar`, `.soc-progress-fill` with transition width 0.3s), shimmer animation for generating cards (`.soc-draft-card--generating` with pulse/shimmer overlay), success check animation (`.soc-success-check` with scale+fade keyframe), improved toast styles (slide-in from right, auto-dismiss progress bar at bottom of toast).
- `ui/chat/social-panel.js` — update `_socShowToast()` to support types: success (green), error (red), info (blue), with auto-dismiss timer bar. Add shimmer class to draft cards during generation. Add progress bar to media upload (update width based on events). Show green checkmark animation when schedule confirms. Show thumbnail slide-in animation when media attaches.

**What to Build:**
Polish pass for visual feedback across all operations:
1. Media upload: progress bar fills as file copies, then thumbnail slides in
2. Content generation: card has shimmer/pulse overlay, text types in when done
3. Schedule: modal closes with success, checkmark animation, toast slides in from right
4. Errors: red toast with specific message and dismiss button
5. Toast auto-dismiss: thin progress bar at bottom shows remaining time

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Uploading media shows progress bar. Generating content shows shimmer on card. Scheduling shows success animation. Error toasts show red with specific messages. All toasts auto-dismiss with visible timer.
CHUNK_12_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

# ══════════════════════════════════════════════════════
# MAIN LOOP
# ══════════════════════════════════════════════════════

CHUNK_FUNCTIONS=( run_chunk_1 run_chunk_2 run_chunk_3 run_chunk_4 run_chunk_5 run_chunk_6 run_chunk_7 run_chunk_8 run_chunk_9 run_chunk_10 run_chunk_11 run_chunk_12 )
CHUNK_NAMES=( "Tab Bar Consolidation" "Accounts Modal" "Gallery Sub-Tab" "Create Tab Merge" "Media Attachment" "Video Decouple" "Schedule Modal" "Calendar Merge" "Inline Preview" "Multi-Platform Preview" "Copilot Bar" "Visual Feedback" )

for i in "${!CHUNK_FUNCTIONS[@]}"; do
  num=$((i + 1))

  if [[ "$num" -lt "$START_CHUNK" ]]; then
    echo -e "${YELLOW}  Skipping chunk $num (${CHUNK_NAMES[$i]})${NC}"
    continue
  fi

  ${CHUNK_FUNCTIONS[$i]}
  run_quality_gate "$num"
  auto_commit "$num" "${CHUNK_NAMES[$i]}"
  capture_context

  ((CHUNKS_SINCE_CLEANUP++)) || true
  if [[ "$CLEANUP_EVERY" -gt 0 && "$CHUNKS_SINCE_CLEANUP" -ge "$CLEANUP_EVERY" ]]; then
    run_cleanup
    CHUNKS_SINCE_CLEANUP=0
  fi

  echo ""
done

echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  All chunks complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"

if [[ "$SKIP_FINAL_CHECK" != "true" ]]; then
  echo -e "${BLUE}Running final quality checks...${NC}"
  cd "$PROJECT_DIR"
  if eval "$CHECK_CMD"; then
    echo -e "${GREEN}✓ All checks passed${NC}"
  else
    echo -e "${RED}✗ Final checks failed — fix before committing${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}Done! Review changes: git diff${NC}"
