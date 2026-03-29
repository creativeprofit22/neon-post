#!/bin/bash
set -eo pipefail

PROJECT_DIR="/mnt/e/Projects/neon-post"
LOG_DIR="$PROJECT_DIR/.claude/logs"
CHECK_CMD="npm run typecheck && npm run lint"
FEATURE_NAME="Image Pipeline UX"
TOTAL_CHUNKS=10

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
CHUNKS_SINCE_CLEANUP=0

capture_context() {
  cd "$PROJECT_DIR"
  PREV_CONTEXT=$(git diff --stat HEAD 2>/dev/null || echo "")
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
      echo -e "${RED}  ✗ Still failing — continuing anyway${NC}"
      return 1
    fi
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
# CHUNK FUNCTIONS — one per chunk, prompt baked in as heredoc
# ══════════════════════════════════════════════════════

run_chunk_1() {
  local log="$LOG_DIR/chunk-1.log"
  echo -e "${YELLOW}▶ Chunk 1/$TOTAL_CHUNKS: Auto-Download Images on Completion${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_1_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Existing download logic (misc-ipc.ts)
`app:openImage` handler downloads remote URLs to `Documents/Neon-post/media/` as `img-{timestamp}.{ext}`. Uses `fs.createWriteStream` with `https.get`. Can reuse this pattern for auto-download.

### Streaming bubble pattern (message-renderer.js)
Temporary elements inserted before `.status-indicator` via `insertBefore()`. Tracked in Maps by sessionId. Replaced/removed when final content arrives. Uses RAF throttling for updates.

### Gallery existing actions
- `social:getGenerated(limit?)` — fetch all
- `social:deleteGenerated(id)` — delete one
- `social:favoriteGenerated(id, rating)` — toggle favorite
- `socPanelActions.openLightbox(id)` — modal view
- No download, no bulk ops, no filtering, no stats

### DB methods available
`generatedContent.create()`, `.getAll()`, `.getById()`, `.update()`, `.delete()`, `.getByType()`, `.getByPlatform()`, `.getTopRated()`, `.getUnused()`

### Media directory
Hardcoded: `path.join(app.getPath('documents'), 'Neon-post', 'media')` in misc-ipc.ts

### CSS patterns
Gallery: `.soc-gallery-item`, `.soc-gallery-item-media`, `.soc-gallery-item-footer`, `.soc-gallery-item-actions`
Chat: `.message.assistant.generated-image-bubble`, `.status-indicator`, `.streaming-bubble`
Status: shimmer animation, pixel cat spinner, state-specific color themes

## Chunk 1/10: Auto-Download Images on Completion

**Read these files first** (do NOT explore beyond this list):
- `src/main/ipc/misc-ipc.ts` — existing download pattern in `app:openImage` handler (https.get + createWriteStream)
- `src/image/job-tracker.ts` — `saveToGallery()` method where we add download call
- `src/memory/generated-content.ts` — `update()` method signature to update media_url to local path

**Modify:**
- `src/image/job-tracker.ts` — after saveToGallery succeeds, download image to media dir and update DB record's media_url to local path

**What to Build:**
After `saveToGallery()` saves the record, download the remote image URL to `Documents/Neon-post/media/img-{timestamp}.{ext}` using the same https download pattern from misc-ipc.ts. Then call `this.memory.generatedContent.update(recordId, { media_url: localPath })` to persist the local path. This ensures images survive temp URL expiration. Do this async — don't block the event emission.

**Code to Adapt:**
From misc-ipc.ts `app:openImage`:
```typescript
const ext = src.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
const filename = `img-${Date.now()}.${ext}`;
const filePath = path.join(mediaDir, filename);
const file = fs.createWriteStream(filePath);
https.get(url, (res) => { res.pipe(file); file.on('finish', () => file.close()); });
```

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Generated images have local file paths in media_url after completion.
CHUNK_1_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_2() {
  local log="$LOG_DIR/chunk-2.log"
  echo -e "${YELLOW}▶ Chunk 2/$TOTAL_CHUNKS: Progress Placeholder Bubble in Chat${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_2_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Existing download logic (misc-ipc.ts)
`app:openImage` handler downloads remote URLs to `Documents/Neon-post/media/` as `img-{timestamp}.{ext}`. Uses `fs.createWriteStream` with `https.get`. Can reuse this pattern for auto-download.

### Streaming bubble pattern (message-renderer.js)
Temporary elements inserted before `.status-indicator` via `insertBefore()`. Tracked in Maps by sessionId. Replaced/removed when final content arrives. Uses RAF throttling for updates.

### Gallery existing actions
- `social:getGenerated(limit?)` — fetch all
- `social:deleteGenerated(id)` — delete one
- `social:favoriteGenerated(id, rating)` — toggle favorite
- `socPanelActions.openLightbox(id)` — modal view
- No download, no bulk ops, no filtering, no stats

### DB methods available
`generatedContent.create()`, `.getAll()`, `.getById()`, `.update()`, `.delete()`, `.getByType()`, `.getByPlatform()`, `.getTopRated()`, `.getUnused()`

### Media directory
Hardcoded: `path.join(app.getPath('documents'), 'Neon-post', 'media')` in misc-ipc.ts

### CSS patterns
Gallery: `.soc-gallery-item`, `.soc-gallery-item-media`, `.soc-gallery-item-footer`, `.soc-gallery-item-actions`
Chat: `.message.assistant.generated-image-bubble`, `.status-indicator`, `.streaming-bubble`
Status: shimmer animation, pixel cat spinner, state-specific color themes

## Chunk 2/10: Progress Placeholder Bubble in Chat

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/message-renderer.js` — `renderGeneratedImage()` and streaming bubble pattern (insertBefore status indicator)
- `ui/chat/messages.css` — existing `.generated-image-bubble` styles
- `ui/chat/init.js` — where `onImageReady` listener is registered

**Modify:**
- `ui/chat/message-renderer.js` — add `addImagePlaceholder(predictionId, prompt)` and `replaceImagePlaceholder(predictionId, data)` functions
- `ui/chat/messages.css` — add `.image-generating` placeholder styles (shimmer animation, pulsing border)
- `ui/chat/init.js` — update `onImageReady` to call `replaceImagePlaceholder()` instead of just `renderGeneratedImage()`

**What to Build:**
Add a placeholder bubble that appears immediately when image generation starts. Shows an animated shimmer box with the prompt text and "Generating..." label. Track placeholders by predictionId in a Map. When `image:ready` fires, find and replace the placeholder with the real image. If no placeholder exists (e.g. app restarted), fall back to appending.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Submitting an image shows an animated placeholder that gets replaced with the real image when ready.
CHUNK_2_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_3() {
  local log="$LOG_DIR/chunk-3.log"
  echo -e "${YELLOW}▶ Chunk 3/$TOTAL_CHUNKS: Wire Placeholder to Generation Events${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_3_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Existing download logic (misc-ipc.ts)
`app:openImage` handler downloads remote URLs to `Documents/Neon-post/media/` as `img-{timestamp}.{ext}`. Uses `fs.createWriteStream` with `https.get`. Can reuse this pattern for auto-download.

### Streaming bubble pattern (message-renderer.js)
Temporary elements inserted before `.status-indicator` via `insertBefore()`. Tracked in Maps by sessionId. Replaced/removed when final content arrives. Uses RAF throttling for updates.

### Gallery existing actions
- `social:getGenerated(limit?)` — fetch all
- `social:deleteGenerated(id)` — delete one
- `social:favoriteGenerated(id, rating)` — toggle favorite
- `socPanelActions.openLightbox(id)` — modal view
- No download, no bulk ops, no filtering, no stats

### DB methods available
`generatedContent.create()`, `.getAll()`, `.getById()`, `.update()`, `.delete()`, `.getByType()`, `.getByPlatform()`, `.getTopRated()`, `.getUnused()`

### Media directory
Hardcoded: `path.join(app.getPath('documents'), 'Neon-post', 'media')` in misc-ipc.ts

### CSS patterns
Gallery: `.soc-gallery-item`, `.soc-gallery-item-media`, `.soc-gallery-item-footer`, `.soc-gallery-item-actions`
Chat: `.message.assistant.generated-image-bubble`, `.status-indicator`, `.streaming-bubble`
Status: shimmer animation, pixel cat spinner, state-specific color themes

## Chunk 3/10: Wire Placeholder to Generation Events

**Read these files first** (do NOT explore beyond this list):
- `src/main/preload.ts` — existing `onImageReady` bridge, need to add generation-started event
- `src/main/index.ts` — where tracker events are forwarded to webContents
- `src/tools/social-tools.ts` — `handleGenerateImage()` return point where predictionId is known

**Modify:**
- `src/main/preload.ts` — add `onImageGenerating` bridge method for `image:generating` event
- `src/main/index.ts` — listen for `image:generating` on tracker, forward to chat window
- `src/image/job-tracker.ts` — emit `image:generating` event in `track()` method with predictionId and prompt
- `ui/chat/init.js` — register `onImageGenerating` listener that calls `addImagePlaceholder()`

**What to Build:**
When `tracker.track()` is called, emit an `image:generating` event with `{ predictionId, prompt, model }`. Forward through main process → preload → chat UI to trigger the placeholder. This completes the loop: generation starts → placeholder appears → image ready → placeholder replaced.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Full event chain fires: generating → placeholder → ready → real image.
CHUNK_3_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_4() {
  local log="$LOG_DIR/chunk-4.log"
  echo -e "${YELLOW}▶ Chunk 4/$TOTAL_CHUNKS: Gallery Download Button + IPC Handler${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_4_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Existing download logic (misc-ipc.ts)
`app:openImage` handler downloads remote URLs to `Documents/Neon-post/media/` as `img-{timestamp}.{ext}`. Uses `fs.createWriteStream` with `https.get`. Can reuse this pattern for auto-download.

### Streaming bubble pattern (message-renderer.js)
Temporary elements inserted before `.status-indicator` via `insertBefore()`. Tracked in Maps by sessionId. Replaced/removed when final content arrives. Uses RAF throttling for updates.

### Gallery existing actions
- `social:getGenerated(limit?)` — fetch all
- `social:deleteGenerated(id)` — delete one
- `social:favoriteGenerated(id, rating)` — toggle favorite
- `socPanelActions.openLightbox(id)` — modal view
- No download, no bulk ops, no filtering, no stats

### DB methods available
`generatedContent.create()`, `.getAll()`, `.getById()`, `.update()`, `.delete()`, `.getByType()`, `.getByPlatform()`, `.getTopRated()`, `.getUnused()`

### Media directory
Hardcoded: `path.join(app.getPath('documents'), 'Neon-post', 'media')` in misc-ipc.ts

### CSS patterns
Gallery: `.soc-gallery-item`, `.soc-gallery-item-media`, `.soc-gallery-item-footer`, `.soc-gallery-item-actions`
Chat: `.message.assistant.generated-image-bubble`, `.status-indicator`, `.streaming-bubble`
Status: shimmer animation, pixel cat spinner, state-specific color themes

## Chunk 4/10: Gallery Download Button + IPC Handler

**Read these files first** (do NOT explore beyond this list):
- `src/main/ipc/misc-ipc.ts` — existing download pattern for `app:openImage`
- `src/main/ipc/social-ipc.ts` — existing gallery IPC handlers pattern
- `src/main/preload.ts` — existing `social` API exposure pattern
- `src/memory/generated-content.ts` — `getById()` to fetch media_url

**Modify:**
- `src/main/ipc/social-ipc.ts` — add `social:downloadImage` handler that downloads image to user-chosen directory via `dialog.showSaveDialog()`
- `src/main/preload.ts` — expose `downloadImage(id)` in social API
- `ui/chat/social-panel.js` — add download button to gallery item footer and lightbox

**What to Build:**
Add a download IPC handler that takes a generated content ID, fetches the record, and opens a save dialog defaulting to `Downloads/` with the prompt as filename. Downloads the image (from media_url — local or remote) to the chosen path. Add download button icon to gallery cards and lightbox view.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Clicking download on a gallery image opens save dialog and saves the file.
CHUNK_4_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_5() {
  local log="$LOG_DIR/chunk-5.log"
  echo -e "${YELLOW}▶ Chunk 5/$TOTAL_CHUNKS: Gallery Favorites Toggle UI${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_5_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Gallery existing actions
- `social:getGenerated(limit?)` — fetch all
- `social:deleteGenerated(id)` — delete one
- `social:favoriteGenerated(id, rating)` — toggle favorite
- `socPanelActions.openLightbox(id)` — modal view
- No download, no bulk ops, no filtering, no stats

### CSS patterns
Gallery: `.soc-gallery-item`, `.soc-gallery-item-media`, `.soc-gallery-item-footer`, `.soc-gallery-item-actions`

## Chunk 5/10: Gallery Favorites Toggle UI

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — existing `toggleFavorite()` in socPanelActions, gallery rendering
- `ui/chat/social-panel.css` — existing `.soc-favorite-btn` styles

**Modify:**
- `ui/chat/social-panel.js` — update favorite button to show filled/outlined star with smooth transition, add optimistic UI update (toggle class immediately, revert on error)
- `ui/chat/social-panel.css` — improve favorite button active/inactive states with color transition

**What to Build:**
Improve the existing favorite toggle with better visual feedback. Filled gold star when active, outlined when inactive. Optimistic toggle — update the UI immediately, revert if IPC fails. Add a subtle scale animation on click.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** Clicking favorite toggles star state immediately. Reloading gallery preserves state.
CHUNK_5_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_6() {
  local log="$LOG_DIR/chunk-6.log"
  echo -e "${YELLOW}▶ Chunk 6/$TOTAL_CHUNKS: Gallery Filter & Sort Bar${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_6_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Gallery existing actions
- `social:getGenerated(limit?)` — fetch all
- `social:deleteGenerated(id)` — delete one
- `social:favoriteGenerated(id, rating)` — toggle favorite
- `socPanelActions.openLightbox(id)` — modal view
- No download, no bulk ops, no filtering, no stats

### DB methods available
`generatedContent.create()`, `.getAll()`, `.getById()`, `.update()`, `.delete()`, `.getByType()`, `.getByPlatform()`, `.getTopRated()`, `.getUnused()`

### CSS patterns
Gallery: `.soc-gallery-item`, `.soc-gallery-item-media`, `.soc-gallery-item-footer`, `.soc-gallery-item-actions`

## Chunk 6/10: Gallery Filter & Sort Bar

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — `_socLoadGallery()` rendering, existing tab/filter patterns elsewhere in social panel
- `ui/chat/social-panel.css` — existing filter bar patterns (e.g. from posts tab)
- `src/memory/generated-content.ts` — available query methods

**Modify:**
- `ui/chat/social-panel.js` — add filter bar above gallery grid with: search input, content_type filter dropdown, favorites-only toggle, sort dropdown (newest/oldest/top rated). Filter client-side from the fetched items array.
- `ui/chat/social-panel.css` — filter bar styling matching existing panel patterns

**What to Build:**
Add a filter/sort bar at the top of the gallery tab. Search filters by prompt text. Type dropdown filters by content_type (all, image, caption, etc). Favorites toggle shows only rated items. Sort dropdown for newest first, oldest first, top rated. All filtering is client-side on the already-fetched 100 items.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** Filter bar renders. Typing in search filters gallery. Sort changes order. Favorites toggle works.
CHUNK_6_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_7() {
  local log="$LOG_DIR/chunk-7.log"
  echo -e "${YELLOW}▶ Chunk 7/$TOTAL_CHUNKS: Gallery Stats Row${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_7_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Gallery existing actions
- `social:getGenerated(limit?)` — fetch all
- `social:deleteGenerated(id)` — delete one
- `social:favoriteGenerated(id, rating)` — toggle favorite
- `socPanelActions.openLightbox(id)` — modal view

### CSS patterns
Gallery: `.soc-gallery-item`, `.soc-gallery-item-media`, `.soc-gallery-item-footer`, `.soc-gallery-item-actions`

## Chunk 7/10: Gallery Stats Row

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — `_socLoadGallery()` to see where to insert stats
- `ui/chat/social-panel.css` — card/badge styling patterns

**Modify:**
- `ui/chat/social-panel.js` — add stats row above filter bar showing: Total Items, Images, Favorites, computed from fetched data
- `ui/chat/social-panel.css` — stats row styling (small cards in a row)

**What to Build:**
Add a compact stats row showing total gallery items, image count, and favorites count. Computed from the items array after fetch. Uses small pill/badge style cards in a horizontal row.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** Stats row shows correct counts. Updates when items are added/deleted/favorited.
CHUNK_7_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_8() {
  local log="$LOG_DIR/chunk-8.log"
  echo -e "${YELLOW}▶ Chunk 8/$TOTAL_CHUNKS: Lightbox Navigation (Prev/Next)${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_8_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Gallery existing actions
- `social:getGenerated(limit?)` — fetch all
- `social:deleteGenerated(id)` — delete one
- `social:favoriteGenerated(id, rating)` — toggle favorite
- `socPanelActions.openLightbox(id)` — modal view

### CSS patterns
Gallery: `.soc-gallery-item`, `.soc-gallery-item-media`, `.soc-gallery-item-footer`, `.soc-gallery-item-actions`

## Chunk 8/10: Lightbox Navigation (Prev/Next)

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — existing `openLightbox()` implementation, lightbox HTML structure
- `ui/chat/social-panel.css` — existing lightbox styles

**Modify:**
- `ui/chat/social-panel.js` — add prev/next buttons to lightbox, track current index in items array, keyboard navigation (arrow keys, Escape)
- `ui/chat/social-panel.css` — prev/next button positioning and styling

**What to Build:**
Add prev/next navigation arrows to the lightbox modal. Track current item index. Arrow key support (left/right to navigate, Escape to close). Buttons positioned at left/right edges of the modal. Wrap around at ends.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** Lightbox shows prev/next arrows. Arrow keys navigate. Escape closes.
CHUNK_8_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_9() {
  local log="$LOG_DIR/chunk-9.log"
  echo -e "${YELLOW}▶ Chunk 9/$TOTAL_CHUNKS: Bulk Select & Delete in Gallery${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_9_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Gallery existing actions
- `social:getGenerated(limit?)` — fetch all
- `social:deleteGenerated(id)` — delete one
- `social:favoriteGenerated(id, rating)` — toggle favorite
- `socPanelActions.openLightbox(id)` — modal view

### DB methods available
`generatedContent.create()`, `.getAll()`, `.getById()`, `.update()`, `.delete()`, `.getByType()`, `.getByPlatform()`, `.getTopRated()`, `.getUnused()`

### CSS patterns
Gallery: `.soc-gallery-item`, `.soc-gallery-item-media`, `.soc-gallery-item-footer`, `.soc-gallery-item-actions`

## Chunk 9/10: Bulk Select & Delete in Gallery

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — existing `deleteGenerated()`, gallery grid rendering
- `src/main/ipc/social-ipc.ts` — existing delete handler
- `src/main/preload.ts` — existing `deleteGenerated` exposure

**Modify:**
- `ui/chat/social-panel.js` — add selection mode: long-press or checkbox on cards, selection toolbar with "Select All / Delete Selected" actions, selection state tracked in Set
- `ui/chat/social-panel.css` — selected card styling (border highlight, checkbox overlay)
- `src/main/ipc/social-ipc.ts` — add `social:bulkDeleteGenerated` handler that accepts array of IDs
- `src/main/preload.ts` — expose `bulkDeleteGenerated(ids)` in social API

**What to Build:**
Add a "Select" toggle button to the filter bar. When active, gallery cards show checkboxes. Selected cards get a highlight ring. Toolbar appears with select all / deselect all / delete selected buttons. Bulk delete calls a new IPC handler that deletes all selected IDs in one transaction.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Can select multiple items and delete them all at once.
CHUNK_9_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_10() {
  local log="$LOG_DIR/chunk-10.log"
  echo -e "${YELLOW}▶ Chunk 10/$TOTAL_CHUNKS: Retry Button on Failed Image Bubbles + Chat Image Actions${NC}"

  local context_section=""
  if [[ -n "$PREV_CONTEXT" ]]; then
    context_section="
### Previous Chunk Changes
\`\`\`
$PREV_CONTEXT
\`\`\`
Do NOT modify these files unless they're in YOUR file lists."
  fi

  cd "$PROJECT_DIR"
  claude --dangerously-skip-permissions --max-turns 50 \
    -p "$(cat <<'CHUNK_10_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: `npm run typecheck && npm run lint`

## Research Findings

### Streaming bubble pattern (message-renderer.js)
Temporary elements inserted before `.status-indicator` via `insertBefore()`. Tracked in Maps by sessionId. Replaced/removed when final content arrives. Uses RAF throttling for updates.

### CSS patterns
Chat: `.message.assistant.generated-image-bubble`, `.status-indicator`, `.streaming-bubble`
Status: shimmer animation, pixel cat spinner, state-specific color themes

## Chunk 10/10: Retry Button on Failed Image Bubbles + Chat Image Actions

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/message-renderer.js` — `renderImageError()` and `renderGeneratedImage()`
- `ui/chat/messages.css` — existing button styles in chat
- `src/main/preload.ts` — existing `social.generateImage` exposure

**Modify:**
- `ui/chat/message-renderer.js` — add "Retry" button to `renderImageError()` that re-submits same prompt. Add action buttons (download, copy URL, open external) to `renderGeneratedImage()` on hover.
- `ui/chat/messages.css` — hover action bar styling for image bubbles, retry button styling

**What to Build:**
Add a "Retry" button to failed image bubbles that re-calls `generateImage` with the original prompt. Add a hover action bar to successful image bubbles with: download (save dialog), copy URL (clipboard), open external (current click behavior moved to button). Actions appear on hover as a semi-transparent overlay bar.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what's described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** Failed images show retry button. Clicking retry submits a new generation. Hovering successful images shows action buttons.
CHUNK_10_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

# ══════════════════════════════════════════════════════
# MAIN LOOP
# ══════════════════════════════════════════════════════

CHUNK_FUNCTIONS=( run_chunk_1 run_chunk_2 run_chunk_3 run_chunk_4 run_chunk_5 run_chunk_6 run_chunk_7 run_chunk_8 run_chunk_9 run_chunk_10 )
CHUNK_NAMES=( "Auto-Download Images on Completion" "Progress Placeholder Bubble in Chat" "Wire Placeholder to Generation Events" "Gallery Download Button + IPC Handler" "Gallery Favorites Toggle UI" "Gallery Filter & Sort Bar" "Gallery Stats Row" "Lightbox Navigation (Prev/Next)" "Bulk Select & Delete in Gallery" "Retry Button on Failed Image Bubbles + Chat Image Actions" )

for i in "${!CHUNK_FUNCTIONS[@]}"; do
  num=$((i + 1))

  if [[ "$num" -lt "$START_CHUNK" ]]; then
    echo -e "${YELLOW}  Skipping chunk $num${NC}"
    continue
  fi

  ${CHUNK_FUNCTIONS[$i]}
  run_quality_gate "$num"
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
