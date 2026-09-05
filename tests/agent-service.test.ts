import { describe, it, expect, vi } from "vitest";
import { AgentService, SessionConfig } from "../src/agent/agent-service";
import type { SdkMessage, SdkUserMessage, QueryFn, SdkQueryHandle } from "../src/agent/sdk-types";

/** A scripted fake for the SDK boundary. */
function fakeQuery(script: SdkMessage[]) {
  const captured: { options?: Record<string, unknown>; prompt?: AsyncIterable<SdkUserMessage>; sent: SdkUserMessage[]; handle?: SdkQueryHandle } = { sent: [] };
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
      applyFlagSettings: vi.fn(async () => undefined),
      close: vi.fn(),
    };
    captured.handle = handle;
    return handle;
  };
  return { queryFn, captured };
}

const CONFIG: SessionConfig = {
  vaultRoot: "C:/vaults/General",
  graphDir: "Noir game",
  hubPath: "Noir game/Noir game.md",
  model: "claude-sonnet-5",
  effort: "high",
  claudePath: "C:/fake/claude.exe",
  todayIso: "2026-08-11",
  stats: { nodes: 4, hubChildren: 2 },
  problems: [],
};

const INIT: SdkMessage = { type: "system", subtype: "init", session_id: "sess-1", tools: ["Read", "Write", "Edit", "Glob", "Grep", "Task"], model: "claude-sonnet-5", apiKeySource: "none" };
const RESULT: SdkMessage = { type: "result", subtype: "success", session_id: "sess-1", total_cost_usd: 0.01, result: "done", is_error: false, modelUsage: {} };

describe("AgentService options assembly", () => {
  it("builds isolated, subscription-safe options with our prompt", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const service = new AgentService({ queryFn });
    const events = { onInit: vi.fn(), onResult: vi.fn() };
    process.env["CLAUDE_CODE_USE_BEDROCK"] = "1";
    process.env["ANTHROPIC_BASE_URL"] = "http://x";
    const session = service.start(CONFIG, events);
    session.sendUserMessage("hello");
    await session.done();
    // The env snapshot is taken inside start(), so this cannot leak into other tests.
    delete process.env["CLAUDE_CODE_USE_BEDROCK"];
    delete process.env["ANTHROPIC_BASE_URL"];

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
    expect(env["CLAUDE_CODE_USE_BEDROCK"]).toBeUndefined(); // no ambient re-routing
    expect(env["ANTHROPIC_BASE_URL"]).toBeUndefined();
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
    process.env["ANTHROPIC_BASE_URL"] = "http://x";
    const session = service.start({ ...CONFIG, apiKeyOverride: "sk-test" }, {});
    session.sendUserMessage("hello");
    await session.done();
    delete process.env["ANTHROPIC_BASE_URL"];
    const env = captured.options!["env"] as Record<string, string | undefined>;
    expect(env["ANTHROPIC_API_KEY"]).toBe("sk-test");
    expect(env["ANTHROPIC_BASE_URL"]).toBe("http://x"); // an own key may pair with an own endpoint
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
    const approvals: Array<{ title: string | null; respond: (allow: boolean, msg?: string) => void }> = [];
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
    expect(approvals[0]!.title).toBeNull(); // the SDK sent no rendered prompt line
    approvals[0]!.respond(false, "not this graph");
    const out = await pending;
    expect(out).toEqual({ behavior: "deny", message: "not this graph" });
  });

  it("forwards the SDK's rendered prompt line to the approval card", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const service = new AgentService({ queryFn });
    const approvals: Array<{ title: string | null; respond: (allow: boolean, msg?: string) => void }> = [];
    const session = service.start(CONFIG, { onApproval: (a) => approvals.push(a) });
    session.sendUserMessage("go");
    await session.done();
    const canUseTool = captured.options!["canUseTool"] as (
      t: string,
      i: Record<string, unknown>,
      o: { signal: AbortSignal; toolUseID: string; title?: string },
    ) => Promise<{ behavior: string }>;

    const pending = canUseTool(
      "Write",
      { file_path: "C:/vaults/General/elsewhere/x.md" },
      { signal: new AbortController().signal, toolUseID: "t", title: "Claude wants to write x.md" },
    );
    await Promise.resolve();
    expect(approvals[0]!.title).toBe("Claude wants to write x.md");
    approvals[0]!.respond(true);
    await expect(pending).resolves.toEqual({ behavior: "allow" });
  });

  it("an aborted request denies itself, and the stale card can no longer change it", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const service = new AgentService({ queryFn });
    const approvals: Array<{ title: string | null; respond: (allow: boolean, msg?: string) => void }> = [];
    const session = service.start(CONFIG, { onApproval: (a) => approvals.push(a) });
    session.sendUserMessage("go");
    await session.done();
    const canUseTool = captured.options!["canUseTool"] as (
      t: string,
      i: Record<string, unknown>,
      o: { signal: AbortSignal; toolUseID: string },
    ) => Promise<{ behavior: string; message?: string }>;

    const controller = new AbortController();
    const pending = canUseTool("Write", { file_path: "C:/vaults/General/elsewhere/x.md" }, { signal: controller.signal, toolUseID: "t" });
    await Promise.resolve();
    expect(approvals).toHaveLength(1);

    controller.abort();
    const settled = { behavior: "deny", message: expect.stringContaining("cancelled") };
    await expect(pending).resolves.toEqual(settled);

    approvals[0]!.respond(true); // the card is still on screen; clicking it must change nothing
    await expect(pending).resolves.toEqual(settled);
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

describe("M2 hardening", () => {
  it("only Task is auto-allowed — reads must flow through canUseTool", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const session = new AgentService({ queryFn }).start(CONFIG, {});
    session.sendUserMessage("hi");
    await session.done();
    expect(captured.options!["allowedTools"]).toEqual(["Task"]);
  });

  it("strips every ambient auth/routing/model lever from the child env", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    process.env["ANTHROPIC_CUSTOM_HEADERS"] = "x-api-key: evil";
    process.env["ANTHROPIC_MODEL"] = "other-model";
    process.env["ANTHROPIC_BEDROCK_BASE_URL"] = "http://x";
    process.env["ANTHROPIC_DEFAULT_SONNET_MODEL"] = "other";
    const session = new AgentService({ queryFn }).start(CONFIG, {});
    session.sendUserMessage("hi");
    await session.done();
    for (const k of ["ANTHROPIC_CUSTOM_HEADERS", "ANTHROPIC_MODEL", "ANTHROPIC_BEDROCK_BASE_URL", "ANTHROPIC_DEFAULT_SONNET_MODEL"]) {
      delete process.env[k];
    }
    const env = captured.options!["env"] as Record<string, string | undefined>;
    expect(env["ANTHROPIC_CUSTOM_HEADERS"]).toBeUndefined();
    expect(env["ANTHROPIC_MODEL"]).toBeUndefined();
    expect(env["ANTHROPIC_BEDROCK_BASE_URL"]).toBeUndefined();
    expect(env["ANTHROPIC_DEFAULT_SONNET_MODEL"]).toBeUndefined();
  });

  it("announces the end of the message stream, and a dead handle refuses new messages", async () => {
    const { queryFn } = fakeQuery([INIT, RESULT]);
    const events = { onEnd: vi.fn(), onError: vi.fn() };
    const session = new AgentService({ queryFn }).start(CONFIG, events);
    session.sendUserMessage("hi");
    await session.done();
    expect(events.onEnd).toHaveBeenCalledTimes(1);
    session.sendUserMessage("into the void");
    expect(events.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("ended") }));
  });

  it("does not announce the end after an explicit dispose", async () => {
    const { queryFn } = fakeQuery([INIT, RESULT]);
    const events = { onEnd: vi.fn() };
    const session = new AgentService({ queryFn }).start(CONFIG, events);
    session.sendUserMessage("hi");
    session.dispose();
    await session.done();
    expect(events.onEnd).not.toHaveBeenCalled();
  });

  it("routes stderr to its own channel, not onError", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const events = { onStderr: vi.fn(), onError: vi.fn() };
    const session = new AgentService({ queryFn }).start(CONFIG, events);
    session.sendUserMessage("hi");
    await session.done();
    (captured.options!["stderr"] as (d: string) => void)("some debug chatter");
    expect(events.onStderr).toHaveBeenCalledWith("some debug chatter");
    expect(events.onError).not.toHaveBeenCalled();
  });

  it("marks tool uses coming from a subagent", async () => {
    const script: SdkMessage[] = [
      INIT,
      { type: "assistant", parent_tool_use_id: "task-1", message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "x.md" } }] } },
      RESULT,
    ];
    const { queryFn } = fakeQuery(script);
    const events = { onToolUse: vi.fn() };
    const session = new AgentService({ queryFn }).start(CONFIG, events);
    session.sendUserMessage("hi");
    await session.done();
    expect(events.onToolUse).toHaveBeenCalledWith(expect.objectContaining({ name: "Read", subagent: true }));
  });

  it("approval cards resolve the target path for every path-shaped input, not just file_path", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const events = { onApproval: vi.fn() };
    const session = new AgentService({ queryFn }).start(CONFIG, events);
    session.sendUserMessage("hi");
    await session.done();
    type CanUse = (t: string, i: Record<string, unknown>, o?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const canUse = captured.options!["canUseTool"] as CanUse;
    const pending = canUse("Glob", { pattern: "*", path: "C:/elsewhere" });
    expect(events.onApproval).toHaveBeenCalledWith(expect.objectContaining({ targetPath: "C:/elsewhere" }));
    events.onApproval.mock.calls[0]![0].respond(false);
    await pending;
    void session;
  });
});

describe("approval without a surface", () => {
  it("denies instead of hanging when no onApproval handler exists", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const session = new AgentService({ queryFn }).start(CONFIG, {});
    session.sendUserMessage("hi");
    await session.done();
    type CanUse = (t: string, i: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const canUse = captured.options!["canUseTool"] as CanUse;
    const result = await canUse("Write", { file_path: "C:/elsewhere/x.md", content: "x" });
    expect(result["behavior"]).toBe("deny");
  });
});

describe("effort", () => {
  const flagCalls = (captured: { handle?: SdkQueryHandle }): unknown[] =>
    (captured.handle!.applyFlagSettings as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);

  it("sends the conversation's level on a model that honours it", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const session = new AgentService({ queryFn }).start({ ...CONFIG, effort: "xhigh" }, {});
    session.sendUserMessage("hello");
    await session.done();
    expect(captured.options!["effort"]).toBe("xhigh");
  });

  it("omits effort entirely for a model that has none", async () => {
    // Haiku rejects the parameter, and a rejected option fails the whole session.
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const session = new AgentService({ queryFn }).start(
      { ...CONFIG, model: "claude-haiku-4-5", effort: "max" },
      {},
    );
    session.sendUserMessage("hello");
    await session.done();
    expect(captured.options!["effort"]).toBeUndefined();
    expect("effort" in captured.options!).toBe(false);
  });

  it("does not pass on a stored level that is not a level", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const session = new AgentService({ queryFn }).start(
      { ...CONFIG, effort: "ludicrous" as never },
      {},
    );
    session.sendUserMessage("hello");
    await session.done();
    expect(captured.options!["effort"]).toBe("high");
  });

  it("applies a switch to the running session", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const session = new AgentService({ queryFn }).start(CONFIG, {});
    session.sendUserMessage("hello");
    await session.setEffort("low");
    await session.done();
    expect(flagCalls(captured)).toEqual([{ effortLevel: "low" }]);
  });

  it("clears the level when the conversation moves onto a model without effort", async () => {
    // The preference survives on the session; what the CLI is told does not.
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const session = new AgentService({ queryFn }).start({ ...CONFIG, effort: "max" }, {});
    session.sendUserMessage("hello");
    await session.setModel("claude-haiku-4-5");
    await session.done();
    expect(flagCalls(captured)).toEqual([{ effortLevel: null }]);
  });

  it("restores the level when the conversation moves back onto a model with effort", async () => {
    const { queryFn, captured } = fakeQuery([INIT, RESULT]);
    const session = new AgentService({ queryFn }).start({ ...CONFIG, effort: "max" }, {});
    session.sendUserMessage("hello");
    await session.setModel("claude-haiku-4-5");
    await session.setModel("claude-opus-5");
    await session.done();
    expect(flagCalls(captured)).toEqual([{ effortLevel: null }, { effortLevel: "max" }]);
  });
});
