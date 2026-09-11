import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentService } from "../../src/agent/agent-service";
import { findClaudeExecutable } from "../../src/claude-locator";

describe("live smoke (requires a logged-in Claude Code install)", () => {
  it("runs one haiku turn in a scratch vault on subscription auth", async () => {
    const claudePath = findClaudeExecutable({ platform: process.platform, env: process.env as Record<string, string | undefined> }, fs.existsSync);
    expect(claudePath, "claude executable not found — install Claude Code").not.toBeNull();

    // A hub with no nodes under it reads as "no graph yet" and puts the interviewer in
    // bootstrap mode, where it asks for a folder name instead of reading anything. So the
    // scratch vault gets one real node, and the stats below say so honestly.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "creative-buddy-smoke-"));
    fs.mkdirSync(path.join(root, "Probe"));
    fs.writeFileSync(
      path.join(root, "Probe", "Probe.md"),
      "# Probe\n\n## Charter\n\nSmoke-test graph. Kinds: note.\n\n## Shape\n\n- [[Anchor]] — the one node.\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, "Probe", "Anchor.md"),
      '---\nparent: "[[Probe]]"\nkind: note\n---\n\nThe anchor exists so the graph is not empty.\n',
      "utf8",
    );

    const service = new AgentService();
    // Collected into an array rather than a nullable local: assignments inside a callback are
    // invisible to control-flow analysis, which would otherwise narrow the local to `never`.
    const inits: Array<{ sessionId: string; apiKeySource: string; tools: string[] }> = [];
    let resultText = "";
    let costUsd = 0;
    const toolUses: string[] = [];
    const approvalsAsked: string[] = [];
    const startedAt = Date.now();
    const session = service.start(
      {
        vaultRoot: root.replace(/\\/g, "/"),
        graphDir: "Probe",
        hubPath: "Probe/Probe.md",
        model: "claude-haiku-4-5",
        effort: "high",
        claudePath: claudePath!,
        todayIso: new Date().toISOString().slice(0, 10),
        stats: { nodes: 1, hubChildren: 1 },
      },
      {
        onInit: (i) => void inits.push(i),
        onToolUse: (u) => toolUses.push(u.name),
        onResult: (r) => {
          resultText = r.resultText;
          costUsd = r.totalCostUsd;
        },
        onError: () => undefined, // stderr noise is fine in smoke
        // In-vault activity must never need approval; log-and-deny anything that asks
        // so a misjudged path shows its reason in the diagnostics instead of hanging.
        onApproval: (request) => {
          approvalsAsked.push(`${request.toolName} ${request.targetPath ?? "(no path)"} — ${request.reason}`);
          request.respond(false, "Denied by the smoke test: in-vault activity must not need approval.");
        },
      },
    );
    session.sendUserMessage("Read the hub of this graph and answer with the exact word that appears before '-test' in its charter section, then the word 'done'. Nothing else.");
    await session.done();
    session.dispose();

    // Printed before the assertions so a failing run still yields the diagnostics.
    const init = inits[0];
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log("[smoke] tools:", init?.tools.join(", ") ?? "(no init)");
    console.log("[smoke] apiKeySource:", init?.apiKeySource ?? "(no init)");
    console.log("[smoke] tool uses:", toolUses.join(", ") || "(none)");
    console.log("[smoke] duration:", `${seconds}s`, "cost:", `$${costUsd}`);
    console.log("[smoke] result:", resultText.slice(0, 200));
    console.log("[smoke] approvals asked:", approvalsAsked.length === 0 ? "(none)" : approvalsAsked.join(" | "));

    expect(inits, "no system:init message arrived").toHaveLength(1);
    expect(init?.sessionId.length ?? 0).toBeGreaterThan(0);
    // The subscription path: "none" (or an oauth source) — never an API key.
    expect(init?.apiKeySource).not.toMatch(/api.?key/i);
    expect(toolUses).toContain("Read");
    // "smoke done" exactly: a looser match once passed on the model echoing a
    // permission-error message that happened to contain the word "smoke".
    expect(resultText.toLowerCase()).toContain("smoke done");
    expect(approvalsAsked, "in-vault activity must never need approval").toEqual([]);
    // strictMcpConfig must keep the user's personal connectors (claude.ai MCP
    // servers, .mcp.json, plugins) out of the session's tool surface entirely.
    expect(init?.tools.filter((t) => t.startsWith("mcp__"))).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  }, 180_000);
});
