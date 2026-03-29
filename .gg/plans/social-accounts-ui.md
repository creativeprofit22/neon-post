# Social Accounts & API Keys in Social Tab

Project: neon-post at /mnt/e/Projects/neon-post
Stack: Electron + TypeScript + SQLite (better-sqlite3) + vanilla HTML/JS UI
Check: npm run typecheck && npm run lint
Chunks: 4

## Research Findings

### Current State
- **Social panel** exists in `ui/chat.html` (lines 991-1212) with tabs: Discover, Create, Posts, Gallery, Accounts
- **Social panel JS** at `ui/chat/social-panel.js` — calls `window.pocketAgent.social` API but **it doesn't exist in preload**
- **Preload** (`src/main/preload.ts`) has NO `social` section — `_socAPI()` always returns null
- **No IPC handlers** for social accounts in `src/main/ipc/`
- **Backend exists**: `src/memory/social-accounts.ts` has full `SocialAccountsStore` class (create, getAll, getById, getByPlatform, update, delete)
- Memory manager at `src/memory/index.ts` exposes `socialAccounts` property
- Also has `socialPosts`, `discoveredContent`, `generatedContent` stores

### Credential Structure
The `social_accounts` table stores:
- `access_token`, `refresh_token` — direct fields
- `metadata` — JSON string containing platform-specific fields

`src/social/posting/index.ts` `buildCredentialsFromAccount()` (line 100-124) parses metadata JSON for:
- `consumerKey`, `consumerSecret`, `accessTokenSecret` (X/Twitter OAuth 1.0a)
- `clientId`, `clientSecret` (TikTok, YouTube)
- `pageId`, `instagramAccountId` (Instagram/Facebook)

### Platform Credential Requirements
- **X/Twitter**: consumerKey, consumerSecret, accessToken, accessTokenSecret
- **Instagram**: accessToken, pageId, instagramAccountId
- **YouTube**: accessToken, clientId, clientSecret
- **TikTok**: accessToken, clientId, clientSecret
- **LinkedIn**: accessToken only

### Scraping Keys
- `apify.apiKey` — already in settings schema, used by `src/social/scraping/apify.ts` for TikTok/Instagram/YouTube scraping via actors: `clockworks~tiktok-scraper`, `apify~instagram-scraper`, `apify~youtube-scraper`
- `rapidapi.apiKey` — already in settings schema, used by `src/social/scraping/rapidapi.ts` for TikTok scraping via `tiktok-scraper7.p.rapidapi.com`
- Keys retrieved via `SettingsManager.get()` in `src/social/scraping/index.ts`

### Social Panel API Expected Shape
From `ui/chat/social-panel.js`, `_socAPI()` returns `window.pocketAgent.social` and calls:
- `social.listAccounts()` — returns array of accounts
- `social.addAccount({ platform, account_name, display_name })` — returns `{ success, error? }`
- `social.removeAccount(id)` — returns `{ success, error? }`
- `social.searchContent(query, platform)` — search content
- `social.getDiscovered(limit)` — get discovered content
- `social.listPosts(status)` — list social posts
- `social.createPost({...})` — create a post
- `social.getGenerated(limit)` — get generated content
- `social.deleteGenerated(id)` — delete generated content
- `social.favoriteGenerated(id, rating)` — rate generated content
- `social.saveBrand(data)` — save brand voice settings
- `social.getBrand()` — get brand voice
- `social.generateContent({...})` — generate AI content

### IPC Pattern
All existing IPC follows: `src/main/ipc/<domain>-ipc.ts` with `ipcMain.handle('domain:action', ...)` pattern.
Preload uses `ipcRenderer.invoke('domain:action', ...)`.
IPC files are registered from `src/main/ipc/index.ts`. Check how the memory manager is passed/accessed — e.g., `facts-ipc.ts` imports `getMemoryManager` from `src/memory/index.ts`.

---

## Chunk 1/4: Social IPC Handlers — Account CRUD + Scraping Validation
**Tier**: sonnet

### Files to Read
- `src/main/ipc/index.ts` — see how IPC modules are registered
- `src/main/ipc/facts-ipc.ts` — reference pattern for IPC handlers that use memoryManager
- `src/memory/index.ts` — how to access memoryManager and its socialAccounts store
- `src/memory/social-accounts.ts` — SocialAccountsStore API (create, getAll, getById, update, delete)
- `src/settings/index.ts` — SettingsManager for reading/writing apify/rapidapi keys

### Files to Create
- `src/main/ipc/social-ipc.ts` — IPC handlers for social account CRUD + scraping key validation

### Files to Modify
- `src/main/ipc/index.ts` — import and register `registerSocialIpc`

### What to Build

Create `src/main/ipc/social-ipc.ts` with a `registerSocialIpc()` function that registers these `ipcMain.handle` handlers:

**Account CRUD:**
- `social:listAccounts` — calls `memoryManager.socialAccounts.getAll()`, maps each account to return `{ id, platform, account_name, display_name, active, hasCredentials: !!account.access_token, created_at, updated_at }` — do NOT send raw tokens to renderer
- `social:getAccount` — takes `id`, returns full account data INCLUDING tokens (for edit form only)
- `social:addAccount` — takes `{ platform, account_name, display_name?, access_token?, refresh_token?, metadata? }`, calls `memoryManager.socialAccounts.create(...)`, returns `{ success: true, id }` or `{ success: false, error }`
- `social:updateAccount` — takes `id` + update fields, calls `memoryManager.socialAccounts.update(id, ...)`, returns `{ success: true }` or `{ success: false, error }`
- `social:removeAccount` — takes `id`, calls `memoryManager.socialAccounts.delete(id)`, returns `{ success: true }` or `{ success: false, error }`

**Scraping key validation:**
- `social:validateApifyKey` — takes apiKey string, makes test request to `https://api.apify.com/v2/user/me` with `Authorization: Bearer ${apiKey}`, returns `{ valid: true/false, error? }`
- `social:validateRapidAPIKey` — takes apiKey string, makes test request to RapidAPI TikTok endpoint (`https://tiktok-scraper7.p.rapidapi.com/user/info` with headers `X-RapidAPI-Key` and `X-RapidAPI-Host: tiktok-scraper7.p.rapidapi.com`), returns `{ valid: true/false, error? }`

**Brand voice:**
- `social:saveBrand` — takes brand data object, stores as JSON in settings key `social.brand` via `SettingsManager.set()`
- `social:getBrand` — reads from settings key `social.brand`, parses JSON, returns brand object or null

All handlers wrapped in try/catch returning `{ success: false, error: message }` on failure.

Register in `src/main/ipc/index.ts` — import `registerSocialIpc` and call it alongside the other register functions.

### Gate
`npm run typecheck && npm run lint`

---

## Chunk 2/4: Social IPC — Content Operations + Preload Wiring
**Tier**: sonnet

### Files to Read
- `src/main/ipc/social-ipc.ts` — chunk 1 output, add more handlers here
- `src/memory/social-posts.ts` — SocialPostsStore API
- `src/memory/generated-content.ts` — GeneratedContentStore API
- `src/memory/discovered-content.ts` — DiscoveredContentStore API
- `src/social/scraping/index.ts` — `searchContent()` function signature
- `src/main/preload.ts` — add social section to pocketAgent

### Files to Modify
- `src/main/ipc/social-ipc.ts` — add content operation handlers
- `src/main/preload.ts` — add `social: { ... }` section to `pocketAgent` contextBridge

### What to Build

**Add content IPC handlers to `social-ipc.ts`:**
- `social:searchContent` — takes `(query, platform)`, calls `searchContent()` from `src/social/scraping/index.ts`, returns results array or error
- `social:getDiscovered` — takes `limit`, calls `memoryManager.discoveredContent.getRecent(limit)`, returns array
- `social:listPosts` — takes optional `status` filter, calls appropriate socialPosts method, returns array
- `social:createPost` — takes post data, calls `memoryManager.socialPosts.create(...)`, returns `{ success: true, id }`
- `social:getGenerated` — takes `limit`, calls `memoryManager.generatedContent.getRecent(limit)`, returns array
- `social:deleteGenerated` — takes `id`, deletes, returns success/error
- `social:favoriteGenerated` — takes `(id, rating)`, updates rating, returns success/error
- `social:generateContent` — takes `{ content_type, platform, prompt_used }`, calls content generation from `src/social/content/`, returns generated content or error

**Add `social` section to preload** (`src/main/preload.ts`), inside the `contextBridge.exposeInMainWorld('pocketAgent', { ... })` object, after the last existing section (e.g., after `permissions` or `events`):

```typescript
social: {
  listAccounts: () => ipcRenderer.invoke('social:listAccounts'),
  getAccount: (id: string) => ipcRenderer.invoke('social:getAccount', id),
  addAccount: (data: Record<string, unknown>) => ipcRenderer.invoke('social:addAccount', data),
  updateAccount: (id: string, data: Record<string, unknown>) => ipcRenderer.invoke('social:updateAccount', id, data),
  removeAccount: (id: string) => ipcRenderer.invoke('social:removeAccount', id),
  searchContent: (query: string, platform?: string) => ipcRenderer.invoke('social:searchContent', query, platform),
  getDiscovered: (limit?: number) => ipcRenderer.invoke('social:getDiscovered', limit),
  listPosts: (status?: string) => ipcRenderer.invoke('social:listPosts', status),
  createPost: (data: Record<string, unknown>) => ipcRenderer.invoke('social:createPost', data),
  getGenerated: (limit?: number) => ipcRenderer.invoke('social:getGenerated', limit),
  deleteGenerated: (id: string) => ipcRenderer.invoke('social:deleteGenerated', id),
  favoriteGenerated: (id: string, rating: number) => ipcRenderer.invoke('social:favoriteGenerated', id, rating),
  saveBrand: (data: Record<string, unknown>) => ipcRenderer.invoke('social:saveBrand', data),
  getBrand: () => ipcRenderer.invoke('social:getBrand'),
  generateContent: (data: Record<string, unknown>) => ipcRenderer.invoke('social:generateContent', data),
  validateApifyKey: (key: string) => ipcRenderer.invoke('social:validateApifyKey', key),
  validateRapidAPIKey: (key: string) => ipcRenderer.invoke('social:validateRapidAPIKey', key),
},
```

Also add it to the TypeScript declaration block at the bottom of preload.ts (the `declare global` / `Window` interface section) so types are correct.

### Gate
`npm run typecheck && npm run lint`

---

## Chunk 3/4: Accounts Tab UI — Platform Credentials + Scraping Keys
**Tier**: sonnet

### Files to Read
- `ui/chat.html` — lines 1147-1180 (current Accounts tab HTML, the `soc-tab-accounts` section)
- `ui/chat/social-panel.js` — lines 392-426 (addAccount handler) and 625-657 (loadAccounts)
- `ui/chat/social-panel.css` — existing styles to extend
- `src/social/posting/types.ts` — PlatformCredentials interface (reference for field names)

### Files to Modify
- `ui/chat.html` — Replace the `soc-tab-accounts` content with enhanced version
- `ui/chat/social-panel.js` — Update account loading, add form handling, scraping keys logic
- `ui/chat/social-panel.css` — Add styles for credential fields, scraping keys, status badges

### What to Build

**Replace the Accounts tab HTML** in `ui/chat.html` (the `<div class="soc-tab-content" id="soc-tab-accounts">` section, lines ~1148-1210). New structure:

```html
<!-- Connected Accounts -->
<span class="soc-section-title">Connected Accounts</span>
<div id="soc-accounts-list" class="soc-accounts-list"></div>

<!-- Add / Edit Account -->
<span class="soc-section-title soc-mt-12" id="soc-account-form-title">Add Account</span>
<div class="soc-add-account-form" id="soc-account-form">
  <!-- Common fields -->
  <div class="soc-form-row">
    <div class="soc-form-group">
      <label>Platform</label>
      <select id="soc-account-platform">
        <option value="tiktok">TikTok</option>
        <option value="youtube">YouTube</option>
        <option value="instagram">Instagram</option>
        <option value="twitter">X / Twitter</option>
        <option value="linkedin">LinkedIn</option>
      </select>
    </div>
    <div class="soc-form-group">
      <label>Username</label>
      <input type="text" id="soc-account-username" placeholder="@username">
    </div>
    <div class="soc-form-group">
      <label>Display Name</label>
      <input type="text" id="soc-account-display" placeholder="Optional">
    </div>
  </div>

  <!-- Platform credential fields (all hidden by default, shown by JS) -->
  <!-- All platforms: Access Token -->
  <div class="soc-cred-group" id="soc-cred-access-token">
    <div class="soc-form-group">
      <label>Access Token</label>
      <input type="password" id="soc-account-access-token" placeholder="Access Token" autocomplete="off">
    </div>
  </div>

  <!-- X/Twitter specific -->
  <div class="soc-cred-group soc-cred-twitter" style="display:none">
    <div class="soc-form-row">
      <div class="soc-form-group"><label>Consumer Key</label><input type="password" id="soc-account-consumer-key" placeholder="API Key" autocomplete="off"></div>
      <div class="soc-form-group"><label>Consumer Secret</label><input type="password" id="soc-account-consumer-secret" placeholder="API Secret" autocomplete="off"></div>
    </div>
    <div class="soc-form-group"><label>Access Token Secret</label><input type="password" id="soc-account-access-token-secret" placeholder="OAuth 1.0a Token Secret" autocomplete="off"></div>
  </div>

  <!-- Instagram specific -->
  <div class="soc-cred-group soc-cred-instagram" style="display:none">
    <div class="soc-form-row">
      <div class="soc-form-group"><label>Page ID</label><input type="text" id="soc-account-page-id" placeholder="Facebook Page ID"></div>
      <div class="soc-form-group"><label>Instagram Account ID</label><input type="text" id="soc-account-ig-id" placeholder="Business Account ID"></div>
    </div>
  </div>

  <!-- TikTok / YouTube specific -->
  <div class="soc-cred-group soc-cred-client" style="display:none">
    <div class="soc-form-row">
      <div class="soc-form-group"><label>Client ID</label><input type="password" id="soc-account-client-id" placeholder="Client ID" autocomplete="off"></div>
      <div class="soc-form-group"><label>Client Secret</label><input type="password" id="soc-account-client-secret" placeholder="Client Secret" autocomplete="off"></div>
    </div>
  </div>

  <!-- Buttons -->
  <div class="soc-form-row soc-mt-12">
    <button class="soc-btn soc-btn-primary" id="soc-account-save-btn">Add Account</button>
    <button class="soc-btn soc-btn-secondary" id="soc-account-cancel-btn" style="display:none">Cancel</button>
  </div>
</div>

<!-- Scraping API Keys -->
<span class="soc-section-title soc-mt-12">Scraping API Keys</span>
<p class="soc-hint">Required for TikTok & Instagram content discovery in the Discover tab.</p>
<div class="soc-scraping-keys">
  <div class="soc-key-row">
    <div class="soc-key-info"><span class="soc-key-name">Apify</span><span class="soc-key-desc">TikTok, Instagram & YouTube scraping</span></div>
    <div class="soc-key-input">
      <input type="password" id="soc-apify-key" placeholder="apify_api_..." autocomplete="off">
      <button class="soc-btn soc-btn-sm" id="soc-apify-test-btn">Test</button>
      <button class="soc-btn soc-btn-sm soc-btn-primary" id="soc-apify-save-btn">Save</button>
      <span id="soc-apify-status" class="soc-key-status"></span>
    </div>
  </div>
  <div class="soc-key-row">
    <div class="soc-key-info"><span class="soc-key-name">RapidAPI</span><span class="soc-key-desc">Alternative TikTok scraping (TikTok Scraper 7)</span></div>
    <div class="soc-key-input">
      <input type="password" id="soc-rapidapi-key" placeholder="Your RapidAPI key..." autocomplete="off">
      <button class="soc-btn soc-btn-sm" id="soc-rapidapi-test-btn">Test</button>
      <button class="soc-btn soc-btn-sm soc-btn-primary" id="soc-rapidapi-save-btn">Save</button>
      <span id="soc-rapidapi-status" class="soc-key-status"></span>
    </div>
  </div>
</div>
```

Keep the existing **Brand Voice** section below the scraping keys (it's already at the bottom of the accounts tab).

**Update `social-panel.js`:**

1. Add platform field toggle function — when `#soc-account-platform` changes, show/hide the relevant `.soc-cred-*` groups:
   - `twitter` → show `.soc-cred-twitter`
   - `instagram` → show `.soc-cred-instagram`
   - `tiktok` / `youtube` → show `.soc-cred-client`
   - `linkedin` → hide all extra (just access token)
   - Access token group always visible

2. Update `_socLoadAccounts()` — render each account with credential status badge:
   - Green dot + "Connected" if `hasCredentials` is true
   - Yellow dot + "No credentials" if false
   - Add edit button (pencil icon) alongside remove button

3. Add edit account flow:
   - `socPanelActions.editAccount(id)` — calls `social.getAccount(id)` to get full data including tokens, populates form, changes button text to "Save Changes", shows Cancel button, stores editing ID
   - Cancel resets form back to "Add Account" mode
   - Save detects if editing (has stored ID) and calls `social.updateAccount(id, data)` instead of `addAccount`

4. Update save handler to collect all credential fields and build the `metadata` JSON:
   ```javascript
   const metadata = {};
   if (platform === 'twitter') {
     if (consumerKey) metadata.consumerKey = consumerKey;
     if (consumerSecret) metadata.consumerSecret = consumerSecret;
     if (accessTokenSecret) metadata.accessTokenSecret = accessTokenSecret;
   }
   if (platform === 'instagram') {
     if (pageId) metadata.pageId = pageId;
     if (instagramAccountId) metadata.instagramAccountId = instagramAccountId;
   }
   if (platform === 'tiktok' || platform === 'youtube') {
     if (clientId) metadata.clientId = clientId;
     if (clientSecret) metadata.clientSecret = clientSecret;
   }
   ```

5. Add scraping keys handlers:
   - On accounts tab load, fetch `pocketAgent.settings.get('apify.apiKey')` and `pocketAgent.settings.get('rapidapi.apiKey')` — if value exists, show masked placeholder "••••••••" in input
   - Test buttons call `pocketAgent.social.validateApifyKey(key)` / `validateRapidAPIKey(key)` and show result status
   - Save buttons call `pocketAgent.settings.set('apify.apiKey', value)` etc.

**Add CSS to `social-panel.css`:**
- `.soc-cred-group` — margin, padding for credential field sections
- `.soc-scraping-keys` — styled like a settings grid (similar to Neon Post settings page `.keys-table`)
- `.soc-key-row` — flex row with key info + input
- `.soc-key-status` — inline status indicator (✓ valid, ✗ invalid)
- `.soc-hint` — small muted description text
- `.soc-account-status` — green/yellow dot indicator in account rows
- `.soc-btn-secondary` — ghost/outline button style for Cancel

### Gate
`npm run typecheck && npm run lint`

---

## Chunk 4/4: Build Verification & Integration Polish
**Tier**: sonnet

### Files to Read
- `src/main/ipc/social-ipc.ts` — verify all handlers work
- `src/main/preload.ts` — verify social API shape and types
- `ui/chat/social-panel.js` — verify all API calls match IPC channels
- `ui/chat.html` — verify HTML element IDs match JS selectors

### Files to Modify
- `src/main/ipc/social-ipc.ts` — any fixes needed after build verification
- `ui/chat/social-panel.js` — any wiring fixes

### What to Build

1. Run `npm run build` and fix any compilation errors
2. Run `npm run typecheck && npm run lint` and fix all issues
3. Verify IPC handler parameter signatures match what preload sends
4. Verify social-panel.js element selectors (`#soc-account-platform`, `#soc-apify-key`, etc.) match the HTML IDs in chat.html
5. Ensure `social:listAccounts` strips tokens but includes `hasCredentials` boolean
6. Ensure `social:getAccount` returns full data with tokens for edit form
7. Ensure error handling is consistent across all handlers

### Gate
`npm run build && npm run typecheck && npm run lint`
