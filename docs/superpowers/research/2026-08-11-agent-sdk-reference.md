# Claude Agent SDK 0.3.227 — API reference for an Obsidian plugin

Researched 2026-08-11. Primary source is the installed package's own `sdk.d.ts` and `sdk.mjs`
(`npm install @anthropic-ai/claude-agent-sdk@0.3.227`), not documentation. Type declarations
below are verbatim from the shipped files.

Claims marked **VERIFIED** were confirmed by running code on this machine (Windows 11, Node
v26.5.1). Section 7 is second-hand — see the sourcing note there.

---

## 1) Package anatomy

**There is no vendored `cli.js`.** This is the biggest change from older Claude Code SDK releases
and it drives most of the plugin design. The package ships only JS wrappers; the actual Claude
Code runtime is a **native binary delivered through platform-specific optional dependencies**.

`node_modules/@anthropic-ai/claude-agent-sdk/package.json` (abridged):

```json
{
  "name": "@anthropic-ai/claude-agent-sdk", "version": "0.3.227",
  "main": "sdk.mjs", "types": "sdk.d.ts", "type": "module",
  "exports": {
    ".":           { "types": "./sdk.d.ts",              "default": "./sdk.mjs" },
    "./extract":   { "types": "./extractFromBunfs.d.ts", "default": "./extractFromBunfs.js" },
    "./browser":   { "types": "./browser-sdk.d.ts",      "default": "./browser-sdk.js" },
    "./bridge":    { "types": "./bridge.d.ts",           "default": "./bridge.mjs" },
    "./sdk-tools": { "types": "./sdk-tools.d.ts" }
  },
  "engines": { "node": ">=18.0.0" },
  "peerDependencies": { "@anthropic-ai/sdk": ">=0.93.0",
                        "@modelcontextprotocol/sdk": "^1.29.0", "zod": "^4.0.0" },
  "optionalDependencies": {
    "@anthropic-ai/claude-agent-sdk-win32-x64": "0.3.227",
    "@anthropic-ai/claude-agent-sdk-darwin-arm64": "0.3.227"
    /* + linux x64/arm64 glibc & musl, darwin-x64, win32-arm64 */
  },
  "files": ["sdk.mjs","sdk.d.ts","sdk-tools.d.ts","agentSdkTypes.d.ts","bridge.mjs",
            "bridge.d.ts","browser-sdk.js","browser-sdk.d.ts","extractFromBunfs.js",
            "extractFromBunfs.d.ts","manifest.json","manifest.zst.json"],
  "claudeCodeVersion": "2.1.227"
}
```

Note the `files` list: **no `cli.js`, no `dist/`.** Installed sizes here: `sdk.mjs` 1.2 MB (the
whole SDK, self-contained), `sdk.d.ts` 335 KB / 7457 lines, `sdk-tools.d.ts` 152 KB, and
`claude-agent-sdk-win32-x64/claude.exe` **292 MB**. `manifest.json` carries a checksum and size
per platform; every platform binary is 285–305 MB.

### How the runtime is located

From `sdk.mjs` (minified; variable names are the shipped ones):

```js
let Oh = u.pathToClaudeCodeExecutable;
if (!Oh) {
  let Er = fileURLToPath(import.meta.url), on = createRequire(Er),
      hs = oN((vi) => on.resolve(vi));
  if (!hs) throw Error(`Native CLI binary for ${process.platform}-${process.arch} not found. Reinstall @anthropic-ai/claude-agent-sdk without --omit=optional, or set options.pathToClaudeCodeExecutable.`);
  Oh = hs;
}
```

`oN` maps platform/arch to the optional-dep subpath —
`` `${pkg}-${platform}-${arch}/claude${win32 ? '.exe' : ''}` ``, with musl/glibc variants tried in
order on Linux — so the default is
`require.resolve('@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe')`.

### How the process is spawned

```js
let Qe = Abe(a),                                   // a = pathToClaudeCodeExecutable
    Sr = Qe ? a : o,                               // command: the binary, or the JS runtime
    at = Qe ? [...s, ...K] : [...s, a, ...K],      // args
    W = { command: Sr, args: at, cwd: n, env: c, signal: this.forwardedAbort.signal };

function Abe(e) { return ![".js", ".mjs", ".tsx", ".ts", ".jsx"].some((r) => e.endsWith(r)) }
```

`Abe` is the "is this a native binary?" test: **any path not ending in a JS extension is spawned
directly**; a `.js`/`.mjs` path is spawned as `<executable> <path> <args>`, where `executable`
comes from `getDefaultExecutable()` (`"bun"` under Bun, else `"node"`). With a native binary path
`executable` is never used.

The spawn is plain `child_process.spawn`, **no shell**:

```js
import { spawn as hbe } from "child_process";
let i = hbe(t, r, { cwd: n, stdio: ["pipe","pipe","pipe"], signal: s, env: o, windowsHide: true });
```

So a `.cmd`/`.bat` shim cannot be used as the executable — it needs `shell: true`, which would
break stdio streaming.

### Environment handling

```js
if (!c.CLAUDE_CODE_ENTRYPOINT) c.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";
delete c.NODE_OPTIONS;
if (ve(c.DEBUG_CLAUDE_AGENT_SDK)) c.DEBUG = "1"; else delete c.DEBUG;
if (!Xt.CLAUDE_AGENT_SDK_VERSION) Xt.CLAUDE_AGENT_SDK_VERSION = "0.3.227";
```

`NODE_OPTIONS` is deleted unconditionally — helpful, since Electron sets it.

### Imports (matters for bundling)

`sdk.mjs` imports **only Node built-ins** — no bare package imports at all (zod, the MCP SDK, the
Anthropic SDK and express are pre-bundled): `async_hooks, child_process, crypto, events, fs, http,
https, module, net, os, path, process, readline, stream, string_decoder, url, util, zlib` plus
`node:{module,os,path,process}`. The `peerDependencies` are only needed if *you* import them
(e.g. `zod` for `tool()`).

### Consequence for the plugin

292 MB cannot ship inside an Obsidian plugin. Therefore: install with `--omit=optional`, and
always pass `pathToClaudeCodeExecutable` pointing at the **user's installed Claude Code binary**.
On this machine the installed CLI is the same artifact the SDK would have used —
`~/.local/bin/claude.exe`, 292227232 bytes (identical), `claude --version` 2.1.227,
matching the package's `claudeCodeVersion`. `manifest.json.sdkCompat.testedWrapperVersions`
records tested pairings, so a CLI a few patches off is expected to work; large drift is not.

---

## 2) `query()` and `Options` — verbatim excerpts

```ts
export declare function query(_params: {
    prompt: string | AsyncIterable<SDKUserMessage>;
    options?: Options;
}): Query;
```

`Options` is ~790 lines. The fields relevant to an Obsidian plugin, verbatim:

```ts
export declare type Options = {
    /** Controller for cancelling the query. */
    abortController?: AbortController;
    /** Additional directories Claude can access beyond cwd. Paths should be absolute. */
    additionalDirectories?: string[];
    /** Agent name for the main thread: applies that agent's system prompt, tools and model. */
    agent?: string;
    /** Programmatically define custom subagents invoked via the Agent tool. */
    agents?: Record<string, AgentDefinition>;
    /** Tool names auto-allowed without prompting. To restrict which tools EXIST, use `tools`. */
    allowedTools?: string[];
    /** Custom permission handler for controlling tool usage. */
    canUseTool?: CanUseTool;
    /** Continue the most recent conversation in cwd. Mutually exclusive with `resume`. */
    continue?: boolean;
    /** Current working directory for the session. Defaults to `process.cwd()`. */
    cwd?: string;
    /** Tool names removed from the model's context entirely. */
    disallowedTools?: string[];
    /** Base set of built-in tools. `[]` disables all built-ins. */
    tools?: string[] | { type: 'preset'; preset: 'claude_code' };
    /** Environment variables for the Claude Code process.
     *  When set, this value REPLACES the subprocess environment entirely — it is
     *  not merged with `process.env`. Spread `process.env` yourself if the
     *  subprocess still needs inherited variables like `PATH`, `HOME`, or
     *  `ANTHROPIC_API_KEY`. When omitted, the subprocess inherits `process.env`. */
    env?: { [envVar: string]: string | undefined };
    /** JavaScript runtime to use. Auto-detected if not specified. */
    executable?: 'bun' | 'deno' | 'node';
    executableArgs?: string[];
    /** Additional CLI args. Keys without `--`; `null` for boolean flags. */
    extraArgs?: Record<string, string | null>;
    /** With `resume`: fork to a new session ID rather than continuing the previous one. */
    forkSession?: boolean;
    hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
    /** Emit `SDKPartialAssistantMessage` (`stream_event`) during streaming. */
    includePartialMessages?: boolean;
    maxTurns?: number;
    maxBudgetUsd?: number;
    mcpServers?: Record<string, McpServerConfig>;
    /** Examples: 'claude-sonnet-5', 'claude-opus-4-8', 'claude-fable-5' */
    model?: string;
    /** Path to the Claude Code executable. Uses the built-in executable if not specified. */
    pathToClaudeCodeExecutable?: string;
    permissionMode?: PermissionMode;
    /** Required `true` when using `permissionMode: 'bypassPermissions'`. */
    allowDangerouslySkipPermissions?: boolean;
    /** Session ID to resume. Loads that session's conversation history. */
    resume?: string;
    /** Explicit session UUID. Not usable with `continue`/`resume` unless `forkSession`. */
    sessionId?: string;
    /** When resuming, stop at (and include) this message UUID. */
    resumeSessionAt?: string;
    /** 'user' | 'project' | 'local'. Omitted = load ALL (CLI default).
     *  Pass `[]` for SDK isolation. Must include 'project' to load CLAUDE.md files. */
    settingSources?: SettingSource[];
    skills?: string[] | 'all';
    stderr?: (data: string) => void;
    /** Ignore .mcp.json, user settings, plugin and agent-frontmatter MCP config. */
    strictMcpConfig?: boolean;
    systemPrompt?: string | string[] | {
        type: 'preset'; preset: 'claude_code';
        append?: string; excludeDynamicSections?: boolean;
    };
    title?: string;
    /** Run Claude Code in VMs, containers, or remote environments. */
    spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess;
};
```

Other fields not expanded: `thinking`, `effort`, `fallbackModel`, `betas`, `plugins`, `sandbox`,
`settings`, `managedSettings`, `outputFormat` (JSON-schema structured output),
`enableFileCheckpointing`, `toolAliases`, `forwardSubagentText`, `onElicitation`, `onUserDialog`,
`debug`/`debugFile`, `includeHookEvents`, `persistSession`, `sessionStore`.

Notes that bite:

- `systemPrompt` defaults to **no** Claude Code system prompt. Pass
  `{ type: 'preset', preset: 'claude_code', append: '...' }` for the standard harness prompt.
- `settingSources` defaults to loading *everything*. Pass `[]` to avoid inheriting the user's
  global Claude Code config; `'project'` is required for `CLAUDE.md`.
- `env` **replaces** rather than merges. Always spread `process.env`.
- `allowedTools` is an auto-approve list, not an availability list; `tools` controls availability.

Also exported: `tool()`, `createSdkMcpServer()`, `startup()` (returns a pre-warmed `WarmQuery`),
`listSessions()`, `getSessionInfo()`, `getSessionMessages()`, `forkSession()`, `renameSession()`,
`tagSession()`, `deleteSession()`, `listSubagents()`, `getSubagentMessages()`,
`resolveSettings()`, `InMemorySessionStore`, `AbortError`, `HOOK_EVENTS`.

---

## 3) `SDKMessage` stream reference

`SDKMessage` is a 37-member union. Every member carries `uuid` and `session_id` (optional on
`SDKUserMessage`, which you construct yourself). The five that matter:

```ts
export declare type SDKSystemMessage = {
    type: 'system'; subtype: 'init';
    agents?: string[];
    apiKeySource: ApiKeySource;   // 'user'|'project'|'org'|'temporary'|'oauth' (+ 'none' seen at runtime)
    claude_code_version: string;
    cwd: string;
    tools: string[];
    mcp_servers: { name: string; status: string }[];
    model: string;
    permissionMode: PermissionMode;
    slash_commands: string[]; output_style: string; skills: string[];
    plugins: { name: string; path: string; version?: string }[];
    capabilities?: string[];      // feature-detect, e.g. 'interrupt_receipt_v1'
    uuid: UUID; session_id: string;
};
```

**This is where you capture `session_id`** — it arrives first, before any assistant output.

```ts
export declare type SDKAssistantMessage = {
    type: 'assistant';
    message: BetaMessage;          // Anthropic API message; .content is the content-block array
    parent_tool_use_id: string | null;
    error?: SDKAssistantMessageError;
    uuid: UUID; session_id: string; request_id?: string;
    aborted?: true;                // truncated by interrupt/abort
    subagent_type?: string; task_description?: string; timestamp?: string;
};

export declare type SDKUserMessage = {
    type: 'user';
    message: MessageParam;
    parent_tool_use_id: string | null;
    isSynthetic?: boolean;
    tool_use_result?: unknown;     // structured tool output, per-tool shape
    priority?: 'now' | 'next' | 'later';
    shouldQuery?: boolean;         // false = append to transcript without triggering a turn
    uuid?: UUID; session_id?: string;
};

export declare type SDKPartialAssistantMessage = {
    type: 'stream_event';
    event: BetaRawMessageStreamEvent;   // content_block_delta etc.
    parent_tool_use_id: string | null;
    uuid: UUID; session_id: string; ttft_ms?: number;
};

export declare type SDKResultMessage = SDKResultSuccess | SDKResultError;

export declare type SDKResultSuccess = {
    type: 'result'; subtype: 'success';
    duration_ms: number; duration_api_ms: number;
    is_error: boolean; num_turns: number;
    result: string;                            // final assistant text
    stop_reason: string | null;
    total_cost_usd: number;
    usage: NonNullableUsage;                   // MAIN AGENT LOOP ONLY
    modelUsage: Record<string, ModelUsage>;    // use THIS for accounting
    permission_denials: SDKPermissionDenial[];
    structured_output?: unknown;
    uuid: UUID; session_id: string;
};

export declare type SDKResultError = {
    type: 'result';
    subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd'
           | 'error_max_structured_output_retries';
    /* ...same accounting fields... */  errors: string[];
    uuid: UUID; session_id: string;
};

export declare type ModelUsage = {
    inputTokens: number; outputTokens: number;
    cacheReadInputTokens: number; cacheCreationInputTokens: number;
    webSearchRequests: number; costUSD: number;
    contextWindow: number; maxOutputTokens: number;
    canonicalModel?: string; provider?: string;
};
```

**Cost/token accounting:** use `modelUsage`, not `usage` — `usage` excludes subagents and
sidechains. Both `total_cost_usd` and `modelUsage` are **cumulative across turns** in a
streaming-input session, so read the latest result rather than summing.

**tool_use / tool_result have no dedicated message types.** They surface as content blocks:
`tool_use` inside `SDKAssistantMessage.message.content`, `tool_result` inside the following
`SDKUserMessage.message.content` — with `SDKUserMessage.tool_use_result` carrying the richer
structured form. Correlate on `tool_use_id`.

Others worth handling: `SDKStatusMessage` (`'compacting'|'requesting'|null`),
`SDKPermissionDeniedMessage`, `SDKCompactBoundaryMessage`, `SDKAPIRetryMessage`,
`SDKTaskStarted/Progress/Notification` (subagent activity),
`SDKSessionStateChangedMessage` (`'idle'|'running'|'requires_action'` — authoritative turn-over
signal), `SDKRateLimitEvent`, `SDKAuthStatusMessage`.

---

## 4) Permissions

Three mechanisms that compose: `permissionMode` sets the baseline, `hooks.PreToolUse` runs first
and can short-circuit, `canUseTool` is the interactive prompt surface.

```ts
export declare type PermissionMode =
  'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
```

```ts
export declare type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];   // return as updatedPermissions for "always allow"
    blockedPath?: string;
    decisionReason?: string;
    title?: string;         // "Claude wants to read foo.txt" — use as the prompt text
    displayName?: string;   // "Read file" — button label
    description?: string;   // human-readable subtitle
    toolUseID: string;
    agentID?: string;
    requestId: string;
    matchedAskRule?: { source: string; toolName: string; ruleContent?: string };
  }
) => Promise<PermissionResult | null>;
```

The doc comment above the type is worth repeating:

> Return `null` ONLY after the consumer has already sent the control_response out-of-band [...]
> Fail-closed: an accidental null means no control_response is sent and the tool stays blocked
> indefinitely — permission prompts have no park deadline.

So: **never return `null`**, and never let the promise dangle — a hung `canUseTool` hangs the
session with no timeout. Use the pre-rendered `title`/`displayName`/`description` rather than
reconstructing prompt copy from `toolName` + `input`.

```ts
export declare type PermissionResult = {
    behavior: 'allow';
    updatedInput?: Record<string, unknown>;      // rewrite the tool's arguments
    updatedPermissions?: PermissionUpdate[];     // persist an "always allow"
    toolUseID?: string;
    decisionClassification?: PermissionDecisionClassification;
} | {
    behavior: 'deny';
    message: string;                             // shown to the model as the tool_result
    interrupt?: boolean;                         // also stop the turn
    toolUseID?: string;
    decisionClassification?: PermissionDecisionClassification;
};
// 'user_temporary' | 'user_permanent' | 'user_reject'

export declare type PermissionUpdate =
  | { type: 'addRules'; rules: PermissionRuleValue[]; behavior: PermissionBehavior;
      destination: PermissionUpdateDestination }
  | { type: 'replaceRules' | 'removeRules'; /* same shape */ }
  | { type: 'setMode'; mode: PermissionMode; destination: PermissionUpdateDestination }
  | { type: 'addDirectories' | 'removeDirectories'; directories: string[];
      destination: PermissionUpdateDestination };

export declare type PermissionRuleValue = { toolName: string; ruleContent?: string };
export declare type PermissionUpdateDestination =
  'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg';
```

For an "always allow" button: return `behavior:'allow'` with
`updatedPermissions: options.suggestions`, `destination: 'session'` (or `'projectSettings'` to
persist).

### Hooks

```ts
export declare type HookCallback = (
  input: HookInput, toolUseID: string | undefined, options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;

export declare interface HookCallbackMatcher {
    matcher?: string;          // tool-name pattern
    hooks: HookCallback[];
    timeout?: number;          // seconds
}

export declare type BaseHookInput = {
    session_id: string; transcript_path: string; cwd: string;
    prompt_id?: string; permission_mode?: string;
    agent_id?: string; agent_type?: string; effort?: { level: string };
};

export declare type PreToolUseHookInput = BaseHookInput & {
    hook_event_name: 'PreToolUse';
    tool_name: string; tool_input: unknown; tool_use_id: string;
};

export declare type PreToolUseHookSpecificOutput = {
    hookEventName: 'PreToolUse';
    permissionDecision?: HookPermissionDecision;   // 'allow'|'deny'|'ask'|'defer'
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;
};

export declare type PostToolUseHookInput = BaseHookInput & {
    hook_event_name: 'PostToolUse';
    tool_name: string; tool_input: unknown; tool_response: unknown;
    tool_use_id: string; duration_ms?: number;
};
// PostToolUseHookSpecificOutput adds: additionalContext?, updatedToolOutput? (replaces the
// tool output before the model sees it), updatedMCPToolOutput?

export declare type SyncHookJSONOutput = {
    continue?: boolean; suppressOutput?: boolean; stopReason?: string;
    decision?: 'approve' | 'block'; systemMessage?: string; reason?: string;
    hookSpecificOutput?: PreToolUseHookSpecificOutput | PostToolUseHookSpecificOutput | ...;
};
export declare type AsyncHookJSONOutput = { async: true; asyncTimeout?: number };
```

31 hook events exist (`HOOK_EVENTS`), including `SessionStart`, `SessionEnd`,
`UserPromptSubmit`, `PreCompact`, `Stop`, `FileChanged`, `CwdChanged`.

**Recommended split:** deterministic policy (vault-boundary enforcement — deny writes outside the
vault) belongs in a `PreToolUse` hook, since it needs no UI and cannot be mis-clicked. Decisions
needing a human go through `canUseTool`, the only mechanism giving you prompt copy and "always
allow" suggestions.

---

## 5) Sessions and multi-turn

```ts
export declare interface Query extends AsyncGenerator<SDKMessage, void> {
    interrupt(): Promise<SDKControlInterruptResponse | undefined>;
    setPermissionMode(mode: PermissionMode): Promise<void>;
    setModel(model?: string): Promise<void>;
    setMaxThinkingTokens(n: number | null, display?: 'summarized'|'omitted'|null): Promise<void>;
    applyFlagSettings(settings: {...}): Promise<void>;
    initializationResult(): Promise<SDKControlInitializeResponse>;
    reinitialize(): Promise<SDKControlInitializeResponse>;
    supportedCommands(): Promise<SlashCommand[]>;
    supportedModels(): Promise<ModelInfo[]>;
    supportedAgents(): Promise<AgentInfo[]>;
    mcpServerStatus(): Promise<McpServerStatus[]>;
    getContextUsage(): Promise<SDKControlGetContextUsageResponse>;
    accountInfo(): Promise<AccountInfo>;
    rewindFiles(userMessageId: string, options?: {...}): Promise<RewindFilesResult>;
    setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;
    /** Stream input messages to the query. Used internally for multi-turn conversations. */
    streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
    stopTask(taskId: string): Promise<void>;
    close(): void;
}
```

The doc comment on the control-request block is the deciding fact:

> **Control Requests.** The following methods are control requests, and are only supported when
> streaming input/output is used.

### Two ways to do multi-turn

**A. Streaming-input mode** — pass an `AsyncIterable<SDKUserMessage>` as `prompt`. One process,
one `query()` call, alive for the whole conversation. `interrupt()`, `setModel()`,
`setPermissionMode()` and `applyFlagSettings()` **only work in this mode**.

```ts
class MessageChannel implements AsyncIterable<SDKUserMessage> {
  #queue: SDKUserMessage[] = [];
  #wake?: () => void;

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    for (;;) {
      while (this.#queue.length) yield this.#queue.shift()!;
      await new Promise<void>((r) => (this.#wake = r));
    }
  }

  enqueue(text: string) {
    this.#queue.push({ type: 'user', message: { role: 'user', content: text },
                       parent_tool_use_id: null } as SDKUserMessage);
    this.#wake?.();
  }
}

const q = query({ prompt: new MessageChannel(), options });
```

**B. `resume`** — one `query()` per turn, each carrying `options.resume = sessionId`. Simpler,
but it respawns the 292 MB binary per turn (noticeable cold start) and gives up every control
method, including `interrupt()`.

**Recommendation: streaming-input mode**, with `resume` reserved for reopening a conversation
after Obsidian restarts, forking a tab, or rewinding to a checkpoint.

### Interrupt vs abort

- `query.interrupt()` — graceful, streaming-input only. Stops the current turn; the session stays
  alive for another message. Truncated assistant messages arrive with `aborted: true`. On CLIs
  advertising `interrupt_receipt_v1` the response lists `still_queued` message uuids.
- `options.abortController.abort()` — kills the process. `close()` ends stdin, waits ~2 s, then
  `SIGKILL` (on win32 it skips `SIGTERM` and goes straight to a delayed `SIGKILL`).

Use `interrupt()` for a stop button; reserve the AbortController for view teardown/plugin unload.

### Model switching

`setModel(model?)` changes the model for subsequent turns of a live streaming session; pass
`undefined` to fall back to the session default. With `resume`, pass a different `options.model`.

Model strings accept full ids and aliases. From `AgentDefinition.model`:

> Model alias (e.g. 'fable', 'opus', 'sonnet', 'haiku') or full model ID (e.g. 'claude-fable-5').
> If omitted or 'inherit', uses the main model

and `ModelInfo.resolvedModel`: *"e.g. 'sonnet' → 'claude-sonnet-5'"*. Call
`query.supportedModels()` at runtime rather than hardcoding a list.

### Session helpers (no query needed)

`listSessions()`, `getSessionInfo()`, `getSessionMessages()`, `forkSession()`, `renameSession()`,
`tagSession()`, `deleteSession()` operate on the on-disk JSONL store directly — handy for a
history sidebar without spawning the CLI. `forkSession: true` + `resume` branches instead of
continuing; `resumeSessionAt: <uuid>` rewinds to a transcript point.

---

## 6) Subagent definitions

```ts
export declare type AgentDefinition = {
    /** Natural language description of when to use this agent */
    description: string;
    /** Array of allowed tool names. If omitted, inherits all tools from parent. */
    tools?: string[];
    disallowedTools?: string[];
    /** The agent's system prompt */
    prompt: string;
    /** Model alias ('fable','opus','sonnet','haiku') or full model ID. 'inherit' = main model */
    model?: string;
    mcpServers?: AgentMcpServerSpec[];
    /** Array of skill names to preload into the agent context */
    skills?: string[];
    /** Auto-submitted as the first user turn when this agent is the main thread agent. */
    initialPrompt?: string;
    maxTurns?: number;
    /** Run this agent as a background task (non-blocking) when invoked */
    background?: boolean;
    /** Scope for auto-loading agent memory files: 'user' | 'project' | 'local' */
    memory?: 'user' | 'project' | 'local';
    effort?: ('low'|'medium'|'high'|'xhigh'|'max') | number;
    permissionMode?: PermissionMode;
    observer?: string; observerMessage?: string;
    criticalSystemReminder_EXPERIMENTAL?: string;
};
```

Only `description` and `prompt` are required. Passed as `options.agents: Record<name, def>`;
invoked by the model through the Agent/Task tool. Setting `options.agent: '<name>'` makes that
definition drive the **main** thread instead — a clean way to give the plugin its own persona,
tool restrictions and model without touching `systemPrompt`.

Subagent activity surfaces as `SDKTaskStarted/Progress/NotificationMessage` and messages with
`parent_tool_use_id` set. Subagent text is suppressed by default — `forwardSubagentText: true`
renders a nested transcript.

---

## 7) Claudian wiring findings

**Sourcing note.** This section comes from a delegated read of `github.com/YishenTu/claudian`
(v2.1.3, MIT, `main`; repo existence, description and star count independently confirmed). I did
**not** verify these file contents myself — paths are repo-relative, prefix with
`https://github.com/YishenTu/claudian/blob/main/`. Treat as strong corroboration, not proof.
Where it overlaps my own experiments (the `import.meta.url` problem) it matches exactly.

Framing: Claudian is now multi-provider (Claude, Codex, ACP agents), so Claude-SDK code is
quarantined under `src/providers/claude/` behind contracts in `src/core/execution/`.

### Runtime location

Uses the **user's installed CLI**, never the SDK's own resolution.
`src/providers/claude/execution/ClaudeExecutionRequestEncoder.ts`:

```ts
const cliPath = await this.deps.host.getResolvedProviderCliPath('claude');
if (!cliPath) throw new Error('Claude CLI not found');
const customEnv = parseEnvironmentVariables(this.deps.host.getActiveEnvironmentVariables('claude'));
const enhancedPath = getEnhancedPath(customEnv.PATH, cliPath);
const options: Options = {
  cwd: sessionConfig.vaultWorkingDirectory,
  pathToClaudeCodeExecutable: cliPath,
  env: { ...process.env, ...customEnv, PATH: enhancedPath },
  spawnClaudeCodeProcess: createCustomSpawnFunction(enhancedPath),
  includePartialMessages: true,
  enableFileCheckpointing: true,
  canUseTool,
```

**`executable` is never set.** They take over spawning entirely via `spawnClaudeCodeProcess` and
normalize the node invocation themselves (`src/providers/claude/runtime/customSpawn.ts`):

```ts
// The SDK only routes some script extensions through `node`; normalize the
// remaining Node-backed paths here before Electron spawns with shell=false.
if (command === 'node' || cliPathRequiresNode(command)) {
  const nodeFullPath = findNodeExecutable(enhancedPath);
  if (command === 'node') { if (nodeFullPath) command = nodeFullPath; }
  else { args = [command, ...args]; command = nodeFullPath ?? 'node'; }
}
```

Node is found by **pure filesystem probing — no `which`/`where` subprocess** (`src/utils/env.ts`):
ordered candidates are settings-PATH → hardcoded common dirs → `process.env.PATH`, each checked
with `fs.existsSync` + `statSync().isFile()`. The Windows list covers `%APPDATA%\npm`,
`%LOCALAPPDATA%\Programs\nodejs`, `%ProgramFiles%\nodejs`, nvm-windows, volta, fnm, chocolatey,
scoop. Whether a CLI path needs node is decided by extension **or by reading the shebang**
(`cliPathRequiresNode` reads the first 200 bytes and looks for `#!…node`).

**Why they need node resolution at all:** they support the *npm* distribution
(`node_modules/@anthropic-ai/claude-code/cli-wrapper.cjs`) as well as native installs. If your
plugin supports only the native installer (`claude.exe`), all of this collapses — the binary is
spawned directly and node never enters the picture.

### Auth

**There is no authentication code in Claudian at all** — no token handling, no login flow, no
API-key field. Auth is entirely delegated to the spawned CLI's existing credentials. Env handling
is inherit-plus-overlay with **no deletions** (identical expression in the encoder and
`runtime/claudeColdStartQuery.ts`): `env: { ...process.env, ...customEnv, PATH: enhancedPath }`.

So a stray `ANTHROPIC_API_KEY` in Obsidian's environment passes straight through and silently
switches billing from subscription to API. **Nothing deletes or overrides it**; the only
occurrence in the repo is a settings placeholder in `ui/ClaudeSettingsTab.ts` inviting the user to
set it deliberately. Provider env vars are namespaced by regex (`registration.ts`:
`[/^ANTHROPIC_/i, /^CLAUDE_/i]`), with a fixed shared set (`PATH`, proxy vars, CA bundles, temp
dirs) staying global. `HOME` is never set; `CLAUDE_CONFIG_DIR` is only read.

Worth diverging here: offer an explicit "use my Claude subscription" toggle that deletes
`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from the copied env, so subscription users can't be
accidentally billed to an API account.

### Bundling

**The SDK is bundled into `main.js` — not external.** `esbuild.config.mjs` externals are only
Obsidian/Electron/CodeMirror/node builtins:

```js
const external = ['obsidian', 'electron', /* @codemirror/*, @lezer/* */
  ...builtinModules, ...builtinModules.map(m => `node:${m}`)];

const mainContext = await esbuild.context({
  entryPoints: ['src/main.ts'], bundle: true,
  plugins: [patchSdkImportMeta, createPatchRendererUnsafeUnref(['main.js']), copyToObsidian],
  external, format: 'cjs', target: 'es2018',
  minify: prod, sourcemap: prod ? false : 'inline',
  treeShaking: true, outfile: 'main.js',
});
```

Note **no `platform` field** — esbuild's `browser` default applies, with builtins kept external
manually. The `import.meta.url` workaround is an `onLoad` plugin (`patchSdkImportMeta`) that
rewrites the SDK's ESM entry before bundling: it replaces `createRequire(import.meta.url)` with
`createRequire(__filename)` and `fileURLToPath(import.meta.url)` with `__filename`, resolving
**aliased** imports too (`import { createRequire as cr }`) — which a one-line `define` would miss.
**No copy step for `cli.js` or any SDK asset**, since `pathToClaudeCodeExecutable` is always
supplied.

Bonus Electron gotcha they solved: a post-build pass rewrites `.unref()` calls on timers (which
throw in the Electron renderer) and **fails the build** if any survive
(`scripts/rendererSafeUnref.js`). `package.json` pins `engines.node >=24 <25` and the SDK at
`^0.3.220`.

**VERIFIED independently, on this machine.** With a stock config
(`--bundle --format=cjs --platform=node`) the bundle builds with no warnings and then crashes on
`require()`:

```
TypeError [ERR_INVALID_ARG_VALUE]: The argument 'filename' must be a file URL object,
file URL string, or absolute path string. Received undefined
    at createRequire (node:internal/modules/cjs/loader:2156:11)
```

esbuild lowers `import.meta` to `var import_meta = {}` in CJS, and `sdk.mjs` calls
`createRequire(import.meta.url)` at **top level**, so it throws before any of your code runs.
`--define:import.meta.url='"file:///"'` does *not* fix it (createRequire rejects a pathless URL).
A working minimal fix, verified:

```js
define: { 'import.meta.url': '__IMPORT_META_URL__' },
banner: { js: "const __IMPORT_META_URL__ = require('url').pathToFileURL(__filename).href;" },
```

Claudian's `onLoad` rewrite is the more robust version of the same fix. Either way,
`"isDesktopOnly": true` is required in `manifest.json`.

### Permission gating

A mix of all three, with `canUseTool` primary. `permissionMode` is mapped from a 3-value UI model
(`yolo` → `bypassPermissions`, `plan` → `plan`, else a safe-mode setting), and
**`allowDangerouslySkipPermissions: true` is set unconditionally** — the plugin owns gating via
`canUseTool` rather than the CLI's own prompts. *Caveat worth weighing before copying this: it
means a bug or unhandled path in `canUseTool` leaves no gate at all. A safer default is to leave
the CLI's baseline in place and treat `canUseTool` as an additional layer.*

`hooks` is used narrowly — a `PreToolUse` deny-hook for read-only executions, returning
`{ continue: false, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
permissionDecisionReason: … } }` for any non-read-only tool.

`src/providers/claude/execution/ClaudeInteractionHandler.ts` — guards, then the awaited UI promise:

```ts
readonly canUseTool: CanUseTool = async (toolName, input, options): Promise<PermissionResult> => {
  if (!this.deps.isToolAllowed(toolName))
    return { behavior: 'deny', message: `Tool "${toolName}" is not allowed by this execution policy.` };
  if (!this.deps.getTurnId())
    return { behavior: 'deny', message: 'No current Claude turn owns this interaction.', interrupt: true };
  const interactionId = this.getInteractionId(options.toolUseID);  // `claude:${sessionInstanceId}:${toolUseId}`
  if (this.pendingInteractionIds.has(interactionId))
    return { behavior: 'deny', message: `Interaction "${interactionId}" is already pending.` };
  this.pendingInteractionIds.add(interactionId);
  ...
  const response = await this.deps.interactionPort.requestApproval({
    ...identity, kind: 'approval', toolName, input,
    description: getActionDescription(toolName, input),
    decisionReason: options.decisionReason, blockedPath: options.blockedPath,
    additionalPermissions: options.suggestions,
  }, options.signal);
  assertResponseIdentity(interactionId, response.interactionId);   // stale responses throw
  ...
} finally {
  this.pendingInteractionIds.delete(interactionId);
  this.deps.interactionPort.dismissInteraction(interactionId,
    options.signal.aborted ? 'cancelled' : dismissReason);
}
```

Two patterns worth copying: every response must echo the request id (stale replies are rejected),
and the `finally` block always dismisses, keyed on `options.signal.aborted`. Shapes returned:

| Situation | Shape |
|---|---|
| Approved tool | `{ behavior:'allow', updatedInput, updatedPermissions }` |
| AskUserQuestion answered | `{ behavior:'allow', updatedInput: { ...questionInput, answers } }` |
| ExitPlanMode approved | `{ behavior:'allow', updatedPermissions:[{type:'setMode', mode, destination:'session'}] }` |
| Plan feedback (keep going) | `{ behavior:'deny', message: decision.text, interrupt:false }` |
| Denied once | `{ behavior:'deny', message:'User denied this action.', interrupt:false }` |
| Cancelled / stale | `{ behavior:'deny', message:…, interrupt:true }` |

Allow-once vs allow-always is just the destination
(`security/ClaudePermissionUpdates.ts`): `decision === 'allow-always' ? 'projectSettings' :
'session'`, with a guard that allow-always never writes an unscoped rule.

### Streaming and multi-turn

Both, chosen per session by a `lifecycle` config (`execution/ClaudeExecutionStrategies.ts`).
**Persistent = true streaming-input mode** — `agentQuery({ prompt: messageChannel, options })`
where `messageChannel` is the `AsyncIterable`; later turns push into the channel, no new
`query()`. Live config changes are applied in place (`setModel`, `applyFlagSettings({ effortLevel
})`, `setPermissionMode`); structural changes (system prompt, tools, hooks, cliPath,
settingSources) force a restart, keyed on a serialized `restartKey` hash. Their
`ClaudeMessageChannel` allows one in-flight turn, merges queued text with `\n\n`
(`MAX_QUEUED_MESSAGES: 8`, `MAX_MERGED_CHARS: 12000`), released by `onTurnComplete()` on `result`.
The ephemeral strategy still uses a generator, just a one-message one.

`resume` is used for **rebinding, not per-turn continuation** — reopening a conversation, forking
a tab, rewinding, or restarting after a `restartKey` change (`resume`, `resumeSessionAt`,
`forkSession` spread conditionally into the options). If the SDK returns a *different* session id
than expected they detect the amnesia and replay history as prompt context.

**Critical Electron finding.** They pass an `AbortController` in `Options` but refuse to forward
the signal to `spawn()` (`customSpawn.ts`):

```ts
// Do not pass `signal` directly to spawn() — Obsidian's Electron runtime
// uses a different realm for AbortSignal, causing `instanceof EventTarget`
// checks inside Node's internals to fail. Handle abort manually instead.
const child = spawn(cmd, args, { cwd, env, stdio: [...], windowsHide: true, ... });
if (signal) {
  const killChild = () => { child.kill('SIGTERM'); };
  if (signal.aborted) killChild();
  else signal.addEventListener('abort', killChild, { once: true });
}
```

This is exactly why `spawnClaudeCodeProcess` matters for us: the SDK's own spawn passes `signal`
through, which would hit this bug in the renderer.

Cancellation distinguishes "not yet handed to the CLI" (close the query) from "in flight"
(`query.interrupt()`). Partial text uses `includePartialMessages: true` and consumes
`content_block_delta` (`text_delta`, `thinking_delta`, `input_json_delta`), guarding on
`parentToolUseId === null` to drop subagent text. **The double-emission trap:** the SDK sends text
as deltas *and* again in the final `assistant` message, so they track `sawStreamText` /
`sawStreamThinking` and skip the duplicate. They also take token usage from assistant messages
rather than `result`, because result usage aggregates subagent tokens into misleading spikes.

### Windows specifics

- **`.cmd` and extension-less shims are avoided during detection** — an extension-less `claude` on
  a Windows PATH entry is npm's POSIX sh shim and cannot be spawned. Preference order is
  `claude.exe` → Node-backed package entrypoint (`cli-wrapper.cjs`, `cli.js` under
  `node_modules/@anthropic-ai/claude-code`). Probe list: `~/.claude/local/claude.exe`,
  `%LOCALAPPDATA%\Claude\claude.exe`, `%ProgramFiles%\Claude\claude.exe`, `~/.local/bin/claude.exe`.
  Source comment: *"Avoid .cmd fallback because it requires shell: true and breaks SDK stdio
  streaming."*
- **If a user configures a `.cmd` anyway**, `src/utils/windowsCmdShim.ts` rebuilds the spawn as
  `cmd.exe /d /s /c "…"` with `windowsVerbatimArguments: true`, quoting by doubling `"` (not
  backslash-escaping), and sets `killProcessTree` — because `cmd.exe` becomes the parent, teardown
  uses `taskkill /pid <pid> /t /f` instead of `proc.kill()`.
- `PATH_SEPARATOR = ';'`, `NODE_EXECUTABLE = 'node.exe'`, case-insensitive path dedupe; home
  resolution mirrors the SDK (`USERPROFILE`, else `HOMEDRIVE`+`HOMEPATH`); `windowsHide: true`
  on every spawn.

---

## 8) Build-chain version matrix

`npm view <pkg> version`, 2026-08-11:

| Package | Latest |
|---|---|
| `react-dom` | 19.2.8 |
| `@types/react` | 19.2.18 |
| `@types/react-dom` | 19.2.4 |
| `@types/node` | 26.2.0 |
| `@types/d3-hierarchy` | 3.1.7 |
| `@types/d3-zoom` | 3.0.8 |
| `@types/d3-selection` | 3.0.11 |
| `@anthropic-ai/claude-agent-sdk` | 0.3.227 (bundles Claude Code 2.1.227) |

`npm view typescript dist-tags`:

```
dev: 3.9.4    beta: 6.0.0-beta    rc: 7.0.1-rc
latest: 7.0.2    next: 7.1.0-dev.20260811.1
```

**TypeScript 7 is `latest`.** The 5.x line is still published and installable — highest is
**5.9.3**. Pin `typescript@5.9.3` as a fallback if TS 7 causes friction with the Obsidian API
typings; there is no availability risk in doing so.

`@types/node` 26.x matches the Node 26 line. Obsidian's Electron ships an older Node, so if
`@types/node` 26 surfaces APIs missing at runtime, drop to the major matching Obsidian's Electron
rather than chasing latest. (Claudian pins `engines.node >=24 <25`.)
