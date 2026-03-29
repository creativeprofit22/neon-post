# Creator Mode + Kie Image Generation Integration

Project: neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + Claude Agent SDK + SQLite
Check: npm run typecheck && npm run lint
Chunks: 6

---

## Chunk 1/6: Add Kie.ai Image Generation Client
**Tier**: sonnet

### Files to Read
- `/mnt/e/Projects/neon-cut/src/llm/kie.ts` — Reference implementation for KieClient (image gen) and KieChatClient
- `/mnt/e/Projects/neon-cut/src/llm/types.ts` — ImageModelId, ImageGenerationRequest, ImageGenerationResult types

### Files to Create
- `src/image/kie-client.ts` — Port of KieClient from neon-cut. Only the image generation part (generate, getStatus, uploadImage). Include the types inline: `ImageModelId = 'nano-banana-2' | 'seedream/5-lite-text-to-image' | 'seedream/5-lite-image-to-image'`, `ImageGenerationRequest { prompt, model, aspectRatio, quality, referenceImages?, outputFormat? }`, `ImageGenerationResult { predictionId, status, imageUrl?, error? }`. API base: `https://api.kie.ai/api/v1`. File upload base: `https://kieai.redpandaai.co`. Use the `buildTaskInput` helper for model-specific payloads. Copy the exact API contract from neon-cut's `src/llm/kie.ts` lines 1-188.
- `src/image/index.ts` — Exports: `generateImage(request, apiKey)`, `getImageStatus(predictionId, apiKey)`, `uploadImage(filePath, apiKey)`, `pollForCompletion(predictionId, apiKey, { maxAttempts?, intervalMs? })`. The poll function should retry getStatus until completed/failed, with default 30 attempts at 2s intervals.

### Files to Modify
- (none)

### What to Build
Port the KieClient image generation client from neon-cut into neon-post. This is the foundational module other chunks depend on. The client must support:
- Creating image generation tasks via `POST /api/v1/jobs/createTask` with Bearer auth
- Polling task status via `GET /api/v1/jobs/recordInfo?taskId=...`
- Uploading reference images via `POST /api/file-stream-upload` to `https://kieai.redpandaai.co`
- Model-specific input building (nano-banana-2 uses `image_input`/`aspect_ratio`/`resolution`/`output_format`; seedream text-to-image uses `aspect_ratio`/`quality`/`nsfw_checker`; seedream image-to-image adds `image_urls`)

### Gate
`npx tsc --noEmit --pretty 2>&1 | head -20` exits 0

---

## Chunk 2/6: Add kie.apiKey Setting + Creator Mode Fix
**Tier**: sonnet

### Files to Read
- `src/settings/schema.ts` — Current settings definitions
- `src/agent/agent-modes.ts` — Creator mode config (line 232-248)
- `ui/chat.html` — Mode select dropdown (line 502-508)

### Files to Create
- (none)

### Files to Modify
- `src/settings/schema.ts` — Add `kie.apiKey` setting to the `api_keys` category. Definition: `{ key: 'kie.apiKey', defaultValue: '', encrypted: true, category: 'api_keys', label: 'Kie.ai API Key', description: 'Your Kie.ai API key for image generation (Nano Banana 2, Seedream 5)', type: 'password' }`. Insert after the `glm.apiKey` entry (around line 102).
- `src/agent/agent-modes.ts` — Change creator mode `engine` from `'chat'` to `'sdk'` (line 236). This enables the full agentic tool loop (file access, shell, browser, web search). Also add `...SCHEDULER_TOOLS` and `...SOUL_TOOLS` to the creator's `allowedTools` array so it can schedule posts and access brand/personality context.
- `ui/chat.html` — Add `<option value="creator">Creator</option>` to the mode-select dropdown (after line 507, the therapist option).

### What to Build
Three small but critical fixes:
1. **Kie API key setting** — Users need a place to configure their Kie.ai key in Settings → API Keys. Add the schema entry.
2. **Creator mode engine** — Change from `'chat'` to `'sdk'` so the agent has full agentic capabilities (can execute tools in a loop, access files, run shell commands, browse the web). `'chat'` mode only does single-turn completions with tool calls but lacks the full agent loop.
3. **Mode selector** — Add the Creator option to the HTML dropdown so users can actually select it from the chat UI.

### Gate
`npm run typecheck && npm run lint` passes

---

## Chunk 3/6: Image Generation Agent Tools
**Tier**: sonnet

### Files to Read
- `src/tools/social-tools.ts` — Existing tool pattern (definition + handler + export)
- `src/tools/index.ts` — How tools are registered in SDK MCP servers (lines 314-342)
- `src/image/kie-client.ts` — The client from chunk 1
- `src/image/index.ts` — The convenience functions from chunk 1

### Files to Create
- (none)

### Files to Modify
- `src/tools/social-tools.ts` — Add 2 new tools at the end of the file, before the `getSocialTools()` export:
  1. `generate_image` — Input: `{ prompt: string, model?: string, aspect_ratio?: string, quality?: string, reference_images?: string }`. Handler: reads `kie.apiKey` from SettingsManager, calls `generateImage()` then `pollForCompletion()` from `src/image/index.ts`. On success, saves to `memoryManager.generatedContent.create({ content_type: 'image', platform: null, prompt_used: prompt, output: prompt, media_url: result.imageUrl })`. Returns JSON with success, imageUrl, predictionId.
  2. `upload_reference_image` — Input: `{ file_path: string }`. Handler: reads `kie.apiKey`, calls `uploadImage()`. Returns JSON with success and uploaded URL.
  Add both to the tools array returned by `getSocialTools()`. Also add the SettingsManager import at top: `import { SettingsManager } from '../settings';` and import from `../image`.
- `src/agent/agent-modes.ts` — Add `'mcp__neon-post__generate_image'` and `'mcp__neon-post__upload_reference_image'` to the `SOCIAL_TOOLS` array.

### What to Build
Add image generation tools to the agent's MCP tool set so when in Creator mode, the agent can generate images and upload reference images. The `generate_image` tool calls Kie.ai via the client from chunk 1 and saves results to the generated_content DB table. The `upload_reference_image` tool lets the agent upload local images for image-to-image generation.

### Gate
`npm run typecheck && npm run lint` passes

---

## Chunk 4/6: Image Generation IPC Handlers
**Tier**: sonnet

### Files to Read
- `src/main/ipc/social-ipc.ts` — Existing IPC handlers for social features
- `src/main/preload.ts` — IPC bridge (lines 247-272)
- `src/image/index.ts` — The convenience functions from chunk 1
- `src/settings/schema.ts` — To access kie.apiKey

### Files to Create
- (none)

### Files to Modify
- `src/main/ipc/social-ipc.ts` — Add two new IPC handlers:
  1. `social:generateImage` — Takes `{ prompt, model?, aspect_ratio?, quality?, reference_images? }`. Reads `kie.apiKey` from SettingsManager, calls `generateImage()` then `pollForCompletion()`, saves result to generatedContent DB, returns `{ success, data: { id, imageUrl, predictionId } }`.
  2. `social:getImageStatus` — Takes `predictionId: string`. Reads `kie.apiKey`, calls `getImageStatus()`, returns the result.
- `src/main/preload.ts` — Add to the `social` object (around line 270):
  ```
  generateImage: (data: Record<string, unknown>) => ipcRenderer.invoke('social:generateImage', data),
  getImageStatus: (predictionId: string) => ipcRenderer.invoke('social:getImageStatus', predictionId),
  ```

### What to Build
Wire up IPC handlers so the renderer process (social panel UI) can trigger image generation directly without going through the agent. This provides a direct UI-to-API path for the social panel's Image tab. Both handlers use the same Kie.ai client from chunk 1. The generateImage handler saves results to the generated_content table so the gallery can display them.

### Gate
`npm run typecheck && npm run lint` passes

---

## Chunk 5/6: Social Panel UI — Image Gen + Gallery + Chat Reflection
**Tier**: sonnet

### Files to Read
- `ui/chat/social-panel.js` — Current image gen button handler (lines 273-309), gallery loader, discover renderer
- `ui/chat/social-panel.css` — Current styles
- `ui/chat.html` — Image panel HTML (lines 1091-1099), Gallery tab (lines 1140-1145)

### Files to Create
- (none)

### Files to Modify
- `ui/chat/social-panel.js` — Multiple changes:
  1. **Image gen handler** (lines 273-309): Replace the `social.generateContent({ content_type: 'image', ... })` call with `social.generateImage({ prompt, model: 'nano-banana-2', aspect_ratio: '1:1', quality: '1K' })`. Update the result handling: on success show `<img src="${result.data.imageUrl}">`, on processing show a polling spinner that checks `social.getImageStatus(result.data.predictionId)` every 2s.
  2. **Gallery tab** (`_socLoadGallery` function): Load generated content via `social.getGenerated()`, filter for items with `media_url`, render as a grid of image cards. Each card shows the image thumbnail, prompt used, content_type badge, creation date, and action buttons (copy URL, delete, favorite/rate).
  3. **Content reflection**: Add a `_socRenderGeneratedCard(item)` helper that builds a card for any generated content (text or image). Used by both gallery and the create tab's output area. When the create tab generates content, also refresh the gallery count badge.
- `ui/chat.html` — Update the Image panel (lines 1091-1099): Add model selector dropdown (`<select id="soc-image-model">` with options: `nano-banana-2`, `seedream/5-lite-text-to-image`, `seedream/5-lite-image-to-image`), aspect ratio selector (`1:1`, `16:9`, `9:16`, `4:3`, `auto`), quality selector (`1K`, `2K`, `4K` for nano; `basic`, `high` for seedream), and a reference image upload input (for image-to-image models). Add a loading spinner element `<div id="soc-image-loading" class="soc-loading hidden">`.
- `ui/chat/social-panel.css` — Add styles for: `.soc-image-grid` (CSS grid, 3 columns), `.soc-image-card` (rounded corners, hover effect, aspect-ratio container), `.soc-loading` (spinner animation), `.soc-image-model-row` (flex row for model/aspect/quality selectors).

### What to Build
Make the social panel's image generation actually work with Kie.ai, and make the gallery tab display generated images. The key UX flow:
1. User goes to Social → Create → Image tab
2. Selects model (nano-banana-2 default), aspect ratio, quality
3. Types a prompt and clicks Generate
4. UI shows spinner while polling Kie.ai for completion
5. On success, shows the generated image inline
6. Image is auto-saved to DB, appears in Gallery tab
7. Gallery shows all generated images in a grid with actions

Also ensure that when the agent generates content via chat (using `generate_image` or `save_content` tools), those results appear in the gallery on next visit — this already works via the DB, just needs the gallery to render image cards properly.

### Gate
`npm run typecheck && npm run lint` passes

---

## Chunk 6/6: Settings UI for Kie.ai API Key
**Tier**: haiku

### Files to Read
- `ui/chat.html` — Settings view, API Keys section (around line 674-700 area where `keys-table` div and key-row divs are)
- `ui/chat/settings-panel.js` — How existing API key fields are rendered/saved

### Files to Modify
- `ui/chat.html` — In the Settings → API Keys section (inside the `<section id="api_keys">` around line 675), add a new `key-row` for Kie.ai after the existing key rows. Follow the same pattern as the existing Moonshot/GLM key rows in the LLM section (lines 647-666): a `key-row` div with `key-info` (name + link to kie.ai), `key-input` with password input `id="kie.apiKey"`, delete button calling `stgDeleteKey('kie.apiKey')`, and a Test button calling `stgValidateKey('kie')`. Also add a subsection title "Kie.ai (Image Generation)" before the key row.

### What to Build
Add the Kie.ai API key input field to the Settings UI so users can configure it. Follow the exact same HTML pattern as the Moonshot and GLM key rows in the LLM section. The settings-panel.js already generically loads/saves any setting that matches by ID, so we just need the HTML element.

### Gate
`npm run lint` passes
