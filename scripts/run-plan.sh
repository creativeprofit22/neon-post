#!/bin/bash
set -eo pipefail

PROJECT_DIR="/mnt/e/Projects/neon-post"
LOG_DIR="$PROJECT_DIR/.claude/logs"
CHECK_CMD="npm run typecheck && npm run lint"
FEATURE_NAME="Content Repurposing Pipeline + Scraper Caching + Visual Feedback"
TOTAL_CHUNKS=15

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
# CHUNK FUNCTIONS
# ══════════════════════════════════════════════════════

run_chunk_1() {
  local log="$LOG_DIR/chunk-1.log"
  echo -e "${YELLOW}▶ Chunk 1/$TOTAL_CHUNKS: Add Cache Columns to discovered_content${NC}"

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
Check: npm run typecheck && npm run lint

## Research Findings

### [ADAPT] Scraper Cache Architecture
Cache lives in `discovered_content` table (already exists). Key additions needed:
- `external_id` column for dedup (platform + externalId = unique)
- `query_hash` column to link cached results to the search that found them
- `cache_expires_at` column for TTL

Cache lookup flow:
```
handleSearchContent(platform, query, limit)
  → hash(platform, query) → check discovered_content WHERE query_hash = hash AND cache_expires_at > now
  → HIT: return cached rows, skip Apify
  → MISS: call Apify, store ALL results with query_hash + TTL, return first N
```
TTLs: trending = 2h, search = 24h, profile = 48h.

## Chunk 1/15: Add Cache Columns to discovered_content

**Read these files first** (do NOT explore beyond this list):
- `src/memory/discovered-content.ts` — current schema, migration pattern, CreateDiscoveredContentInput interface

**Modify:**
- `src/memory/discovered-content.ts` — add `external_id`, `query_hash`, `cache_expires_at` columns via migration, add to interfaces, add `findCached()` and `findByExternalId()` query methods

**What to Build:**
Add three columns via the existing migration pattern (ALTER TABLE with try/catch for "already exists"):
- `external_id TEXT` — platform-specific post ID for dedup
- `query_hash TEXT` — SHA-256 of `platform:query` to link cached results to searches
- `cache_expires_at TEXT` — ISO timestamp for TTL expiry

Add indexes: `idx_discovered_content_external_id` on `(platform, external_id)`, `idx_discovered_content_query_hash` on `(query_hash, cache_expires_at)`.

Add to `CreateDiscoveredContentInput`: `external_id?: string | null`, `query_hash?: string | null`, `cache_expires_at?: string | null`.

Add query methods:
- `findCached(queryHash: string, limit: number, offset: number = 0): DiscoveredContent[]` — returns cached results where `cache_expires_at > now`, ordered by `discovered_at DESC`, with LIMIT and OFFSET for pagination
- `findByExternalId(platform: string, externalId: string): DiscoveredContent | null` — for dedup checks
- `countCached(queryHash: string): number` — count unexpired cached results (used to know if there are more pages)

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. New columns added via migration (safe for existing DBs).
CHUNK_1_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_2() {
  local log="$LOG_DIR/chunk-2.log"
  echo -e "${YELLOW}▶ Chunk 2/$TOTAL_CHUNKS: Build Cache-Before-Scrape Layer${NC}"

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
Check: npm run typecheck && npm run lint

## Research Findings

### [ADAPT] Scraper Cache Architecture
Cache lives in `discovered_content` table (already exists). Key additions needed:
- `external_id` column for dedup (platform + externalId = unique)
- `query_hash` column to link cached results to the search that found them
- `cache_expires_at` column for TTL

Cache lookup flow:
```
handleSearchContent(platform, query, limit)
  → hash(platform, query) → check discovered_content WHERE query_hash = hash AND cache_expires_at > now
  → HIT: return cached rows, skip Apify
  → MISS: call Apify, store ALL results with query_hash + TTL, return first N
```
TTLs: trending = 2h, search = 24h, profile = 48h.

## Chunk 2/15: Build Cache-Before-Scrape Layer

**Read these files first** (do NOT explore beyond this list):
- `src/social/scraping/index.ts` — `searchContent()`, `scrapeProfile()` signatures and routing logic
- `src/social/scraping/pocket-cli.ts` — `ContentResult` interface
- `src/memory/discovered-content.ts` — new `findCached()`, `findByExternalId()` methods from chunk 1
- `src/tools/social-tools.ts` — `handleSearchContent()` (lines 99-155), how it calls `searchContent()`

**Create:**
- `src/social/scraping/cache.ts` — cache lookup, store, TTL logic, query hash helper

**Modify:**
- `src/tools/social-tools.ts` — wrap `searchContent()` and `scrapeProfile()` calls with cache check

**What to Build:**
Create `src/social/scraping/cache.ts` with:
- `computeQueryHash(platform: string, query: string): string` — SHA-256 of `platform:query`
- `getCacheTTL(type: 'trending' | 'search' | 'profile'): number` — returns ms (2h, 24h, 48h)
- `checkCache(memory, platform, query, limit, offset, type): ContentResult[] | null` — checks `findCached()` with offset, returns null on miss (no cached results at all) or the cached slice
- `storeInCache(memory, results: ContentResult[], platform, query, type): void` — stores all results with query_hash, TTL, and external_id; deduplicates by `findByExternalId()` before inserting

Track per-session offsets: add a `cacheOffsetByQuery: Map<string, number>` in social-tools.ts. When user searches the same query again in the same session, increment offset to return the NEXT N results from cache instead of repeating. Reset offset when query changes or session changes. If offset exceeds cached count, re-scrape for fresh results.

In `handleSearchContent()`: before calling `searchContent()`, call `checkCache()` with current offset. On hit, return cached results (still apply viral scoring), increment offset. On miss, call scraper, then `storeInCache()` with ALL results, return first N from offset 0.

In `handleScrapeProfile()`: same cache-before-scrape pattern with 'profile' TTL and offset tracking.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Second identical search returns cached results without calling Apify.
CHUNK_2_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_3() {
  local log="$LOG_DIR/chunk-3.log"
  echo -e "${YELLOW}▶ Chunk 3/$TOTAL_CHUNKS: Content Type Filtering${NC}"

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
Check: npm run typecheck && npm run lint

## Research Findings

### [REFERENCE] Content Type Distribution by Platform
```
TikTok:    ~97% video, ~2% slideshow, ~1% image
Instagram: ~30% image, ~40% video/reel, ~30% carousel/sidecar
Twitter/X: ~40% text-only, ~35% text+image, ~25% video
LinkedIn:  ~45% text-only, ~20% image, ~20% carousel, ~15% video
YouTube:   ~100% video
```
These priors determine over-fetch multipliers when filtering by content type.

## Chunk 3/15: Content Type Filtering

**Read these files first** (do NOT explore beyond this list):
- `src/tools/social-tools.ts` — `handleSearchContent()`, tool schema definition for `search_content`
- `src/social/scraping/pocket-cli.ts` — `ContentResult` interface (has `contentType` field)
- `src/social/scraping/cache.ts` — cache layer from chunk 2

**Modify:**
- `src/tools/social-tools.ts` — add `content_type` param to `search_content` tool schema, filter results after fetch/cache

**What to Build:**
Add optional `content_type` parameter to the `search_content` tool definition: `content_type?: 'video' | 'image' | 'carousel' | 'text'`.

In `handleSearchContent()`, after getting results (from cache or fresh scrape), filter by `contentType` if specified. Use platform priors to determine over-fetch multiplier: if filtering for a rare type (e.g., image on TikTok at ~1%), multiply the limit by the inverse frequency (capped at 50). Pass the multiplied limit to the scraper, then filter and slice to the originally requested limit.

If filtered results are fewer than requested, return what was found with a message: `"Found N [type] posts out of M total. [type] content is rare on [platform]."`.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. `search_content` tool accepts `content_type` param and filters results accordingly.
CHUNK_3_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_4() {
  local log="$LOG_DIR/chunk-4.log"
  echo -e "${YELLOW}▶ Chunk 4/$TOTAL_CHUNKS: AssemblyAI CLI Transcription${NC}"

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
Check: npm run typecheck && npm run lint

## Research Findings

### [ADAPT] AssemblyAI CLI Transcription
Official CLI tool. Install via scoop (Windows) or brew (macOS). Same subprocess pattern as yt-dlp.

```bash
# Install
scoop install assemblyai        # Windows
brew install assemblyai/assemblyai/assemblyai  # macOS

# Configure (stores in ~/.config/assemblyai/config.toml)
assemblyai config YOUR_API_KEY

# Transcribe a local file
assemblyai transcribe video.mp4

# Transcribe a URL
assemblyai transcribe https://example.com/video.mp4
```

Pricing: $0.0035/min (Universal-3 Pro). Free tier: 185 hours pre-recorded. Universal-2 is deprecated — use Universal-3 only.

CLI output is plain text transcript to stdout. Can redirect to file. Supports `--auto_highlights`, `--entity_detection`, `--sentiment_analysis`, `--summarization` flags.

### [ADAPT] yt-dlp Subprocess Pattern (existing in codebase)
From `src/social/scraping/index.ts:306-337`:
```typescript
const { execFile } = await import('node:child_process');
const filePath = await new Promise<string>((resolve, reject) => {
  execFile('yt-dlp', [...args], { timeout: 120_000 }, (error, stdout, stderr) => {
    if (error) { reject(new Error(`yt-dlp failed: ${stderr?.slice(0, 200)}`)); return; }
    const output = stdout.trim().split('\n').pop() ?? '';
    resolve(output);
  });
});
```

## Chunk 4/15: AssemblyAI CLI Transcription

**Read these files first** (do NOT explore beyond this list):
- `src/social/scraping/index.ts` — `downloadVideo()` yt-dlp subprocess pattern (lines 306-337)
- `src/utils/transcribe.ts` — existing OpenAI Whisper transcription for fallback reference
- `src/social/video/types.ts` — `TranscriptionResult`, `TranscriptSegment` types

**Create:**
- `src/social/transcription/assemblyai.ts` — CLI wrapper: `transcribeWithAssemblyAI(filePath: string): Promise<TranscriptionResult>`

**What to Build:**
Create `src/social/transcription/assemblyai.ts` with a function that shells out to `assemblyai transcribe [filePath]` via `execFile`, captures stdout (the transcript text), and returns a `TranscriptionResult` object. Use 10-minute timeout (video transcription can be slow). If CLI is not found, throw a descriptive error ("AssemblyAI CLI not installed — run: scoop install assemblyai").

Add `transcribeContent(filePath: string): Promise<TranscriptionResult>` that tries AssemblyAI CLI first, falls back to OpenAI Whisper API if CLI unavailable and OpenAI key is configured. Same try/catch/fallback pattern as `downloadVideo()`.

The result should include the full text and segments if available. The CLI outputs plain text, so segments will just be a single segment with the full text (word-level timestamps require the REST API, which we skip for simplicity).

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Module exports `transcribeContent()`.
CHUNK_4_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_5() {
  local log="$LOG_DIR/chunk-5.log"
  echo -e "${YELLOW}▶ Chunk 5/$TOTAL_CHUNKS: AssemblyAI Key UI + Validation${NC}"

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
Check: npm run typecheck && npm run lint

## Research Findings

### [ADAPT] API Key Row Pattern (existing in codebase)
HTML pattern from `ui/chat.html:1384-1392`:
```html
<div class="soc-key-row">
  <div class="soc-key-info"><span class="soc-key-name">Kie.ai</span><span class="soc-key-desc">AI image generation</span></div>
  <div class="soc-key-input">
    <input type="password" id="soc-kie-key" placeholder="..." autocomplete="off">
    <button class="soc-btn soc-btn-sm" id="soc-kie-test-btn">Test</button>
    <button class="soc-btn soc-btn-sm soc-btn-primary" id="soc-kie-save-btn">Save</button>
    <span id="soc-kie-status" class="soc-key-status"></span>
  </div>
</div>
```

JS pattern from `ui/chat/social-panel.js:812-843` — load key from settings, test via IPC, save on success.

## Chunk 5/15: AssemblyAI Key UI + Validation

**Read these files first** (do NOT explore beyond this list):
- `ui/chat.html` — API key rows section (lines 1362-1393)
- `ui/chat/social-panel.js` — Kie.ai key load/test/save handlers (lines 812-900)
- `src/main/ipc/social-ipc.ts` — `social:validateKieKey` handler pattern (lines 174-200)
- `src/main/preload.ts` — `validateKieKey` binding (line 276)

**Modify:**
- `ui/chat.html` — add AssemblyAI key row after Kie.ai row
- `ui/chat/social-panel.js` — add load/test/save handlers for AssemblyAI key
- `src/main/ipc/social-ipc.ts` — add `social:validateAssemblyKey` IPC handler
- `src/main/preload.ts` — add `validateAssemblyKey` binding + type

**What to Build:**
Add an AssemblyAI API key row in the Accounts tab HTML, following the exact same pattern as Kie.ai: input + Test + Save buttons.

IPC handler `social:validateAssemblyKey`: tries to run `assemblyai config [key]` via execFile. If the command succeeds, the key is valid. Save to settings as `assembly.apiKey`.

Preload: expose `validateAssemblyKey` on `window.pocketAgent.social`.

Social panel JS: load key from `assembly.apiKey` on tab init, wire Test button to `validateAssemblyKey`, Save button to `settings.set('assembly.apiKey', key)`.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. AssemblyAI key row visible in Accounts tab. Test button validates and saves key.
CHUNK_5_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_6() {
  local log="$LOG_DIR/chunk-6.log"
  echo -e "${YELLOW}▶ Chunk 6/$TOTAL_CHUNKS: Add repurpose to GeneratedContentType + Prompt Template${NC}"

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
Check: npm run typecheck && npm run lint

## Chunk 6/15: Add 'repurpose' to GeneratedContentType + Repurpose Prompt Template

**Read these files first** (do NOT explore beyond this list):
- `src/memory/generated-content.ts` — `GeneratedContentType` enum (line 6-14)
- `src/social/content/prompts.ts` — existing prompt templates (captionPrompt, hookPrompt, etc.), `ContentPromptContext` interface

**Modify:**
- `src/memory/generated-content.ts` — add `'repurpose'` to `GeneratedContentType`
- `src/social/content/prompts.ts` — add `RepurposePromptContext` interface and `repurposePrompt()` function

**What to Build:**
Add `'repurpose'` to the `GeneratedContentType` union type.

Create `RepurposePromptContext` extending `ContentPromptContext` with:
- `sourceContent: string` — the original post caption/text
- `sourcePlatform: string` — where it came from
- `sourceStats?: { likes: number; comments: number; shares: number; views: number }`
- `sourceTranscript?: string` — video transcript if available
- `targetPlatforms: string[]` — platforms to repurpose for

Create `repurposePrompt(ctx: RepurposePromptContext): string` that builds a structured prompt including:
- The source content with stats context
- The transcript if available (for video repurposing)
- Per-platform instructions (X: 280 chars max; Instagram: caption + 15-20 hashtags; TikTok: video script with hook/body/CTA; LinkedIn: professional reframe)
- Brand voice injection from context
- Instruction to output clearly labeled sections per target platform

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. `repurposePrompt()` returns a well-structured prompt string.
CHUNK_6_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_7() {
  local log="$LOG_DIR/chunk-7.log"
  echo -e "${YELLOW}▶ Chunk 7/$TOTAL_CHUNKS: Fix Panel Repurpose to Use Actual Content${NC}"

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
Check: npm run typecheck && npm run lint

## Chunk 7/15: Fix Panel Repurpose to Use Actual Content

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — repurpose button handler (lines 530-564), saved content card "Repurpose" button
- `src/main/ipc/social-ipc.ts` — `social:generateContent` IPC handler (lines 467-515)
- `src/memory/discovered-content.ts` — `getById()` method
- `src/social/content/prompts.ts` — new `repurposePrompt()` from chunk 6

**Modify:**
- `ui/chat/social-panel.js` — repurpose handler: pass content ID instead of URL, or send full content data
- `src/main/ipc/social-ipc.ts` — when `content_type === 'repurpose'`, look up content from DB, build proper prompt using `repurposePrompt()`
- `ui/chat.html` — update repurpose panel: replace URL input with content selector + preview area

**What to Build:**
Replace the URL-based repurpose flow with a content-based one:

**UI**: Replace `#soc-repurpose-url` input with a dropdown/selector populated from saved content (`social.getDiscovered(50)`). When an item is selected, show a preview card (title, platform, stats, content type). Keep the target platform selector. Add multi-platform checkboxes instead of single select.

**IPC handler**: When `content_type === 'repurpose'`, expect `source_content_id` in the input. Look up the discovered content via `memory.discoveredContent.getById(id)`. Build a `RepurposePromptContext` from the content data (title, body, stats, tags, platform). If the content has a transcript stored in metadata, include it. Call `repurposePrompt()` to build the actual prompt, then send to Claude.

**Saved card button**: When clicking "Repurpose" on a saved content card, pass the content ID to the repurpose panel, not just the URL.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Repurpose panel shows content preview and generates platform-specific repurposed content using actual post data.
CHUNK_7_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_8() {
  local log="$LOG_DIR/chunk-8.log"
  echo -e "${YELLOW}▶ Chunk 8/$TOTAL_CHUNKS: Repurpose Agent Tool${NC}"

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
Check: npm run typecheck && npm run lint

## Research Findings

### [ADAPT] yt-dlp Subprocess Pattern (existing in codebase)
From `src/social/scraping/index.ts:306-337`:
```typescript
const { execFile } = await import('node:child_process');
const filePath = await new Promise<string>((resolve, reject) => {
  execFile('yt-dlp', [...args], { timeout: 120_000 }, (error, stdout, stderr) => {
    if (error) { reject(new Error(`yt-dlp failed: ${stderr?.slice(0, 200)}`)); return; }
    const output = stdout.trim().split('\n').pop() ?? '';
    resolve(output);
  });
});
```

## Chunk 8/15: Repurpose Agent Tool

**Read these files first** (do NOT explore beyond this list):
- `src/tools/social-tools.ts` — existing tool definitions pattern (e.g., `generate_content` at line 786), tool registration
- `src/social/content/prompts.ts` — `repurposePrompt()` from chunk 6
- `src/memory/discovered-content.ts` — `getById()`, `DiscoveredContent` interface
- `src/social/transcription/assemblyai.ts` — `transcribeContent()` from chunk 4

**Modify:**
- `src/tools/social-tools.ts` — add `repurpose_content` tool definition + handler
- `src/tools/index.ts` — export new tool if needed

**What to Build:**
Add a new agent tool `repurpose_content` with schema:
```
input: {
  source_content_id?: string    // ID from discovered_content DB
  source_url?: string           // alternative: raw URL to scrape first
  target_platforms: string[]    // ['twitter', 'instagram', 'tiktok']
  tone?: string                 // optional tone override
  additional_instructions?: string
}
```

Handler `handleRepurposeContent()`:
1. If `source_content_id` provided, look up from DB. If `source_url` provided, search/scrape to get content first.
2. If content is video and no transcript in metadata, call `transcribeContent()` to get transcript, store in content metadata.
3. Build `RepurposePromptContext` from content data + transcript.
4. Call `repurposePrompt()` to get the structured prompt.
5. If any target platform is visual (Instagram, TikTok) and source content is text-only (no media), include an instruction in the prompt to generate an image prompt alongside the repurposed copy. The agent can then pass that prompt to `generate_image` tool.
6. Emit `socialToolEvents.emit('repurpose:completed', { source_content_id, drafts, platforms })` so the panel's Gallery/Create tab can display the generated content without requiring the user to switch manually.
7. Return the prompt + source content summary to the agent (agent will use it in its response).

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Agent can invoke `repurpose_content` tool with a content ID and get back platform-specific repurposed drafts.
CHUNK_8_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_9() {
  local log="$LOG_DIR/chunk-9.log"
  echo -e "${YELLOW}▶ Chunk 9/$TOTAL_CHUNKS: Update Agent System Prompt + Wire Repurpose Events${NC}"

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
Check: npm run typecheck && npm run lint

## Chunk 9/15: Update Agent System Prompt + Wire Repurpose Events

**Read these files first** (do NOT explore beyond this list):
- `src/social/content/system-prompts.ts` — `contentCreatorSystemPrompt()`, existing tool descriptions
- `src/agent/agent-modes.ts` — Creator mode tool list, SOCIAL_TOOLS array
- `src/main/index.ts` — existing `socialToolEvents.on(...)` forwarding pattern (lines 662-719)
- `src/main/preload.ts` — IPC event bindings for social events
- `ui/chat/init.js` — event listener registration pattern

**Modify:**
- `src/social/content/system-prompts.ts` — add `repurpose_content` tool description and recommended workflow chain to the Creator system prompt
- `src/agent/agent-modes.ts` — add `'repurpose_content'` to SOCIAL_TOOLS array
- `src/main/index.ts` — forward `repurpose:completed` event to renderer
- `src/main/preload.ts` — add `onRepurposeCompleted` IPC binding
- `ui/chat/init.js` — listen for `repurpose:completed`, push results to Gallery cache and show toast

**What to Build:**
Update the Creator system prompt to include `repurpose_content` in the tool descriptions with usage guidance:
- "When the user wants to repurpose content: use `search_content` to find posts → present results → use `repurpose_content` with the chosen content ID and target platforms → present the per-platform drafts for approval → if user approves, use `schedule_post` to schedule each draft. For visual platforms with text-only source, also use `generate_image` to create accompanying images."
- "Always ask the user which platforms to target and confirm before scheduling."

Add `'repurpose_content'` to the SOCIAL_TOOLS array in agent-modes.ts.

Forward `repurpose:completed` event through IPC to the renderer. In `init.js`, listen for it and push the generated drafts into the Gallery cache so they appear in the Gallery tab without manual refresh. Show a non-intrusive toast: "Repurposed drafts ready — view in Gallery".

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Agent knows about `repurpose_content` tool and the recommended workflow chain.
CHUNK_9_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_10() {
  local log="$LOG_DIR/chunk-10.log"
  echo -e "${YELLOW}▶ Chunk 10/$TOTAL_CHUNKS: Pipeline Loading States — Chat Placeholders${NC}"

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
Check: npm run typecheck && npm run lint

## Research Findings

### [ADAPT] Image Placeholder Pattern (existing in codebase)
From `ui/chat/message-renderer.js:712-741`:
```javascript
function addImagePlaceholder(predictionId, prompt) {
  const div = document.createElement('div');
  div.className = 'message assistant generated-image-bubble image-generating';
  const shimmer = document.createElement('div');
  shimmer.className = 'image-generating-shimmer';
  div.appendChild(shimmer);
  const label = document.createElement('div');
  label.className = 'image-generating-label';
  label.textContent = 'Generating...';
  div.appendChild(label);
  // ...insert into messages container
}
```

### [ADAPT] Skeleton Loading Pattern (existing in codebase)
From `ui/chat/social-panel.js` — used in Discover/Gallery tabs:
```javascript
container.innerHTML = Array.from({ length: 6 }, () =>
  '<div class="soc-card soc-skeleton"></div>'
).join('');
```

CSS from `social-panel.css:367-377`:
```css
.soc-skeleton {
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--border) 50%, var(--bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: socSkeletonPulse 1.5s ease-in-out infinite;
  min-height: 120px;
  border-radius: 8px;
}
```

## Chunk 10/15: Pipeline Loading States — Chat Placeholders

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/message-renderer.js` — `addImagePlaceholder()`, `replaceImagePlaceholder()` pattern (lines 712-791)
- `ui/chat/messages.css` — `.image-generating`, `.image-generating-shimmer`, `.image-generating-label` styles (lines 505-545)
- `ui/chat/init.js` — event listener registration pattern (lines 103-196)
- `src/main/preload.ts` — IPC event bindings

**Modify:**
- `ui/chat/message-renderer.js` — add `addPipelinePlaceholder(id, type, label)` and `updatePipelinePlaceholder(id, label)` and `removePipelinePlaceholder(id)`
- `ui/chat/messages.css` — add `.pipeline-placeholder` styles with platform-colored shimmers

**What to Build:**
Create a generic pipeline placeholder system (like image placeholders but for any long operation):

`addPipelinePlaceholder(id, type, label, platform?)` — creates a bubble with shimmer animation, label text (e.g. "Searching TikTok..."), and platform-colored accent. Types: `'scraping'`, `'transcribing'`, `'repurposing'`, `'scheduling'`.

`updatePipelinePlaceholder(id, label)` — updates the label text (e.g. "Generating X draft..." → "Generating Instagram draft...").

`removePipelinePlaceholder(id)` — removes the placeholder when operation completes.

CSS: `.pipeline-placeholder` with shimmer animation (reuse `.image-generating-shimmer` pattern), but shorter height (60px vs 240px). Platform-colored border-left accent. Label with shimmer text animation.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Functions exported and callable from init.js event handlers.
CHUNK_10_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_11() {
  local log="$LOG_DIR/chunk-11.log"
  echo -e "${YELLOW}▶ Chunk 11/$TOTAL_CHUNKS: Wire Pipeline Events to Placeholders${NC}"

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
    -p "$(cat <<'CHUNK_11_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: npm run typecheck && npm run lint

## Chunk 11/15: Wire Pipeline Events to Placeholders

**Read these files first** (do NOT explore beyond this list):
- `src/main/index.ts` — `socialToolEvents.on('search:results')` and other event handlers (lines 662-719)
- `ui/chat/init.js` — event listener registration (lines 144-196)
- `src/main/preload.ts` — IPC event bindings for social events
- `ui/chat/message-renderer.js` — new placeholder functions from chunk 10

**Modify:**
- `src/tools/social-tools.ts` — emit `'search:started'`, `'profile:started'`, `'repurpose:started'`, `'repurpose:progress'` events before/during operations
- `src/main/index.ts` — forward new started/progress events to renderer
- `src/main/preload.ts` — add IPC bindings for new events
- `ui/chat/init.js` — listen for started/progress/results events, show/update/remove placeholders

**What to Build:**
Emit lifecycle events for long operations:

In `handleSearchContent()`: emit `socialToolEvents.emit('search:started', { platform, query })` before calling the scraper. The existing `search:results` event signals completion.

In `handleScrapeProfile()`: emit `'profile:started'` before scraping.

In `handleRepurposeContent()`: emit `'repurpose:started'` at start, `'repurpose:progress'` with stage labels during processing (e.g., "Fetching transcript...", "Generating drafts...").

Forward all new events through IPC in `src/main/index.ts`. Bind in preload. Listen in `init.js`: on `started` → `addPipelinePlaceholder()`, on `results` → `removePipelinePlaceholder()`.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Searching shows "Searching [platform]..." placeholder, replaced when results arrive.
CHUNK_11_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_12() {
  local log="$LOG_DIR/chunk-12.log"
  echo -e "${YELLOW}▶ Chunk 12/$TOTAL_CHUNKS: Repurpose Panel UI Overhaul${NC}"

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
    -p "$(cat <<'CHUNK_12_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: npm run typecheck && npm run lint

## Research Findings

### [ADAPT] Skeleton Loading Pattern (existing in codebase)
From `ui/chat/social-panel.js` — used in Discover/Gallery tabs:
```javascript
container.innerHTML = Array.from({ length: 6 }, () =>
  '<div class="soc-card soc-skeleton"></div>'
).join('');
```

## Chunk 12/15: Repurpose Panel UI Overhaul

**Read these files first** (do NOT explore beyond this list):
- `ui/chat.html` — repurpose panel HTML (lines 1110-1127), Create tab structure
- `ui/chat/social-panel.js` — repurpose handler, saved content rendering, tab switching
- `ui/chat/social-panel.css` — existing card/panel styles

**Modify:**
- `ui/chat.html` — replace repurpose panel HTML with content selector, preview card, multi-platform checkboxes, draft output per platform
- `ui/chat/social-panel.js` — new repurpose panel logic: load saved content list, preview card, generate per-platform drafts, inline edit, schedule buttons
- `ui/chat/social-panel.css` — styles for repurpose preview card, platform draft cards, inline editor

**What to Build:**
Replace the minimal repurpose panel with:

**Source selector**: Dropdown listing saved content (title + platform badge + content type tag). On select, show preview card with title, stats, creator, tags, and transcript excerpt if available.

**Target platforms**: Checkboxes for each platform (X, Instagram, TikTok, LinkedIn, YouTube). Pre-check the user's connected platforms.

**Generate button**: Calls `social.generateContent({ content_type: 'repurpose', source_content_id: id, platforms: [...] })`. Shows skeleton loading state during generation.

**Draft output**: Per-platform collapsible cards showing generated copy, suggested hashtags, and character count. Each card has:
- Inline editable textarea for the copy
- "Schedule" button → opens date picker, creates scheduled post
- "Copy" button → clipboard
- "Regenerate" button → re-generates just that platform's draft

**Batch mode**: "Select multiple" toggle in Saved tab that lets user check multiple items, then "Repurpose All" button that processes them sequentially with progress.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Repurpose panel shows content preview, generates per-platform drafts, and allows inline editing.
CHUNK_12_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_13() {
  local log="$LOG_DIR/chunk-13.log"
  echo -e "${YELLOW}▶ Chunk 13/$TOTAL_CHUNKS: Schedule from Repurpose Drafts${NC}"

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
    -p "$(cat <<'CHUNK_13_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: npm run typecheck && npm run lint

## Chunk 13/15: Schedule from Repurpose Drafts

**Read these files first** (do NOT explore beyond this list):
- `src/main/ipc/social-ipc.ts` — `social:createPost` handler (lines 316-342)
- `src/memory/social-posts.ts` — `create()` method, `SocialPostStatus` type
- `ui/chat/social-panel.js` — new repurpose draft cards from chunk 12

**Modify:**
- `ui/chat/social-panel.js` — wire "Schedule" button on draft cards to create scheduled posts with source linking
- `src/memory/social-posts.ts` — add `source_content_id` column via migration for linking posts to their source content
- `src/main/ipc/social-ipc.ts` — accept `source_content_id` in `social:createPost` handler

**What to Build:**
Add `source_content_id TEXT` column to `social_posts` table via migration (references discovered_content). Update `CreateSocialPostInput` to accept optional `source_content_id`.

Wire the "Schedule" button on repurpose draft cards:
1. Click → show inline date/time picker (use `<input type="datetime-local">`)
2. On confirm → call `social.createPost({ platform, content: editedDraft, status: 'scheduled', scheduled_at: isoDate, source_content_id: sourceId })`
3. Show success toast: "Scheduled for [platform] at [time]"
4. Update draft card to show "Scheduled ✓" state

This creates the full pipeline: Discover → Save → Repurpose → Edit → Schedule, with source linking at every step.

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Scheduled posts link back to source content. Calendar shows the post with correct source.
CHUNK_13_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_14() {
  local log="$LOG_DIR/chunk-14.log"
  echo -e "${YELLOW}▶ Chunk 14/$TOTAL_CHUNKS: Content Type Distribution Badge + Discover Enhancements${NC}"

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
    -p "$(cat <<'CHUNK_14_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: npm run typecheck && npm run lint

## Research Findings

### [REFERENCE] Content Type Distribution by Platform
```
TikTok:    ~97% video, ~2% slideshow, ~1% image
Instagram: ~30% image, ~40% video/reel, ~30% carousel/sidecar
Twitter/X: ~40% text-only, ~35% text+image, ~25% video
LinkedIn:  ~45% text-only, ~20% image, ~20% carousel, ~15% video
YouTube:   ~100% video
```

## Chunk 14/15: Content Type Distribution Badge + Discover Enhancements

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/social-panel.js` — Discover Search tab rendering, result card layout
- `ui/chat/social-panel.css` — card styles, badge styles
- `src/memory/discovered-content.ts` — cached content queries

**Modify:**
- `ui/chat/social-panel.js` — after search results load, compute content type distribution and render badge; add content type filter dropdown to Discover Search sub-tab
- `ui/chat/social-panel.css` — styles for distribution badge (small pills showing `[Video 78%] [Image 12%] [Carousel 10%]`) and filter dropdown

**What to Build:**
After search results are displayed in the Discover Search tab, compute the content type distribution from cached results (not just the displayed ones — query all cached results for the same query_hash). Display as small colored pills above the results grid.

Add a content type filter dropdown to the Discover Search sub-tab header: "All Types | Video | Image | Carousel | Text". Filtering is client-side against the cached results. If filtering reduces results below the requested count, show hint: "Showing N/M — [type] posts are rare on [platform]".

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. Distribution badge shows after search. Filter dropdown filters displayed results.
CHUNK_14_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

run_chunk_15() {
  local log="$LOG_DIR/chunk-15.log"
  echo -e "${YELLOW}▶ Chunk 15/$TOTAL_CHUNKS: CSS Fix + Final Typecheck + Build + Verify${NC}"

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
    -p "$(cat <<'CHUNK_15_PROMPT'
[Project] neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3), Vanilla JS UI, npm, Vitest
Check: npm run typecheck && npm run lint

## Chunk 15/15: CSS Fix + Final Typecheck + Build + Verify

**Read these files first** (do NOT explore beyond this list):
- `ui/chat/status.css` — corruption at lines 344-347
- `src/social/scraping/cache.ts` — verify cache layer works
- `src/social/transcription/assemblyai.ts` — verify transcription module
- `src/tools/social-tools.ts` — verify all new tools registered

**Modify:**
- `ui/chat/status.css` — remove corrupted lines 344-347

**What to Build:**
Fix the CSS corruption in `status.css` — delete the orphaned lines:
```
t infinite;
}
shimmer 2s ease-in-out infinite;
}
```

Run `npm run typecheck && npm run lint` and fix any errors. Run `npm run build` to verify compilation. Run `npm run test` to check existing tests pass.

Verify:
- Cache layer prevents duplicate Apify calls
- Content type filter works on search results
- Repurpose panel uses actual content data (not raw URL)
- AssemblyAI key row visible in Accounts tab
- Pipeline placeholders show during long operations
- Scheduled posts link to source content
- No TypeScript errors, no lint errors

**Rules:**
- Read ONLY the files listed above. Do NOT explore the codebase.
- Implement ONLY what is described. No extras, no refactoring.
- After implementing: npm run typecheck && npm run lint
- Fix ALL errors before finishing.
- Do NOT ask questions.

**Gate:** `npm run typecheck && npm run lint` passes. `npm run build` succeeds. `npm run test` passes. App launches with `npx electron .`.
CHUNK_15_PROMPT
)$context_section" < /dev/null 2>&1 | tee "$log"
}

# ══════════════════════════════════════════════════════
# MAIN LOOP
# ══════════════════════════════════════════════════════

CHUNK_FUNCTIONS=(
  run_chunk_1
  run_chunk_2
  run_chunk_3
  run_chunk_4
  run_chunk_5
  run_chunk_6
  run_chunk_7
  run_chunk_8
  run_chunk_9
  run_chunk_10
  run_chunk_11
  run_chunk_12
  run_chunk_13
  run_chunk_14
  run_chunk_15
)

CHUNK_NAMES=(
  "Add Cache Columns to discovered_content"
  "Build Cache-Before-Scrape Layer"
  "Content Type Filtering"
  "AssemblyAI CLI Transcription"
  "AssemblyAI Key UI + Validation"
  "Add repurpose to GeneratedContentType + Prompt Template"
  "Fix Panel Repurpose to Use Actual Content"
  "Repurpose Agent Tool"
  "Update Agent System Prompt + Wire Repurpose Events"
  "Pipeline Loading States — Chat Placeholders"
  "Wire Pipeline Events to Placeholders"
  "Repurpose Panel UI Overhaul"
  "Schedule from Repurpose Drafts"
  "Content Type Distribution Badge + Discover Enhancements"
  "CSS Fix + Final Typecheck + Build + Verify"
)

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
