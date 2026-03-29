# Image Generation Fixes — Background Poll, Gallery Save, Chat Render

Project: neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + Claude Agent SDK + SQLite
Check: npm run typecheck && npm run lint
Chunks: 4

## Research Findings

### Root Cause: Why background poll/save/notification doesn't work

The `generate_image` tool runs inside an **SDK MCP server** created via `createSdkMcpServer()` in `src/tools/index.ts`. Tool handlers run in the **main Electron process** (in-process MCP server communicating with SDK subprocess via stdio). So `memoryManager`, `Notification`, and `setTimeout` should all work.

**Most likely failures:**
1. **`getStatus` API call failing silently** — the catch block logs and retries, but if Kie API errors consistently (auth, network), it retries until maxWait then gives up without saving.
2. **`showNotification` crashing** — imported from `./macos` which uses Electron's `Notification`. If this crashes, the whole poll chain aborts.
3. **Gallery doesn't auto-refresh** — even if saved to DB, the gallery UI only loads on tab navigation. No auto-refresh mechanism.

**Solution:** Create a centralized **ImageJobTracker** in the main process that:
1. Manages all pending image jobs with a single `setInterval` (30s)
2. On completion: saves to gallery DB, shows Electron Notification, pushes image to chat UI via `webContents.send()`
3. Both the tool handler AND the IPC handler just submit + register the job, return instantly

---

## Chunk 1/4: Create ImageJobTracker
**Tier**: sonnet

### Files to Read
- `src/image/kie-client.ts` — KieClient API, getStatus method, ImageGenerationResult type
- `src/memory/generated-content.ts` — GeneratedContentStore.create() signature
- `src/image/index.ts` — current exports to extend

### Files to Create
- `src/image/job-tracker.ts` — ImageJobTracker class

### Files to Modify
- `src/image/index.ts` — re-export ImageJobTracker and related types

### What to Build
Create `src/image/job-tracker.ts`:

```ts
import { EventEmitter } from 'events';
import { Notification } from 'electron';
import { KieClient } from './kie-client';
import type { MemoryManager } from '../memory';

interface PendingJob {
  predictionId: string;
  prompt: string;
  model: string;
  aspectRatio?: string;
  quality?: string;
  platform?: string;
  createdAt: number;
}

interface ImageReadyEvent {
  predictionId: string;
  imageUrl: string;
  savedId: string | null;
  prompt: string;
}

interface ImageFailedEvent {
  predictionId: string;
  error: string;
  prompt: string;
}

class ImageJobTracker extends EventEmitter {
  private jobs = new Map<string, PendingJob>();
  private timer: NodeJS.Timeout | null = null;
  private client: KieClient | null = null;
  private memory: MemoryManager | null = null;
  private static POLL_INTERVAL = 30_000;
  private static MAX_AGE = 600_000; // 10 min

  init(apiKey: string, memoryManager: MemoryManager): void
  // Sets client and memory. Can be called again if apiKey changes.

  track(job: Omit<PendingJob, 'createdAt'>): void
  // Adds job to map, starts timer if not running

  private startTimer(): void
  // setInterval at 30s, calls pollAll

  private stopTimer(): void
  // clearInterval when no jobs left

  private async pollAll(): Promise<void>
  // Iterates all jobs, calls client.getStatus for each
  // On 'completed': save to gallery, emit 'image:ready', show Notification, remove job
  // On 'failed': emit 'image:failed', show Notification, remove job
  // On timeout (job.createdAt + MAX_AGE < now): emit 'image:failed' with timeout msg, remove job
  // If jobs.size === 0 after iteration, stopTimer

  private saveToGallery(job: PendingJob, imageUrl: string): string | null
  // memory.generatedContent.create({ content_type: 'image', platform: job.platform ?? null, prompt_used: job.prompt, output: job.prompt, media_url: imageUrl, metadata: JSON.stringify({ model: job.model, aspect_ratio: job.aspectRatio, quality: job.quality, prediction_id: job.predictionId }) })

  private notify(title: string, body: string): void
  // Electron Notification.isSupported() check, new Notification({ title, body }).show(), wrapped in try/catch

  destroy(): void
  // stopTimer, clear jobs
}
```

Key behaviors:
- Single `setInterval` at 30s polls ALL pending jobs (efficient)
- Timer only active when jobs exist
- 10 min max age per job before giving up
- Emits typed events: `'image:ready'` and `'image:failed'`
- Defensive: every API call wrapped in try/catch, notification failures non-critical

### Gate
`npm run typecheck && npm run lint` passes

---

## Chunk 2/4: Wire tracker into main process + simplify tool/IPC handlers
**Tier**: sonnet

### Files to Read
- `src/image/job-tracker.ts` — tracker from chunk 1
- `src/main/index.ts` — app init flow
- `src/main/windows.ts` — how to get chat window reference for webContents.send

### Files to Modify
- `src/main/index.ts` — create tracker during init, wire events to chat window
- `src/main/ipc/social-ipc.ts` — simplify generateImage: submit + tracker.track() + return. Remove `ipcImagePollAndSave`.
- `src/tools/social-tools.ts` — simplify handleGenerateImage: submit + tracker.track() + return. Remove `backgroundPollAndSave`, `saveImageToGallery`, `showNotification` import.

### What to Build

1. **`src/main/index.ts`** — after memory init and settings loaded:
   ```ts
   import { ImageJobTracker } from '../image';
   const imageTracker = new ImageJobTracker();
   // Init when API key available
   const kieKey = SettingsManager.get('kie.apiKey');
   if (kieKey && memoryManager) imageTracker.init(kieKey, memoryManager);
   // Forward events to chat renderer
   imageTracker.on('image:ready', (data) => {
     chatWindow?.webContents.send('image:ready', data);
   });
   imageTracker.on('image:failed', (data) => {
     chatWindow?.webContents.send('image:failed', data);
   });
   // Export for tools
   export { imageTracker };
   ```
   Or use a setter pattern like `setSocialMemoryManager` to make tracker accessible from tools.

2. **`src/tools/social-tools.ts`**:
   - Add `let imageTracker: ImageJobTracker | null = null;` + setter `setImageJobTracker(t)`
   - `handleGenerateImage`: submit to Kie via KieClient, call `imageTracker.track(...)`, return JSON with `{ success: true, predictionId, status: 'generating', message: '...' }`
   - Delete `backgroundPollAndSave`, `saveImageToGallery` functions
   - Remove `import { showNotification }` 

3. **`src/main/ipc/social-ipc.ts`**:
   - Accept `imageTracker` in deps or import
   - `social:generateImage`: create KieClient, call generate(), call `imageTracker.track(...)`, return `{ success: true, predictionId, status: 'generating' }`
   - Delete `ipcImagePollAndSave` function
   - Remove unused imports (`Notification`, `ImageGenerationResult`, `MemoryManager`)

### Gate
`npm run typecheck && npm run lint` passes

---

## Chunk 3/4: Add preload bridge for image events
**Tier**: haiku

### Files to Read
- `src/main/preload.ts` — existing IPC bridge structure

### Files to Modify
- `src/main/preload.ts` — add image event listeners to the bridge

### What to Build
Add to the `contextBridge.exposeInMainWorld` object:

```ts
onImageReady: (callback: (data: { predictionId: string; imageUrl: string; savedId: string | null; prompt: string }) => void) => {
  ipcRenderer.on('image:ready', (_, data) => callback(data));
},
onImageFailed: (callback: (data: { predictionId: string; error: string; prompt: string }) => void) => {
  ipcRenderer.on('image:failed', (_, data) => callback(data));
},
```

### Gate
`npm run typecheck && npm run lint` passes

---

## Chunk 4/4: Render generated images inline in chat
**Tier**: sonnet

### Files to Read
- `ui/chat/message-renderer.js` — how messages are rendered, existing image handling
- `ui/chat/global-chat.js` — event handling, how to hook into the chat flow
- `ui/chat/chat.css` — existing styles to match

### Files to Modify
- `ui/chat/message-renderer.js` — add `renderGeneratedImage(data)` function that inserts an image bubble into chat
- `ui/chat/global-chat.js` — listen for `window.electronAPI.onImageReady` and `onImageFailed`, call renderer
- `ui/chat/chat.css` — add styles for `.generated-image-bubble`

### What to Build

1. **`ui/chat/global-chat.js`** — in init or DOMContentLoaded:
   ```js
   if (window.electronAPI?.onImageReady) {
     window.electronAPI.onImageReady((data) => {
       renderGeneratedImage(data); // from message-renderer.js
     });
   }
   if (window.electronAPI?.onImageFailed) {
     window.electronAPI.onImageFailed((data) => {
       renderImageError(data);
     });
   }
   ```

2. **`ui/chat/message-renderer.js`** — new exported functions:
   ```js
   function renderGeneratedImage({ imageUrl, prompt, savedId }) {
     // Create assistant-style message bubble
     // Contains: <img src="imageUrl"> with max-width, rounded corners
     // Caption: truncated prompt text
     // Badge: "✓ Saved to gallery"
     // Click image → open in new window / lightbox
     // Append to chat messages container, scroll to bottom
   }
   
   function renderImageError({ error, prompt }) {
     // Create assistant-style error bubble
     // Shows: "❌ Image generation failed: {error}"
     // Append to chat, scroll to bottom
   }
   ```

3. **`ui/chat/chat.css`** — styles:
   ```css
   .generated-image-bubble { max-width: 420px; border-radius: 12px; overflow: hidden; }
   .generated-image-bubble img { width: 100%; cursor: pointer; display: block; }
   .generated-image-bubble .caption { padding: 8px 12px; font-size: 13px; color: var(--text-secondary); }
   .generated-image-bubble .badge { font-size: 11px; color: var(--accent); }
   ```

### Gate
`npm run typecheck && npm run lint` passes

---
