import { GraphStats } from "../graph/validation";
import { Problem } from "../graph/types";
import { buildSystemPrompt, buildSessionPreamble } from "./prompts";
import { decideToolUse, targetPathOf, zeroByteWriteMessage, PermissionContext } from "./permissions";
import { coerce, EffortLevel } from "./effort";
import { KG_SCOUT } from "./kg-scout";
import { MessageChannel, QueryFn, SdkMessage, SdkQueryHandle } from "./sdk-types";

export interface SessionConfig {
  vaultRoot: string;
  graphDir: string;
  hubPath: string;
  model: string;
  /** The conversation's preference. Dropped when the model has no effort. */
  effort: EffortLevel;
  claudePath: string;
  todayIso: string;
  stats: GraphStats;
  problems: Problem[];
  apiKeyOverride?: string;
  resumeSessionId?: string;
}

export interface ApprovalRequest {
  toolName: string;
  targetPath: string | null;
  reason: string;
  /** The SDK's pre-rendered prompt line ("Claude wants to write X"), when available. */
  title: string | null;
  respond: (allow: boolean, denyMessage?: string) => void;
}

export interface SessionEvents {
  onInit?: (info: { sessionId: string; tools: string[]; model: string; apiKeySource: string }) => void;
  onTextDelta?: (text: string) => void;
  onAssistantText?: (fullText: string) => void;
  onToolUse?: (use: { id: string; name: string; input: Record<string, unknown>; subagent: boolean }) => void;
  onToolResult?: (result: { toolUseId: string; content: unknown }) => void;
  onApproval?: (request: ApprovalRequest) => void;
  onResult?: (result: { totalCostUsd: number; isError: boolean; resultText: string }) => void;
  onStatus?: (status: string | null) => void;
  onError?: (error: Error) => void;
  /** The message stream is over (claude.exe exited). Not fired after an explicit dispose(). */
  onEnd?: () => void;
  /** Raw stderr from the CLI — diagnostics, not necessarily errors. */
  onStderr?: (line: string) => void;
}

export interface AgentServiceDeps {
  queryFn?: QueryFn;
  fileSize?: (absPath: string) => number | null;
}

export interface SessionHandle {
  sendUserMessage(text: string): void;
  interrupt(): Promise<void>;
  setModel(model: string): Promise<void>;
  setEffort(effort: EffortLevel): Promise<void>;
  sessionId(): string | null;
  done(): Promise<void>;
  dispose(): void;
}

const CONTRACT_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Task"];
// Bare allowedTools entries auto-approve BEFORE canUseTool, so anything listed
// here bypasses decideToolUse entirely. Only Task (kg-scout dispatch) is safe
// to exempt; reads must flow through the permission table to keep its
// outside-the-vault and hidden-folder branches alive at runtime.
const AUTO_ALLOWED = ["Task"];

/** Ambient levers that could reroute auth, billing, or model selection. */
const ENV_DENY = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_CUSTOM_HEADERS",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "ANTHROPIC_VERTEX_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
];

export class AgentService {
  private readonly queryFn: QueryFn;
  private readonly fileSize: (absPath: string) => number | null;

  constructor(deps: AgentServiceDeps = {}) {
    this.queryFn = deps.queryFn ?? defaultQueryFn();
    this.fileSize = deps.fileSize ?? defaultFileSize;
  }

  start(config: SessionConfig, events: SessionEvents): SessionHandle {
    const channel = new MessageChannel();
    const pendingApprovals = new Set<(allow: boolean, msg?: string) => void>();
    let currentSessionId: string | null = config.resumeSessionId ?? null;
    let disposed = false;

    const permissionCtx: PermissionContext = { vaultRoot: config.vaultRoot, graphDir: config.graphDir };

    const canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      options?: { signal?: AbortSignal; title?: string; description?: string },
    ): Promise<Record<string, unknown>> => {
      const decision = decideToolUse(toolName, input, permissionCtx);
      if (decision.behavior === "allow") return { behavior: "allow" };
      if (decision.behavior === "deny") return { behavior: "deny", message: decision.message };
      // No approval surface (headless / tests): fail closed instead of hanging forever.
      if (events.onApproval === undefined) {
        return { behavior: "deny", message: `No approval surface is attached to this session, so the action was declined. (${decision.reason})` };
      }
      // ask → surface to the UI; resolve deny on dispose OR SDK abort so the session can never hang.
      return await new Promise<Record<string, unknown>>((resolve) => {
        const respond = (allow: boolean, denyMessage?: string): void => {
          if (!pendingApprovals.has(respond)) return;
          pendingApprovals.delete(respond);
          resolve(allow ? { behavior: "allow" } : { behavior: "deny", message: denyMessage ?? "The user declined this action." });
        };
        pendingApprovals.add(respond);
        options?.signal?.addEventListener("abort", () => respond(false, "The request was cancelled before the user decided."), { once: true });
        if (disposed) {
          respond(false, "The session was closed before this request was decided.");
          return;
        }
        events.onApproval?.({
          toolName,
          targetPath: targetPathOf(toolName, input),
          reason: decision.reason,
          title: options?.title ?? null,
          respond,
        });
      });
    };

    const preToolUse = async (hookInput: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const tool = String(hookInput["tool_name"] ?? "");
      if (!CONTRACT_TOOLS.includes(tool)) {
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `The ${tool} tool is not available in graph sessions.`,
          },
        };
      }
      return {};
    };

    const postWrite = async (hookInput: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const input = hookInput["tool_input"] as Record<string, unknown> | undefined;
      const filePath = typeof input?.["file_path"] === "string" ? (input["file_path"] as string) : null;
      if (filePath === null) return {};
      const size = this.fileSize(filePath);
      if (size === 0) {
        return {
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            updatedToolOutput: zeroByteWriteMessage(filePath),
          },
        };
      }
      return {};
    };

    // The subscription path must not be silently re-routed by ambient config. An explicit
    // API-key override may legitimately pair with a custom base URL, so that one survives.
    const env: Record<string, string | undefined> = { ...process.env };
    const hasKeyOverride = config.apiKeyOverride !== undefined && config.apiKeyOverride !== "";
    for (const name of ENV_DENY) delete env[name];
    if (!hasKeyOverride) delete env["ANTHROPIC_BASE_URL"];
    if (hasKeyOverride) env["ANTHROPIC_API_KEY"] = config.apiKeyOverride;

    const systemPrompt =
      buildSystemPrompt() +
      "\n\n---\n\n" +
      buildSessionPreamble({
        hubPath: config.hubPath,
        todayIso: config.todayIso,
        stats: config.stats,
        problems: config.problems,
      });

    const options: Record<string, unknown> = {
      cwd: config.vaultRoot,
      pathToClaudeCodeExecutable: config.claudePath,
      env,
      settingSources: [],
      // settingSources: [] isolates settings files, but MCP servers from user
      // config are gated separately — without this the user's claude.ai
      // connectors leak into the session's tool surface.
      strictMcpConfig: true,
      systemPrompt,
      model: config.model,
      tools: CONTRACT_TOOLS,
      allowedTools: AUTO_ALLOWED,
      permissionMode: "default",
      includePartialMessages: true,
      agents: { "kg-scout": { ...KG_SCOUT } },
      canUseTool,
      hooks: {
        PreToolUse: [{ hooks: [preToolUse] }],
        PostToolUse: [{ matcher: "Write", hooks: [postWrite] }],
      },
      stderr: (data: string) => events.onStderr?.(data),
    };
    // Effort and model are coupled, and the live session is what owns the pair:
    // switching either one has to re-answer "what may this model be told?".
    let currentModel = config.model;
    let currentEffort = config.effort;
    const startingEffort = coerce(currentModel, currentEffort);
    if (startingEffort !== null) options["effort"] = startingEffort;

    if (config.resumeSessionId !== undefined) options["resume"] = config.resumeSessionId;

    let handle: SdkQueryHandle;
    try {
      handle = this.queryFn({ prompt: channel, options });
    } catch (error) {
      events.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    /** null clears the level, so moving onto a model without effort says so. */
    const pushEffort = async (): Promise<void> => {
      await handle.applyFlagSettings({ effortLevel: coerce(currentModel, currentEffort) });
    };

    let ended = false;
    const donePromise = (async () => {
      try {
        for await (const message of handle) {
          routeMessage(message, events, (id) => (currentSessionId = id));
        }
      } catch (error) {
        if (!disposed) events.onError?.(error instanceof Error ? error : new Error(String(error)));
      } finally {
        ended = true;
        if (!disposed) events.onEnd?.();
      }
    })();

    return {
      sendUserMessage: (text) => {
        if (ended || disposed) {
          events.onError?.(new Error("The session has ended — this tab can no longer send messages."));
          return;
        }
        channel.enqueue(text);
      },
      interrupt: async () => {
        await handle.interrupt();
      },
      setModel: async (model) => {
        currentModel = model;
        await handle.setModel(model);
        await pushEffort();
      },
      setEffort: async (effort) => {
        currentEffort = effort;
        await pushEffort();
      },
      sessionId: () => currentSessionId,
      done: async () => {
        channel.end();
        await donePromise;
      },
      dispose: () => {
        disposed = true;
        for (const respond of [...pendingApprovals]) respond(false, "The session was closed before this request was decided.");
        channel.end();
        handle.close();
      },
    };
  }
}

function routeMessage(message: SdkMessage, events: SessionEvents, setSessionId: (id: string) => void): void {
  switch (message.type) {
    case "system": {
      if (message.subtype === "init") {
        const id = String(message["session_id"] ?? "");
        if (id !== "") setSessionId(id);
        events.onInit?.({
          sessionId: id,
          tools: (message["tools"] as string[]) ?? [],
          model: String(message["model"] ?? ""),
          apiKeySource: String(message["apiKeySource"] ?? ""),
        });
      }
      break;
    }
    case "stream_event": {
      const event = message["event"] as { type?: string; delta?: { type?: string; text?: string } } | undefined;
      if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
        events.onTextDelta?.(event.delta.text);
      }
      break;
    }
    case "assistant": {
      const content = (message["message"] as { content?: Array<Record<string, unknown>> } | undefined)?.content ?? [];
      const subagent = message["parent_tool_use_id"] != null; // kg-scout's tool calls are forwarded by default
      for (const block of content) {
        if (block["type"] === "text" && typeof block["text"] === "string") events.onAssistantText?.(block["text"]);
        if (block["type"] === "tool_use") {
          events.onToolUse?.({
            id: String(block["id"] ?? ""),
            name: String(block["name"] ?? ""),
            input: (block["input"] as Record<string, unknown>) ?? {},
            subagent,
          });
        }
      }
      break;
    }
    case "user": {
      const content = (message["message"] as { content?: Array<Record<string, unknown>> } | undefined)?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block["type"] === "tool_result") {
            events.onToolResult?.({ toolUseId: String(block["tool_use_id"] ?? ""), content: block["content"] });
          }
        }
      }
      break;
    }
    case "status": {
      events.onStatus?.((message["status"] as string | null) ?? null);
      break;
    }
    case "result": {
      events.onResult?.({
        totalCostUsd: Number(message["total_cost_usd"] ?? 0),
        isError: Boolean(message["is_error"]),
        resultText: String(message["result"] ?? ""),
      });
      break;
    }
    default:
      break;
  }
}

function defaultQueryFn(): QueryFn {
  // Isolated so the SDK import (and its import.meta bundling patch) stays in one place.
  const sdk = require("@anthropic-ai/claude-agent-sdk") as { query: (p: unknown) => unknown };
  return (({ prompt, options }) => sdk.query({ prompt, options })) as QueryFn;
}

function defaultFileSize(absPath: string): number | null {
  const fs = require("node:fs") as typeof import("node:fs");
  try {
    return fs.statSync(absPath).size;
  } catch {
    return null;
  }
}
