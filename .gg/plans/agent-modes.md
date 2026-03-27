# Agent Modes — Specialized Agent Personas with Tool-Scoped Switching

## Summary

Expand the existing 2-mode system (`general` | `coder`) into a multi-agent mode system where each mode has:
- A powerful, concise system prompt with actionable guidelines
- Scoped tool access (not every agent gets every tool)
- A `switch_agent` tool the agent can call mid-conversation to route dynamically
- **Shared context** — conversation history carries over on switch (same session, just new system prompt + tools)
- UI tabs visible in the mode toggle area showing available agents

## Current Architecture

- **Mode type**: `'general' | 'coder'` — stored per-session in SQLite `sessions.mode` column
- **Mode switching**: Currently locked after first message (`setSessionMode` in `agent-ipc.ts:183`)
- **System prompt assembly**:
  - **Coder mode**: Uses SDK `claude_code` preset + CLAUDE.md from workspace. Lean — no identity/personality/facts injection.
  - **General mode**: Injects identity, user context, system guidelines, temporal context, facts, soul, daily logs via `options-builder.ts` and `chat-engine.ts`
- **Tool scoping**: Already exists — `options-builder.ts:310-366` has separate `allowedTools` for coder vs general. `buildSdkMcpServers` in `tools/index.ts:109` also filters by mode.
- **Session routing**: `processMessage` in `index.ts:620-638` checks `sessionMode` and routes to ChatEngine (general) or PersistentSDKSession (coder).

## Design

### 1. Agent Mode Definitions — `src/agent/agent-modes.ts` (NEW)

Define all agent modes as a registry. Each mode specifies:

```ts
interface AgentMode {
  id: string;                    // 'general' | 'coder' | 'researcher' | 'writer' | 'analyst'
  name: string;                  // Display name: "General", "Coder", etc.
  icon: string;                  // Emoji for tab display: 🐾 🔧 🔍 ✍️ 📊
  engine: 'chat' | 'sdk';       // Which engine processes messages
  systemPrompt: string;          // Mode-specific system prompt (injected alongside identity/context)
  allowedTools: string[];        // Scoped tool list (SDK tool names + MCP tool names)
  mcpServers?: string[];         // Which MCP servers to register ('neon-post', 'grep', etc.)
  description: string;           // One-line description shown in UI
}
```

**Modes to ship:**

| ID | Name | Engine | Key Tools | What it does |
|---|---|---|---|---|
| `general` | General | chat | memory, soul, scheduler, browser, notify, shell, web_search, web_fetch | Personal assistant — remembers, schedules, browses, manages life |
| `coder` | Coder | sdk | Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, browser, grep.app, project | Full coding agent with file access and GitHub search |
| `researcher` | Researcher | sdk | Read, Write, Bash, Grep, Glob, WebSearch, WebFetch, browser, memory, daily_log | Deep research — web search, browsing, note-taking. No code editing focus. |
| `writer` | Writer | chat | memory, soul, daily_log, shell (read-only), notify | Focused writing — no web search, no browser distractions. Uses memory for voice/style. Shell for reading reference files only. |
| `analyst` | Analyst | sdk | Read, Bash, Grep, Glob, WebSearch, WebFetch, browser, memory, scheduler | Data analysis — reads files, runs scripts, browses for data. No Write/Edit (doesn't modify code). |

### 2. System Prompts — Concise & Powerful

Each mode gets a focused system prompt. These are NOT generic ("you are a writer"). They are operational directives. All prompts include a **shared switching block** appended at the end.

**Shared switching block** (appended to every mode's prompt):

```
## Agent Switching

You have access to `switch_agent` to change your operating mode. Switch when the conversation naturally shifts to a domain better handled by a specialist. Current available agents: General (🐾), Coder (🔧), Researcher (🔍), Writer (✍️), Analyst (📊).

Switch when:
- User asks you to code something → Coder
- User wants research, comparison, or deep-dive → Researcher  
- User wants drafting, editing, or content creation → Writer
- User asks for data analysis, metrics, or reporting → Analyst
- User wants general conversation, scheduling, or life management → General

Do NOT switch for trivial requests that your current mode can handle. Only switch when the task clearly belongs to another agent's specialty.
```

**Example — Researcher prompt:**
```
## Researcher Mode

You are operating as a research specialist. Your job is to find, verify, synthesize, and document information thoroughly.

**How you work:**
- Start by understanding what the user actually needs to know and why
- Search broadly first, then narrow. Use web_search for discovery, browser for deep reading
- Cross-reference claims across multiple sources — never trust a single source
- Save key findings to memory as you go (don't wait until the end)
- Log research progress in daily_log so context persists across sessions
- Present findings with sources, confidence levels, and what you couldn't verify

**Output format:** Lead with the answer, then supporting evidence. Use bullet points. Cite sources. Flag uncertainties explicitly.

**You do NOT:** Write code, edit files, manage schedules, or do creative writing. If the user needs those, switch to the appropriate agent.
```

**Example — Writer prompt:**
```
## Writer Mode

You are operating as a writing specialist. Your job is to draft, edit, refine, and produce polished written content.

**How you work:**
- Ask clarifying questions about audience, tone, and purpose before drafting
- Check soul memory for communication style preferences — match the user's voice
- Check facts for relevant context about the user's projects, brand, or audience
- Draft in full, not outlines (unless asked). Produce publication-ready output.
- When editing, explain what you changed and why
- For long pieces, structure with clear sections and transitions

**Writing principles:** Be direct. Cut filler. Every sentence earns its place. Match the user's voice, not a generic AI tone.

**You do NOT:** Search the web, browse pages, run code, or manage schedules. If the user needs research before writing, switch to Researcher first. If they need code, switch to Coder.
```

### 3. `switch_agent` Tool — `src/tools/agent-mode-tools.ts` (NEW)

A new MCP tool registered in **all** modes:

```ts
{
  name: 'switch_agent',
  description: 'Switch to a different agent mode. The conversation continues with the same context. Use when the task clearly belongs to another agent specialty.',
  input_schema: {
    properties: {
      mode: { type: 'string', enum: ['general', 'coder', 'researcher', 'writer', 'analyst'] },
      reason: { type: 'string', description: 'Brief reason for switching (shown to user)' }
    },
    required: ['mode', 'reason']
  }
}
```

**Implementation:**
1. Tool handler calls `AgentManager.switchSessionMode(sessionId, newMode)`
2. `switchSessionMode` updates the DB (`sessions.mode`)
3. **Kills the current PersistentSDKSession / ChatEngine for that session**
4. On the next message (which the agent will send as its "handoff" response), `processMessage` picks up the new mode and creates a fresh session with the new system prompt + tools
5. Since we're using `resume` with `sdkSessionId`, the conversation history stays intact — the SDK picks up from the same session
6. Emits `agent:modeChanged` event so the UI updates the mode indicator on the tab

**Key detail: Context continuity.** The switch does NOT clear conversation history. The new mode inherits all messages. The only thing that changes is:
- System prompt (new mode's prompt replaces old)
- Available tools (scoped to new mode)
- MCP servers (re-registered for new mode)

For **SDK-engine modes** (coder, researcher, analyst): The `PersistentSDKSession` is killed and a new one is created with `resume: sdkSessionId`. The SDK resumes the same conversation but with new options.

For **chat-engine modes** (general, writer): The `ChatEngine` already rebuilds the system prompt on every message, so it naturally picks up the new mode's prompt.

For **cross-engine switches** (e.g., general→coder or coder→writer): Kill the current engine's session. The next `processMessage` will route to the correct engine. Conversation messages are in SQLite regardless of engine, so they're preserved.

### 4. Database Change

Expand the `mode` column to support new values:

```sql
-- sessions.mode currently stores 'general' | 'coder'
-- Expand to also store: 'researcher' | 'writer' | 'analyst'
-- No migration needed — it's a TEXT column, just update the TypeScript types
```

Update types in:
- `src/memory/sessions.ts` — `getSessionMode` / `setSessionMode` return/accept the union type
- `src/memory/index.ts` — same
- `src/agent/index.ts` — `mode` field and all references
- `src/main/ipc/agent-ipc.ts` — validation in `setSessionMode` handler

### 5. Options Builder Changes — `src/agent/options-builder.ts`

`buildPersistentOptions` currently branches on `isCoder`. Refactor to use the mode registry:

1. Import `AGENT_MODES` from `agent-modes.ts`
2. Look up the mode config: `const modeConfig = AGENT_MODES[sessionMode]`
3. Use `modeConfig.systemPrompt` as an additional static part (after identity + user context)
4. Use `modeConfig.allowedTools` instead of the hardcoded lists at lines 310-366
5. Use `modeConfig.mcpServers` to control which MCP servers are registered
6. The switching block is appended to ALL mode prompts automatically

### 6. Tools Registration — `src/tools/index.ts`

`buildSdkMcpServers` currently takes `mode: 'general' | 'coder'`. Change to:

1. Accept the full mode ID string
2. Look up the mode's tool list from `AGENT_MODES`
3. Only register MCP tools that are in the mode's `allowedTools`
4. Always register `switch_agent` tool (available in all modes)

### 7. UI Changes — `ui/chat.html`

**Replace the 2-button mode toggle with a mode selector:**

Currently at line 4007-4011:
```html
<div class="mode-toggle">
  <button class="mode-btn" id="mode-btn-general">General</button>
  <button class="mode-btn active" id="mode-btn-coder">Coder</button>
</div>
```

Replace with a row of mode buttons (5 agents):
```html
<div class="mode-toggle">
  <button class="mode-btn" data-mode="general" title="Personal assistant">🐾</button>
  <button class="mode-btn active" data-mode="coder" title="Coding agent">🔧</button>
  <button class="mode-btn" data-mode="researcher" title="Deep research">🔍</button>
  <button class="mode-btn" data-mode="writer" title="Writing specialist">✍️</button>
  <button class="mode-btn" data-mode="analyst" title="Data analysis">📊</button>
</div>
```

- Compact: icons only with tooltips, no text labels
- Same lock behavior: locked after first message (but agent can switch via tool)
- When agent switches mode via `switch_agent` tool, the UI updates the active button reactively via the `agent:modeChanged` IPC event

**Tab indicator:** Show the current mode icon in the tab alongside the name. In `renderTabs()` after the nameSpan, add a small mode icon span showing the emoji for that session's current mode.

### 8. IPC Updates — `src/main/ipc/agent-ipc.ts`

- Update `agent:setSessionMode` validation to accept all 5 modes
- Add a new handler: `agent:getAvailableModes` that returns the mode registry (for UI rendering)
- Update `agent:modeChanged` broadcast to include mode details (icon, name)

### 9. Preload Updates — `src/main/preload.ts`

- Update type for `setSessionMode` mode parameter
- Add `getAvailableModes` to the preload API

## File Changes Summary

| File | Change |
|---|---|
| `src/agent/agent-modes.ts` | **NEW** — Mode registry with prompts, tools, icons |
| `src/tools/agent-mode-tools.ts` | **NEW** — `switch_agent` tool implementation |
| `src/agent/options-builder.ts` | Refactor to use mode registry for prompts + tools |
| `src/agent/index.ts` | Expand mode type, add `switchSessionMode()` method |
| `src/agent/chat-engine.ts` | Inject mode-specific prompt from registry |
| `src/tools/index.ts` | Filter MCP tools by mode config |
| `src/memory/sessions.ts` | Expand mode type in getSessionMode/setSessionMode |
| `src/memory/index.ts` | Update mode type references |
| `src/main/ipc/agent-ipc.ts` | Accept new modes, add `getAvailableModes` |
| `src/main/preload.ts` | Update types, add `getAvailableModes` |
| `ui/chat.html` | Replace 2-button toggle with 5-icon selector, show mode in tabs |
| `src/config/system-guidelines.ts` | No change — stays as-is, injected in general mode only |

## Implementation Order

1. **`src/agent/agent-modes.ts`** — Define the registry (all other files depend on this)
2. **`src/memory/sessions.ts`** + **`src/memory/index.ts`** — Expand mode type
3. **`src/tools/agent-mode-tools.ts`** — Build the `switch_agent` tool
4. **`src/tools/index.ts`** — Register `switch_agent` and filter tools by mode
5. **`src/agent/options-builder.ts`** — Use mode registry for prompt + tool assembly
6. **`src/agent/chat-engine.ts`** — Inject mode-specific prompt
7. **`src/agent/index.ts`** — Add `switchSessionMode()`, expand types
8. **`src/main/ipc/agent-ipc.ts`** + **`src/main/preload.ts`** — IPC layer
9. **`ui/chat.html`** — UI mode selector + tab indicators

## Risks & Mitigations

- **SDK session resume after mode switch**: When switching from SDK→SDK mode, killing and resuming should work since `sdkSessionId` is preserved. Need to verify the SDK handles changed `systemPrompt` + `allowedTools` on resume gracefully. If not, fall back to starting a fresh SDK session (losing the subprocess but keeping SQLite message history).
- **Cross-engine switch (chat→SDK or SDK→chat)**: Messages are stored in SQLite by both engines, so history is always available. The new engine just starts fresh with the existing context.
- **Token cost**: Mode-specific system prompts add ~200-400 tokens each. Minimal overhead since they replace (not add to) the current static prompt for that mode.
- **Locked mode toggle**: Currently locked after first message. With `switch_agent` tool, the agent can switch at any time, but manual UI switching stays locked. This is intentional — the agent knows when to switch; the user shouldn't need to.

## Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Agent in general mode can call `switch_agent` to coder and continue coding with full context
- [ ] Agent in coder mode can call `switch_agent` to researcher and browse web
- [ ] Writer mode does NOT have web_search or browser tools
- [ ] UI mode selector shows 5 icons and updates when agent switches
- [ ] Tab shows current mode icon
- [ ] New sessions default to the global mode setting
