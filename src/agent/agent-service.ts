import { GraphStats } from "../graph/validation";
import { buildSystemPrompt, buildSessionPreamble } from "./prompts";
import { decideToolUse, zeroByteWriteMessage, PermissionContext } from "./permissions";
import { KG_SCOUT } from "./kg-scout";
import { MessageChannel, QueryFn, SdkMessage, SdkQueryHandle } from "./sdk-types";

export interface SessionConfig {
  vaultRoot: string;
  graphDir: string;
  hubPath: string;
  model: string;
  claudePath: string;
  todayIso: string;
  stats: GraphStats;
  digestLines: string[];
  apiKeyOverride?: string;
  resumeSessionId?: string;
}

export interface ApprovalRequest {
  toolName: string;
  targetPath: string | null;
  reason: string;
  respond: (allow: boolean, denyMessage?: string) => void;
}

export interface SessionEvents {
  onInit?: (info: { sessionId: string; tools: string[]; model: string; apiKeySource: string }) => void;
  onTextDelta?: (text: string) => void;
  onAssistantText?: (fullText: string) => void;
  onToolUse?: (use: { id: string; name: string; input: Record<string, unknown> }) => void;
  onToolResult?: (result: { toolUseId: string; content: unknown }) => void;
  onApproval?: (request: ApprovalRequest) => void;
  onResult?: (result: { totalCostUsd: number; isError: boolean; resultText: string }) => void;
  onStatus?: (status: string | null) => void;
  onError?: (error: Error) => void;
}

export interface AgentServiceDeps {
  queryFn?: QueryFn;
  fileSize?: (absPath: string) => number | null;
}

export interface SessionHandle {
  sendUserMessage(text: string): void;
  interrupt(): Promise<void>;
  setModel(model: string): Promise<void>;
  sessionId(): string | null;
  done(): Promise<void>;
  dispose(): void;
}

const CONTRACT_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Task"];
const AUTO_ALLOWED = ["Read", "Glob", "Grep", "Task"];

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

    const canUseTool = async (toolName: string, input: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const decision = decideToolUse(toolName, input, permissionCtx);
      if (decision.behavior === "allow") return { behavior: "allow" };
      if (decision.behavior === "deny") return { behavior: "deny", message: decision.message };
      // ask → surface to the UI; resolve deny on dispose so the session can never hang.
      return await new Promise<Record<string, unknown>>((resolve) => {
        const respond = (allow: boolean, denyMessage?: string): void => {
          pendingApprovals.delete(respond);
          resolve(allow ? { behavior: "allow" } : { behavior: "deny", message: denyMessage ?? "The user declined this action." });
        };
        pendingApprovals.add(respond);
        if (disposed) {
          respond(false, "The session was closed before this request was decided.");
          return;
        }
        events.onApproval?.({
          toolName,
          targetPath: typeof input["file_path"] === "string" ? (input["file_path"] as string) : null,
          reason: decision.reason,
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

    const env: Record<string, string | undefined> = { ...process.env };
    delete env["ANTHROPIC_API_KEY"];
    delete env["ANTHROPIC_AUTH_TOKEN"];
    if (config.apiKeyOverride !== undefined && config.apiKeyOverride !== "") env["ANTHROPIC_API_KEY"] = config.apiKeyOverride;

    const systemPrompt =
      buildSystemPrompt() +
      "\n\n---\n\n" +
      buildSessionPreamble({
        graphDir: config.graphDir,
        hubPath: config.hubPath,
        todayIso: config.todayIso,
        stats: config.stats,
        digestLines: config.digestLines,
      });

    const options: Record<string, unknown> = {
      cwd: config.vaultRoot,
      pathToClaudeCodeExecutable: config.claudePath,
      env,
      settingSources: [],
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
      stderr: (data: string) => events.onError?.(new Error(`claude stderr: ${data.slice(0, 400)}`)),
    };
    if (config.resumeSessionId !== undefined) options["resume"] = config.resumeSessionId;

    let handle: SdkQueryHandle;
    try {
      handle = this.queryFn({ prompt: channel, options });
    } catch (error) {
      events.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    const donePromise = (async () => {
      try {
        for await (const message of handle) {
          routeMessage(message, events, (id) => (currentSessionId = id));
        }
      } catch (error) {
        if (!disposed) events.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    })();

    return {
      sendUserMessage: (text) => channel.enqueue(text),
      interrupt: async () => {
        await handle.interrupt();
      },
      setModel: async (model) => {
        await handle.setModel(model);
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
      for (const block of content) {
        if (block["type"] === "text" && typeof block["text"] === "string") events.onAssistantText?.(block["text"]);
        if (block["type"] === "tool_use") {
          events.onToolUse?.({
            id: String(block["id"] ?? ""),
            name: String(block["name"] ?? ""),
            input: (block["input"] as Record<string, unknown>) ?? {},
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
