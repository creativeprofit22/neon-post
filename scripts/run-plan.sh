#!/bin/bash
set -eo pipefail

PROJECT_DIR="/mnt/e/Projects/neon-post"
LOG_DIR="$PROJECT_DIR/.claude/logs"
CHECK_CMD="npm run typecheck && npm run lint"
FEATURE_NAME="Flow Audit Fixes — Social Panel"
TOTAL_CHUNKS=13

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
# CHUNK FUNCTIONS
# ══════════════════════════════════════════════════════

run_chunk_1() {
  local log="$LOG_DIR/chunk-1.log"
  echo -e "${YELLOW}▶ Chunk 1/$TOTAL_CHUNKS: Preview Tab Source Fix${NC}"

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
Do NOT modify these files unless they are in YOUR file lists. Review this diff to understand what was already built — do NOT duplicate or contradict it."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_1_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Audit Correction
B2 (getPosts not exposed): Actually a naming mismatch — listPosts IS exposed in preload.ts:263, but Preview tab calls getPosts() which does not exist.

## Chunk 1/13: Preview Tab Source Fix (B2)

Depends on: None

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` (lines 5160-5310) — Preview tab source loader and change handler that calls getPosts()
- `src/main/preload.ts` (lines 260-270) — Verify listPosts signature: listPosts(status?: string): Promise<Array<Record<string, unknown>>>

**Modify:**
- `ui/chat/social-panel.js` — Replace getPosts with listPosts at lines 5170, 5273, 5275, 5282, 5283

**What to Build:**
Find-and-replace all social.getPosts calls to social.listPosts in the Preview tab section of social-panel.js. The preload exposes listPosts(status?: string) which returns Promise<Array<Record<string, unknown>>>. The Preview tab currently passes a number (50 or 100) as the argument — listPosts takes an optional status string filter, not a limit. Change to listPosts() with no args (returns all). There are 5 occurrences at lines 5170, 5273, 5275, 5282, 5283.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. All social.getPosts replaced with social.listPosts. Arguments changed from numbers to no args or status strings.
CHUNK_1_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_2() {
  local log="$LOG_DIR/chunk-2.log"
  echo -e "${YELLOW}▶ Chunk 2/$TOTAL_CHUNKS: Define _socReceiveGeneratedContent${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_2_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 2/13: Define _socReceiveGeneratedContent (MF1)

Depends on: None

**Read these files first:**
- `ui/chat/init.js` (lines 130-145) — Where _socReceiveGeneratedContent(data.drafts) is called in onRepurposeCompleted callback
- `ui/chat/social-panel.js` (lines 1-30) — Module-level variables and structure
- `ui/chat/social-panel.js` (lines 2653-2700) — _socLoadDrafts() function pattern

**Modify:**
- `ui/chat/social-panel.js` — Add _socReceiveGeneratedContent(drafts) function in global scope

**What to Build:**
Define _socReceiveGeneratedContent(drafts) in social-panel.js so agent-generated repurposed drafts auto-appear in the Create tab. The function is called from init.js line 136 inside the onRepurposeCompleted event handler.

The function should:
1. Invalidate _socDraftsCache = null so next load fetches fresh data
2. Call _socLoadDrafts() to refresh the drafts list (this function already exists in social-panel.js)
3. Show a toast: 'Agent created ' + drafts.length + ' draft(s)' with type 'success' using _socShowToast()

Place the function after line 22 (after the module-level variable declarations), before the first section comment. It MUST be in global scope (not inside _socInitSocialPanel) since init.js calls it as a global function with typeof check.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. Function _socReceiveGeneratedContent exists in global scope. It invalidates drafts cache and shows toast.
CHUNK_2_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_3() {
  local log="$LOG_DIR/chunk-3.log"
  echo -e "${YELLOW}▶ Chunk 3/$TOTAL_CHUNKS: Image Generation Notification${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_3_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 3/13: Image Generation Notification (D1, SI3)

Depends on: None

**Read these files first:**
- `ui/chat/social-panel.js` (lines 1462-1519) — Image panel generate button handler; shows result inline on success but no cross-panel notification
- `ui/chat/social-panel.js` (lines 4072-4200) — Gallery rendering, _socLoadGallery()

**Modify:**
- `ui/chat/social-panel.js` — Add notification when image generation completes on the Image panel

**What to Build:**
The Image panel already shows the generated image inline when generation completes. The problem is when the user navigates to another tab while waiting — they never learn the image is ready.

In the .then() callback of the generate image handler (around line 1500), after the existing success handling:
1. Set _socGalleryCache = null to invalidate the gallery cache so it shows the new image
2. Check if the Gallery sub-tab is NOT currently active (check if the discover view 'gallery' sub-tab has class 'active'). If not active, show a toast with an action link.
3. The toast should use _socShowToast but with a custom approach: after calling _socShowToast('Image generated!', 'success'), also create an actionable version. The simplest approach: use the existing _socShowToast for the message, and separately check if a function _socSwitchDiscoverView exists to enable navigation.

Actually, the simplest correct approach: In the .then() success path, add:
- _socGalleryCache = null;
- Check if the current active discover sub-tab is NOT 'gallery': var galleryTab = root.querySelector('.soc-discover-sub-tab[data-discover-view="gallery"].active'); if (!galleryTab) { _socShowToast('Image ready — check Gallery tab', 'success'); }

This is a minimal change that gives the user feedback regardless of which tab they are on.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. Image generation success path invalidates _socGalleryCache and shows toast when user is not on Gallery tab.
CHUNK_3_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_4() {
  local log="$LOG_DIR/chunk-4.log"
  echo -e "${YELLOW}▶ Chunk 4/$TOTAL_CHUNKS: Navigation Toasts${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_4_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 4/13: Navigation Toasts (DE1, DE2)

Depends on: None

**Read these files first:**
- `ui/chat/social-panel.js` (lines 4368-4407) — saveDiscovered() success handler, currently shows plain toast 'Content saved to library'
- `ui/chat/social-panel.js` (lines 160-223) — Toast system: _socShowToast() and _socShowScheduleSuccessToast()
- `ui/chat/social-panel.js` (lines 196-223) — _socShowScheduleSuccessToast custom toast with countdown timer

**Modify:**
- `ui/chat/social-panel.js` — Add action links to save toast and schedule toast

**What to Build:**

1. **Create _socShowActionToast helper**: A new function similar to _socShowToast but with an additional clickable action link. Signature: _socShowActionToast(message, type, actionLabel, actionFn). It should:
   - Create a toast element like _socShowToast does (same container, same CSS classes)
   - Add an action link/button after the message: <a class="soc-toast__action" href="#">actionLabel</a>
   - Clicking the action calls actionFn() and removes the toast
   - Include the same dismiss button and timer bar as regular toasts

2. **DE1 — Save content toast**: In saveDiscovered() success handler (line 4398), replace:
   _socShowToast('Content saved to library', 'success')
   with:
   _socShowActionToast('Saved to library', 'success', 'View \u2192', function() {
     // Switch to Saved discover sub-tab
     var root = document.getElementById('social-view');
     if (!root) return;
     root.querySelectorAll('.soc-discover-sub-tab').forEach(function(t) { t.classList.remove('active'); });
     root.querySelectorAll('.soc-discover-view').forEach(function(v) { v.classList.remove('active'); });
     var savedBtn = root.querySelector('.soc-discover-sub-tab[data-discover-view="saved"]');
     var savedView = root.querySelector('#soc-discover-view-saved');
     if (savedBtn) savedBtn.classList.add('active');
     if (savedView) savedView.classList.add('active');
     _socLoadSaved();
   });

3. **DE2 — Schedule success toast**: In _socShowScheduleSuccessToast() (around line 196), add a "View in Calendar" link to the existing custom toast HTML. Add a clickable element that:
   - Switches to Calendar tab by clicking the calendar tab button
   - Initializes calendar if not yet initialized
   The existing toast already has custom HTML — just add an <a> element inside it.

**CSS for action link** — add to social-panel.css:
.soc-toast__action {
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  margin-left: 8px;
  font-weight: 600;
  opacity: 0.9;
}
.soc-toast__action:hover { opacity: 1; }

**Expected Layout:**
Toast with save: [ check-icon  Saved to library   View ->   x ]
Toast with schedule: [ calendar-icon  Scheduled for Apr 5...  \n  View in Calendar ->   x ]

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. Save content shows toast with "View" action link. Schedule shows toast with "View in Calendar" link. Clicking each link navigates to the correct tab/view.
CHUNK_4_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_5() {
  local log="$LOG_DIR/chunk-5.log"
  echo -e "${YELLOW}▶ Chunk 5/$TOTAL_CHUNKS: Trend Card Actions${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_5_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 5/13: Trend Card Actions (D2, DE3)

Depends on: None

**Read these files first:**
- `ui/chat/social-panel.js` (lines 2421-2476) — Trend card rendering, the HTML template with dismiss button
- `ui/chat/social-panel.js` (lines 1167-1260) — Generate panel initialization and tab-switching logic
- `ui/chat/chat.html` (lines 1167-1210) — Generate panel HTML: #soc-create-prompt, #soc-create-platform, #soc-create-content-type

**Modify:**
- `ui/chat/social-panel.js` — Add "Create" button to trend cards; add handler in socPanelActions

**What to Build:**
Add a "Create" button next to the existing dismiss button in trend card header. In the trend card HTML template (around line 2461), add a button before the dismiss button:

<button class="soc-trend-create" onclick="event.stopPropagation(); socPanelActions.createFromTrend(this)" title="Create content from this trend">
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14"/></svg>
</button>

Add createFromTrend(btn) to socPanelActions object. The handler should:
1. Find the parent .soc-trend-card element
2. Extract: topic from .soc-trend-card__topic textContent, platform from .soc-trend-platform textContent, keywords from .soc-trend-card__keywords spans
3. Switch to Create tab > Generate sub-panel:
   - Click the Create tab button: root.querySelector('.soc-tab-btn[data-tab="create"]').click()
   - Click the Generate sub-tab: root.querySelector('.soc-sub-tab[data-panel="generate"]').click()
   - Or manually toggle classes if click() does not trigger handlers
4. Pre-fill #soc-create-prompt with: "Create a " + platform + " post about: " + topic + (keywords ? ". Keywords: " + keywords : "")
5. Set #soc-create-platform dropdown to the trend's platform value
6. Focus the prompt textarea

**Expected Layout:**
Trend card header: [Status badge] [Score] [Create +] [Dismiss x]

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. Trend card shows Create button. Clicking it navigates to Create > Generate with prompt pre-filled and platform set.
CHUNK_5_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_6() {
  local log="$LOG_DIR/chunk-6.log"
  echo -e "${YELLOW}▶ Chunk 6/$TOTAL_CHUNKS: Gallery Copy URL${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_6_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 6/13: Gallery Use in Post — Copy URL (DE4)

Depends on: None

**Read these files first:**
- `ui/chat/social-panel.js` (lines 4149-4175) — Gallery item card rendering with action buttons (download, favorite, delete)
- `ui/chat/social-panel.js` (lines 4332-4400) — Lightbox content rendering with action buttons

**Modify:**
- `ui/chat/social-panel.js` — Add "Copy URL" button to gallery image cards and lightbox

**What to Build:**
Add a copy-URL button so users can use gallery images in posts.

1. **Gallery image cards** (around line 4161, in the soc-gallery-item-actions div): Add a "Copy URL" button BEFORE the download button, only for image-type items (where isImage is true). Use the same soc-icon-btn class pattern:
   '<button class="soc-icon-btn" onclick="socPanelActions.copyImageUrl(\'' + _socEscapeHtml(imageUrl) + '\')" title="Copy URL">' +
     '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
   '</button>'

2. **Lightbox** (in the lightbox action buttons area): Add a similar "Copy URL" button alongside download/favorite/delete.

3. **Add copyImageUrl handler** to socPanelActions:
   copyImageUrl(url) {
     if (!url) return;
     navigator.clipboard.writeText(url)
       .then(function() { _socShowToast('Image URL copied!', 'success'); })
       .catch(function() { _socShowToast('Copy failed', 'error'); });
   },

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. Gallery image cards show copy-URL icon button. Lightbox shows copy-URL button. Clicking copies URL to clipboard with success toast.
CHUNK_6_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_7() {
  local log="$LOG_DIR/chunk-7.log"
  echo -e "${YELLOW}▶ Chunk 7/$TOTAL_CHUNKS: Button Loading States${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_7_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 7/13: Button Loading States (SI5, SI6, SI7, SI4)

Depends on: None

**Read these files first:**
- `ui/chat/social-panel.js` (lines 2108-2140) — _socDiscoverSearch() function, no button disabled state
- `ui/chat/social-panel.js` (lines 1245-1270) — Search button event listener setup, find the variable name for the search button
- `ui/chat/social-panel.js` (lines 4368-4407) — saveDiscovered() handler, no button disabled state
- `ui/chat/social-panel.js` (lines 311-378) — _socScheduleModalConfirm(), no confirm button disabled state
- `ui/chat/social-panel.js` (lines 3767-3800) — Calendar drag-reschedule handler

**Modify:**
- `ui/chat/social-panel.js` — Add disabled state to 4 buttons/actions

**What to Build:**
Add loading/disabled states to prevent double-clicks and show activity:

1. **Search button (SI5)**: In _socDiscoverSearch() (line 2108), find the search button via root.querySelector (it should be the element stored as discoverSearchBtn during init). At start of function: set discoverSearchBtn.disabled = true. In .finally() of the searchContent promise: set discoverSearchBtn.disabled = false. The button variable may not be accessible — if so, find it via root.querySelector('#soc-discover-search-btn') or similar selector at the top of the function.

2. **Save button (SI6)**: In saveDiscovered() (line 4368), the function receives an id. The save button is on a card. Find the button that triggered the save — this may need to be passed as parameter or found via DOM. Simplest approach: at the start of saveDiscovered, find all save buttons matching this id and disable them. In .finally(), re-enable. Alternative: add a flag _socSaveInProgress to prevent concurrent saves.

3. **Schedule confirm (SI7)**: In _socScheduleModalConfirm() (line 311), get confirmBtn = document.getElementById('soc-schedule-confirm'). At start: confirmBtn.disabled = true, save original text, set textContent to 'Scheduling...'. In .then()/.catch()/.finally() of each mode branch: restore text, re-enable.

4. **Calendar drag-reschedule (SI4)**: In the drag-drop handler (around line 3767), add a CSS class 'soc-reschedule-loading' to the dragged post element at start of the API call. Remove it in .finally(). The CSS for this class: opacity: 0.5; pointer-events: none;

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. Search button disables during search. Save button prevents double-click. Schedule confirm shows "Scheduling..." and disables. Calendar post shows loading opacity during reschedule API call.
CHUNK_7_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_8() {
  local log="$LOG_DIR/chunk-8.log"
  echo -e "${YELLOW}▶ Chunk 8/$TOTAL_CHUNKS: Silent Error Fixes${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_8_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 8/13: Silent Error Fixes (SI8, SI9, SI10, SI11)

Depends on: None

**Read these files first:**
- `ui/chat/social-panel.js` (lines 4717-4733) — openLightbox with .catch(() => {})
- `ui/chat/social-panel.js` (lines 2370-2390) — Auto-detect trends failure handling
- `ui/chat/social-panel.js` (lines 940-960) — Regenerate draft error handling
- `ui/chat/social-panel.js` (lines 4745-4760) — Copy draft to clipboard

**Modify:**
- `ui/chat/social-panel.js` — Replace 4 silent failure patterns with user-facing toasts

**What to Build:**
Fix 4 silent error patterns:

1. **SI8 (Lightbox open)**: Find the .catch(() => {}) in openLightbox (around line 4733). Replace with:
   .catch(function() { _socShowToast('Failed to load gallery', 'error'); })

2. **SI9 (Auto-detect trends)**: Find the catch block in the trends auto-detect function (around line 2380) that only does console.error. After the console.error line, add:
   _socShowToast('Trend detection unavailable', 'error');

3. **SI10 (Regenerate draft error)**: Find where a draft regeneration error is written directly into a textarea as if it were content (around line 950-955). This is confusing because the user sees the error message as if it is generated content. Change to: keep the textarea value unchanged (or clear it), and show an error toast instead:
   _socShowToast('Regeneration failed — try again', 'error');

4. **SI11 (Copy clipboard)**: Find the clipboard.writeText().then() call that has no .catch() (around line 4755). Add:
   .catch(function() { _socShowToast('Copy failed — check permissions', 'error'); })

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. No .catch(() => {}) empty catch blocks remain in social-panel.js. All 4 error paths now show user-facing toasts via _socShowToast.
CHUNK_8_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_9() {
  local log="$LOG_DIR/chunk-9.log"
  echo -e "${YELLOW}▶ Chunk 9/$TOTAL_CHUNKS: Cache Invalidation${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_9_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 9/13: Cache Invalidation (S1-S6)

Depends on: None

**Read these files first:**
- `ui/chat/social-panel.js` (lines 1-22) — Cache variable declarations (_socDiscoverCache, _socSavedCache, _socTrendsCache, _socGalleryCache, _socTrendsLastDetect, _socDraftsCache, _socCalendarInitialized)
- `ui/chat/social-panel.js` — Search for _socCalendarRenderCurrentView to find the calendar render function
- `ui/chat/social-panel.js` — Search for onPostChanged to find where post change events are handled
- `ui/chat/social-panel.js` — Search for onContentChanged or contentChanged to find content change event handling
- `ui/chat/social-panel.js` — Search for deleteGenerated to find gallery delete handler
- `ui/chat/social-panel.js` — Search for _socLoadTrends or detectTrends to find trends loading
- `ui/chat/social-panel.js` (line 2653) — _socDraftsCache and drafts filter

**Modify:**
- `ui/chat/social-panel.js` — Add cache invalidation at 6 points

**What to Build:**
Fix 6 stale cache issues:

1. **S1 (Calendar stale after post edit/delete)**: Find where onPostChanged event is handled. In that handler, add: if (_socCalendarInitialized) _socCalendarRenderCurrentView(); — This ensures calendar re-renders when posts are modified from other views.

2. **S2 (Discover cache stale)**: Add a new variable _socDiscoverCacheTime = 0 after _socDiscoverCache. When setting _socDiscoverCache in _socDiscoverSearch, also set _socDiscoverCacheTime = Date.now(). When the Search sub-tab is activated (in the sub-tab click handler), check: if (_socDiscoverCache && Date.now() - _socDiscoverCacheTime > 300000) { _socDiscoverCache = null; _socLoadDiscovered(); }

3. **S3 (Saved cache external delete)**: Find where social:contentChanged event is listened to. In that handler, add: _socSavedCache = null; Then check if the Saved sub-tab is currently active and if so call _socLoadSaved().

4. **S4 (Gallery cache after delete)**: In the deleteGenerated handler (in socPanelActions), after the successful delete API call, also filter the cache: if (_socGalleryCache) { _socGalleryCache = _socGalleryCache.filter(function(i) { return i.id !== id; }); }

5. **S5 (Trends cache TTL)**: _socTrendsLastDetect already exists (line 12) but is never used. When the Trends sub-tab loads or is activated, check: if (!_socTrendsCache || Date.now() - _socTrendsLastDetect > 300000). If stale, call detectTrends. After successful detection, set _socTrendsLastDetect = Date.now().

6. **S6 (Drafts filter persistence)**: Add a new variable _socDraftsFilterValue = '' at the top of the file. When the drafts filter dropdown changes, save the value: _socDraftsFilterValue = select.value. When returning to the Create tab, restore: if (filterEl) filterEl.value = _socDraftsFilterValue.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. Post changes trigger calendar re-render. Gallery delete updates cache in-place. Trends auto-refresh after 5 min. Drafts filter value persists across tab switches.
CHUNK_9_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_10() {
  local log="$LOG_DIR/chunk-10.log"
  echo -e "${YELLOW}▶ Chunk 10/$TOTAL_CHUNKS: State Reset & Cleanup${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_10_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 10/13: State Reset & Cleanup (OW2, OW3, OW5)

Depends on: Chunk 9 (for _socDraftsFilterValue variable added in S6)

**Read these files first:**
- `ui/chat/social-panel.js` (lines 14-20) — _socSelectMode, _socSelectedIds variables
- `ui/chat/social-panel.js` — Search for soc-discover-sub-tab click handler to find where sub-tab switching happens
- `ui/chat/social-panel.js` — Search for soc-gallery-select-toolbar to find the selection toolbar element
- `ui/chat/social-panel.js` (lines 1289-1321) — Repurpose context card (soc-drafts-repurpose-ctx)
- `ui/chat/social-panel.js` — Search for soc-drafts-repurpose-ctx dismiss or close to find the dismiss handler

**Modify:**
- `ui/chat/social-panel.js` — Add state resets on tab/sub-tab switches

**What to Build:**
Fix 3 state management issues:

1. **OW2 (Gallery select mode persists across tab switches)**: Find the discover sub-tab click handler (where .soc-discover-sub-tab elements are clicked). When switching AWAY from gallery (i.e., the newly clicked tab is NOT 'gallery'), add:
   _socSelectMode = false;
   _socSelectedIds.clear();
   var toolbar = root.querySelector('#soc-gallery-select-toolbar');
   if (toolbar) toolbar.style.display = 'none';
   var toggleBtn = root.querySelector('#soc-gallery-select-toggle');
   if (toggleBtn) toggleBtn.classList.remove('active');
   root.querySelectorAll('.soc-gallery-item.selected').forEach(function(el) { el.classList.remove('selected'); });

2. **OW3 (Repurpose context stale data)**: Find the dismiss/close handler for the repurpose context card (#soc-drafts-repurpose-ctx). When dismissed, also:
   var ctx = root.querySelector('#soc-drafts-repurpose-ctx');
   if (ctx) delete ctx.dataset.sourceId;
   Clear any pre-filled platform checkboxes in #soc-drafts-repurpose-platforms.

3. **OW5 (Drafts filter lost)**: A variable _socDraftsFilterValue should already exist from chunk 9. In the main tab switcher (where .soc-tab-btn elements are clicked), when switching TO the create tab, restore the filter:
   var filterEl = root.querySelector('#soc-drafts-filter');
   if (filterEl && _socDraftsFilterValue) filterEl.value = _socDraftsFilterValue;
   If _socDraftsFilterValue does not exist yet (chunk 9 not applied), add it: let _socDraftsFilterValue = '';

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- If _socDraftsFilterValue variable already exists from a previous chunk, do NOT re-declare it.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. Gallery select mode resets on sub-tab switch. Repurpose context clears data-source-id on dismiss. Drafts filter value restores on tab return.
CHUNK_10_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_11() {
  local log="$LOG_DIR/chunk-11.log"
  echo -e "${YELLOW}▶ Chunk 11/$TOTAL_CHUNKS: Empty States${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_11_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 11/13: Empty States (E1, E2, E3, E4)

Depends on: None

**Read these files first:**
- `ui/chat/chat.html` (lines 1040-1060) — #soc-discover-view-search container and #soc-discover-results
- `ui/chat/chat.html` (lines 1195-1210) — #soc-create-output container with placeholder text "Generated content will appear here"
- `ui/chat/chat.html` (lines 1275-1290) — #soc-image-output with soc-image-placeholder div
- `ui/chat/chat.html` (lines 1440-1465) — #soc-preview-strip container
- `ui/chat/social-panel.css` — Search for "placeholder" or "empty" to find existing empty state styles

**Modify:**
- `ui/chat/chat.html` — Update 4 empty state containers with guidance content
- `ui/chat/social-panel.css` — Add soc-empty-state class styles

**What to Build:**
Replace blank/minimal placeholders with helpful guidance:

1. **E1 — Search empty state**: In #soc-discover-view-search, add a default empty state div INSIDE #soc-discover-results (this will be replaced when search runs):
   <div class="soc-empty-state">
     <div class="soc-empty-state__icon">&#x1F50D;</div>
     <div class="soc-empty-state__title">Discover Content</div>
     <div class="soc-empty-state__hint">Search TikTok, Instagram, YouTube for trending posts and creators</div>
     <div class="soc-empty-state__examples">Try: "fitness trends" or "@creatorname"</div>
   </div>

2. **E2 — Generate empty state**: Replace the text "Generated content will appear here" inside #soc-create-output:
   <div class="soc-empty-state">
     <div class="soc-empty-state__icon">&#x2728;</div>
     <div class="soc-empty-state__title">Generate Content</div>
     <div class="soc-empty-state__hint">Pick a content type and platform, describe your topic, then click Generate</div>
   </div>

3. **E3 — Image empty state**: Replace the soc-image-placeholder div content inside #soc-image-output:
   <div class="soc-empty-state">
     <div class="soc-empty-state__icon">&#x1F3A8;</div>
     <div class="soc-empty-state__title">AI Image Generation</div>
     <div class="soc-empty-state__hint">Describe the image you want and click Generate. Takes ~30-60 seconds.</div>
   </div>

4. **E4 — Preview empty state**: Add inside #soc-preview-strip as default content (will be replaced by mockups):
   <div class="soc-empty-state soc-empty-state--wide">
     <div class="soc-empty-state__icon">&#x1F441;</div>
     <div class="soc-empty-state__title">Preview Posts</div>
     <div class="soc-empty-state__hint">Select a draft above or paste content to see how it looks on each platform</div>
   </div>

**CSS to add** in social-panel.css:
.soc-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--text-secondary, #888);
}
.soc-empty-state__icon {
  font-size: 32px;
  margin-bottom: 12px;
  opacity: 0.6;
}
.soc-empty-state__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #ccc);
  margin-bottom: 8px;
}
.soc-empty-state__hint {
  font-size: 13px;
  line-height: 1.5;
  max-width: 280px;
}
.soc-empty-state__examples {
  font-size: 12px;
  margin-top: 12px;
  opacity: 0.7;
  font-style: italic;
}
.soc-empty-state--wide {
  grid-column: 1 / -1;
}

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- Do NOT add emojis via emoji characters — use HTML entities (&#x1F50D; etc.) as shown above.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. All 4 views show centered guidance text with icon when empty. The empty states are replaced when content loads.
CHUNK_11_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_12() {
  local log="$LOG_DIR/chunk-12.log"
  echo -e "${YELLOW}▶ Chunk 12/$TOTAL_CHUNKS: Label Polish${NC}"

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
Do NOT modify these files unless they are in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_12_PROMPT'
neon-post at /mnt/e/Projects/neon-post
Stack: Electron 40 + TypeScript 5.9 + SQLite, Vanilla JS UI, npm
Check: npm run typecheck && npm run lint

## Chunk 12/13: Label Polish (C2-C7)

Depends on: None

**Read these files first:**
- `ui/chat/chat.html` (lines 1000-1010) — Main tab buttons with labels
- `ui/chat/chat.html` (lines 1085-1101) — Gallery filter option elements
- `ui/chat/chat.html` (lines 1165-1175) — Create sub-tab labels
- `ui/chat/chat.html` (lines 1545-1550) — "Scraping API Keys" section label and hint
- `ui/chat/social-panel.js` — Search for text strings "Content", "Repurpose", "Preview" to check if any JS matches on label text content (important: data-tab attribute values must NOT change)

**Modify:**
- `ui/chat/chat.html` — Update 6 visible label texts

**What to Build:**
Update labels for clarity. ONLY change visible text — do NOT change data-tab, data-panel, id, or value attributes.

1. **C2**: Find the tab button with data-tab="content-browse". Change its visible text from the current label (contains "Content") to use "Discover" instead. Keep the emoji prefix if one exists.

2. **C3**: Find the sub-tab button with data-panel="repurpose". Change visible text from "Repurpose" to "Adapt".

3. **C4**: Find the gallery type filter select (#soc-gallery-type-filter). Change option LABELS only (not values):
   - option value="hook": change label from "Hook" to "Opening Hook"
   - option value="thread": change label from "Thread" to "Thread / Carousel"
   - option value="image_prompt": change label from "Image Prompt" to "Image Prompt Desc."

4. **C5**: Find "Scraping API Keys" span (soc-section-title). Change to "Content Discovery API Keys". Change the hint paragraph after it to: "API keys for discovering trending content on TikTok, Instagram, and other platforms."

5. **C6**: Find the tab button with data-tab="preview". Change its visible text to include "Posts" — e.g., if current is "Preview", change to "Preview Posts". Keep emoji prefix if one exists.

6. **C7**: No label change needed here — this was about adding a hint in the multi-platform video flow. SKIP this one as it requires reading additional code not in the file list.

**CRITICAL**: Verify that NO JavaScript code in social-panel.js matches on the old label text content. If any JS uses textContent or innerHTML matching on these labels, those references must also be updated. Check by searching for the old text strings.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- Do NOT change any data-tab, data-panel, id, value, or class attributes.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** npm run typecheck && npm run lint passes. Tab labels show updated text. Tab switching still works. Gallery filter still functions. All data attributes unchanged.
CHUNK_12_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_13() {
  local log="$LOG_DIR/chunk-13.log"
  echo -e "${YELLOW}▶ Chunk 13/$TOTAL_CHUNKS: Agent/UI Parity Backlog${NC}"

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
\`\`\`"
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 20 \
    -p "$(cat <<'CHUNK_13_PROMPT'
neon-post at /mnt/e/Projects/neon-post

## Chunk 13/13: Agent/UI Asymmetry Tracker

**Read these files first:**
- `reports/flow-audit-2026-04-01.md` — The ASYMMETRIC section (A1-A8), ONE-WAY section (OW4), and DUPLICATE-PATH section (DP1-DP2)

**Create:**
- `reports/agent-ui-parity-backlog.md` — Backlog document

**What to Build:**
Create a tracking document at reports/agent-ui-parity-backlog.md listing all agent/UI asymmetries from the flow audit that require new tool implementations (too large for this sprint). Format:

# Agent/UI Parity Backlog

Source: reports/flow-audit-2026-04-01.md
Date: 2026-04-01

## Agent Tools Missing (UI exists, agent cannot do it)

| ID | Tool Needed | What It Does | Priority | Effort |
|----|-------------|-------------|----------|--------|
| A1 | reschedule_post | Move a scheduled post to a new date/time | High | Small |
| A1 | delete_post | Delete a draft or scheduled post | High | Small |
| A2 | browse_gallery | List/search generated images for use in posts | Medium | Small |
| A3 | add_account | Add a new social media account | Low | Medium |
| A3 | update_account | Update account credentials | Low | Medium |
| A3 | remove_account | Remove a social media account | Low | Small |
| A8 | edit_draft | Modify content/platform of an existing draft | High | Small |

## UI Missing (Agent can do it, no UI equivalent)

| ID | Agent Tool | What It Does | Priority | Effort |
|----|-----------|-------------|----------|--------|
| A4 | scrape_profile | Scrape a creator profile for content ideas | Medium | Medium |
| A4 | get_trending | Fetch trending content from a platform | Medium | Medium |
| A5 | reply_to_comment | Reply to comments on published posts | Low | Large |
| A5 | flag_comment | Flag inappropriate comments | Low | Medium |
| A6 | download_video | Download a video from URL | Low | Small |
| A6 | process_video | Process video for platform requirements | Low | Medium |
| A7 | analyze_trends | Run trend analysis on saved content | Medium | Medium |

## UX Improvements Deferred

| ID | Issue | Description | Priority |
|----|-------|------------|----------|
| OW4 | Saved batch selection UX | Selection cleared on mode toggle; cannot review selections | Low |
| DP1 | Duplicate repurpose paths | Saved card Repurpose button vs inline form — different feedback, different result location | Medium |
| DP2 | Batch vs inline repurpose | Inline shows per-item results; batch shows grouped — consolidate into one clear flow | Medium |

**Rules:**
- Read ONLY the file listed above.
- Create ONLY the file listed above.
- Do NOT modify any code files.
- Do NOT ask questions.

**Gate:** reports/agent-ui-parity-backlog.md exists with all items documented.
CHUNK_13_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

# ══════════════════════════════════════════════════════
# MAIN LOOP
# ══════════════════════════════════════════════════════

CHUNK_FUNCTIONS=(
  run_chunk_1 run_chunk_2 run_chunk_3 run_chunk_4
  run_chunk_5 run_chunk_6 run_chunk_7 run_chunk_8
  run_chunk_9 run_chunk_10 run_chunk_11 run_chunk_12
  run_chunk_13
)
CHUNK_NAMES=(
  "Preview Tab Source Fix"
  "Define _socReceiveGeneratedContent"
  "Image Generation Notification"
  "Navigation Toasts"
  "Trend Card Actions"
  "Gallery Copy URL"
  "Button Loading States"
  "Silent Error Fixes"
  "Cache Invalidation"
  "State Reset & Cleanup"
  "Empty States"
  "Label Polish"
  "Agent/UI Parity Backlog"
)

for i in "${!CHUNK_FUNCTIONS[@]}"; do
  num=$((i + 1))

  if [[ "$num" -lt "$START_CHUNK" ]]; then
    echo -e "${YELLOW}  Skipping chunk $num${NC}"
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
