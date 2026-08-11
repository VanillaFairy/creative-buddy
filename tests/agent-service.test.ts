import { describe, it, expect, vi } from "vitest";
import { AgentService, SessionConfig } from "../src/agent/agent-service";
import type { SdkMessage, SdkUserMessage, QueryFn, SdkQueryHandle } from "../src/agent/sdk-types";

/** A scripted fake for the SDK boundary. */
function fakeQuery(script: SdkMessage[]) {
  const captured: { options?: Record<string, unknown>; prompt?: AsyncIterable<SdkUserMessage>; sent: SdkUserMessage[] } = { sent: [] };
  const queryFn: QueryFn = ({ prompt, options }) => {
    captured.options = options;
    captured.prompt = prompt;
    const handle: SdkQueryHandle = {
      async *[Symbol.asyncIterator]() {
        // Drain one queued user message first (like the real CLI reading stdin).
        for await (const m of prompt) {
          captured.sent.push(m);
          break;
        }
        for (const msg of script) yield msg;
      },
      interrupt: vi.fn(async () => undefined),
      setModel: vi.fn(async () => undefined),
      close: vi.fn(),
    };
    return handle;
  };
  return { queryFn, captured };
}

const CONFIG: SessionConfig = {
  vaultRoot: "C:/vaults/General",
  graphDir: "Noir game",
  hubPath: "Noir game/Noir game.md",
  model: "claude-sonnet-5",
  claudePath: "C:/fake/claude.exe",
  todayIso: "2026-08-11",
  stats: { nodes: 4, hubChildren: 2 },
  digestLines: [],
};

const INIT: SdkMessage = { type: "system", subtype: "init", session_id: "sess-1", tools: ["Read", "Write", "Edit", "Glob", "Grep", "Task"], model: "claude-sonnet-5", apiKeySource: "none" };
const RESULT: SdkMessage = { type: "result", subtype: "success", session_id: "sess-1", total_cost_usd: 0.01, result: "done", is_error: false, modelUsage: {} };

describe("AgentService options assembly", () => {
  it("builds isolated, subscription-safe options with our prompt", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const service = new AgentService({ queryFn });
    const events = { onInit: vi.fn(), onResult: vi.fn() };
    const session = service.start(CONFIG, events);
    session.sendUserMessage("hello");
    await session.done();

    const opts = captured.options!;
    expect(opts["cwd"]).toBe("C:/vaults/General");
    expect(opts["pathToClaudeCodeExecutable"]).toBe("C:/fake/claude.exe");
    expect(opts["settingSources"]).toEqual([]);
    expect(opts["permissionMode"]).toBe("default");
    expect(opts["allowDangerouslySkipPermissions"]).toBeUndefined();
    expect(opts["model"]).toBe("claude-sonnet-5");
    expect(opts["includePartialMessages"]).toBe(true);
    const env = opts["env"] as Record<string, string | undefined>;
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBeUndefined();
    expect(env["PATH"] ?? env["Path"]).toBeDefined(); // process.env survived
    const sys = opts["systemPrompt"] as string;
    expect(sys).toContain("Never invent a fact");
    expect(sys).toContain("Noir game/Noir game.md"); // preamble appended
    const agents = opts["agents"] as Record<string, { model?: string }>;
    expect(agents["kg-scout"]!.model).toBe("haiku");
    expect(events.onInit).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "sess-1" }));
    expect(events.onResult).toHaveBeenCalledWith(expect.objectContaining({ totalCostUsd: 0.01 }));
  });

  it("keeps an explicit api key override when the user set one", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const service = new AgentService({ queryFn });
    const session = service.start({ ...CONFIG, apiKeyOverride: "sk-test" }, {});
    session.sendUserMessage("hello");
    await session.done();
    const env = captured.options!["env"] as Record<string, string | undefined>;
    expect(env["ANTHROPIC_API_KEY"]).toBe("sk-test");
  });

  it("passes resume when reopening a session", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const service = new AgentService({ queryFn });
    const session = service.start({ ...CONFIG, resumeSessionId: "sess-0" }, {});
    session.sendUserMessage("hi again");
    await session.done();
    expect(captured.options!["resume"]).toBe("sess-0");
  });
});

describe("AgentService streaming", () => {
  it("routes deltas, tool lines and results to events", async () => {
    const script: SdkMessage[] = [
      INIT,
      { type: "stream_event", session_id: "sess-1", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } } },
      { type: "stream_event", session_id: "sess-1", event: { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } } },
      { type: "assistant", session_id: "sess-1", message: { content: [{ type: "text", text: "Hello" }, { type: "tool_use", id: "tu-1", name: "Write", input: { file_path: "C:/vaults/General/Noir game/X.md" } }] } },
      { type: "user", session_id: "sess-1", message: { content: [{ type: "tool_result", tool_use_id: "tu-1", content: "ok" }] } },
      RESULT,
    ];
    const { queryFn } = fakeQuery(script);
    const service = new AgentService({ queryFn });
    const deltas: string[] = [];
    const tools: string[] = [];
    const session = service.start(CONFIG, {
      onTextDelta: (t) => deltas.push(t),
      onToolUse: (u) => tools.push(`${u.name}:${u.id}`),
      onToolResult: (r) => tools.push(`result:${r.toolUseId}`),
    });
    session.sendUserMessage("go");
    await session.done();
    expect(deltas.join("")).toBe("Hello");
    expect(tools).toEqual(["Write:tu-1", "result:tu-1"]);
  });
});

describe("AgentService permission wiring", () => {
  it("allows in-graph writes, denies bad titles, pauses for out-of-graph writes", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const service = new AgentService({ queryFn });
    const approvals: Array<{ respond: (allow: boolean, msg?: string) => void }> = [];
    const session = service.start(CONFIG, { onApproval: (a) => approvals.push(a) });
    session.sendUserMessage("go");
    await session.done();

    const canUseTool = captured.options!["canUseTool"] as (
      tool: string,
      input: Record<string, unknown>,
      opts: { signal: AbortSignal; toolUseID: string },
    ) => Promise<{ behavior: string; message?: string }>;
    const opts = { signal: new AbortController().signal, toolUseID: "t" };

    await expect(canUseTool("Write", { file_path: "C:/vaults/General/Noir game/Fine.md" }, opts)).resolves.toEqual({ behavior: "allow" });

    const denied = await canUseTool("Write", { file_path: "C:/vaults/General/Noir game/Who: me.md" }, opts);
    expect(denied.behavior).toBe("deny");

    const pending = canUseTool("Write", { file_path: "C:/vaults/General/Здоровье/note.md" }, opts);
    await Promise.resolve();
    expect(approvals).toHaveLength(1);
    approvals[0]!.respond(false, "not this graph");
    const out = await pending;
    expect(out).toEqual({ behavior: "deny", message: "not this graph" });
  });

  it("dispose() resolves dangling approvals as deny (never hang the session)", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const service = new AgentService({ queryFn });
    const session = service.start(CONFIG, { onApproval: () => undefined });
    session.sendUserMessage("go");
    await session.done();
    const canUseTool = captured.options!["canUseTool"] as (t: string, i: Record<string, unknown>, o: { signal: AbortSignal; toolUseID: string }) => Promise<{ behavior: string }>;
    const pending = canUseTool("Write", { file_path: "C:/vaults/General/elsewhere/x.md" }, { signal: new AbortController().signal, toolUseID: "t" });
    session.dispose();
    await expect(pending).resolves.toMatchObject({ behavior: "deny" });
  });

  it("zero-byte writes are surfaced to the model via the PostToolUse hook", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const service = new AgentService({ queryFn, fileSize: () => 0 });
    const session = service.start(CONFIG, {});
    session.sendUserMessage("go");
    await session.done();
    const hooks = captured.options!["hooks"] as Record<string, Array<{ matcher?: string; hooks: Array<(input: unknown) => Promise<Record<string, unknown>>> }>>;
    const post = hooks["PostToolUse"]![0]!;
    expect(post.matcher).toBe("Write");
    const out = await post.hooks[0]!({
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: "C:/vaults/General/Noir game/Empty.md" },
      tool_response: "ok",
      tool_use_id: "tu-9",
    });
    const specific = out["hookSpecificOutput"] as Record<string, unknown>;
    expect(String(specific["updatedToolOutput"])).toContain("empty file");
  });
});
