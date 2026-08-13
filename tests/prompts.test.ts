import { describe, it, expect } from "vitest";
import systemPrompt from "../assets/prompts/system.md";
import grill from "../assets/prompts/grill.md";
import consult from "../assets/prompts/consult.md";
import { buildSystemPrompt, buildSessionPreamble } from "../src/agent/prompts";

describe("shipped prompt assets", () => {
  it("no asset references the python scripts or Bash", () => {
    for (const asset of [systemPrompt, grill, consult]) {
      expect(asset).not.toMatch(/graph_check\.py|obligations\.py|python scripts|\bBash\b/);
    }
  });
  it("system prompt keeps the iron rules verbatim", () => {
    expect(systemPrompt).toContain("**Never invent a fact.**");
    expect(systemPrompt).toContain("**Your inventions come out.**");
    expect(systemPrompt).toContain("**The user is the final authority.**");
  });
  it("system prompt keeps the approval table", () => {
    expect(systemPrompt).toContain("| Anything outside the graph folder | the plugin will pause and ask the user |");
  });
  it("system prompt drops the mechanical session-end section", () => {
    expect(systemPrompt).not.toContain("## Session end, mechanically");
  });
  /**
   * Wrap-up is gone whole — button, canned message and ritual. The plan under
   * docs/ still describes it, so this guards against it being read back in.
   */
  it("no asset asks for a session log or a wrap-up", () => {
    for (const asset of [systemPrompt, grill, consult]) {
      expect(asset).not.toMatch(/[Ww]rap up|## Ending a session|session log/);
    }
  });
});

describe("buildSystemPrompt", () => {
  it("stitches system + grill + consult with separators", () => {
    const full = buildSystemPrompt();
    expect(full).toContain("# obsidian:knowledge-graph");
    expect(full).toContain("# Grill — the interview loop");
    expect(full).toContain("# Consult — answering from the graph");
  });
  it("warns the model that the file references are inline", () => {
    expect(buildSystemPrompt()).toContain("points within this one document");
  });
});

describe("buildSessionPreamble", () => {
  const base = {
    hubPath: "Noir game/Noir game.md",
    todayIso: "2026-08-11",
    stats: { nodes: 4, hubChildren: 2 },
    problems: [],
  };

  it("names the hub, the date and the shape", () => {
    const preamble = buildSessionPreamble(base);
    expect(preamble).toContain("Noir game/Noir game.md");
    expect(preamble).toContain("2026-08-11");
    expect(preamble).toContain("4 nodes, 2 of them hanging directly off the hub");
  });

  /**
   * The structure check used to be a notice printed to the user after wrap-up.
   * It rides in the preamble now, so the model is the one who acts on it.
   */
  it("says so plainly when the graph is clean", () => {
    expect(buildSessionPreamble(base)).toContain("Structure check: clean.");
  });

  it("lists each problem as kind, note and detail", () => {
    const preamble = buildSessionPreamble({
      ...base,
      problems: [
        { kind: "unresolved-parent", note: "Heavy Rain.md", detail: "parent 'References' names no note in this graph" },
        { kind: "duplicate-name", note: "Observer.md", detail: "name is shared by References/Observer.md" },
      ],
    });
    expect(preamble).toContain("[unresolved-parent] Heavy Rain.md — parent 'References' names no note in this graph");
    expect(preamble).toContain("[duplicate-name] Observer.md — name is shared by References/Observer.md");
    expect(preamble).not.toContain("Structure check: clean.");
  });

  /** The register is gone: no vault-authored text rides inside the system prompt any more. */
  it("carries no obligations register", () => {
    const preamble = buildSessionPreamble(base);
    expect(preamble).not.toContain("obligations-register");
    expect(preamble.toLowerCase()).not.toContain("owed");
  });
});
