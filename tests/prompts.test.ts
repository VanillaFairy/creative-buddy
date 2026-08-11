import { describe, it, expect } from "vitest";
import systemPrompt from "../assets/prompts/system.md";
import grill from "../assets/prompts/grill.md";
import consult from "../assets/prompts/consult.md";
import { buildSystemPrompt, buildSessionPreamble } from "../src/agent/prompts";
import { renderDigestForGraph } from "../src/agent/digest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { VaultView } from "../src/graph/types";
import { buildObligationsReport } from "../src/graph/obligations";

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
  it("system prompt keeps the approval table and the wrap-up trigger", () => {
    expect(systemPrompt).toContain("| Anything outside the graph folder | the plugin will pause and ask the user |");
    expect(systemPrompt).toContain("Wrap up");
  });
  it("system prompt drops the mechanical session-end section", () => {
    expect(systemPrompt).not.toContain("## Session end, mechanically");
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
  it("names the hub, the date, the shape and the digest", () => {
    const preamble = buildSessionPreamble({
      graphDir: "Noir game",
      hubPath: "Noir game/Noir game.md",
      todayIso: "2026-08-11",
      stats: { nodes: 4, hubChildren: 2 },
      digestLines: ["Overdue:", "  2026-08-05 — pull three screenshots for the board  (Noir game/References/Observer.md:10)"],
    });
    expect(preamble).toContain("Noir game/Noir game.md");
    expect(preamble).toContain("2026-08-11");
    expect(preamble).toContain("4 nodes, 2 of them hanging directly off the hub");
    expect(preamble).toContain("Overdue:");
  });
  it("says so when nothing is due", () => {
    const preamble = buildSessionPreamble({
      graphDir: "Noir game",
      hubPath: "Noir game/Noir game.md",
      todayIso: "2026-08-11",
      stats: { nodes: 4, hubChildren: 2 },
      digestLines: [],
    });
    expect(preamble).toContain("Nothing is due or owed today.");
  });
});

describe("renderDigestForGraph", () => {
  it("mirrors the oracle digest format and hides later/parked", () => {
    const view = new VaultView(loadFixtureVault("simple"));
    const report = buildObligationsReport(view, { y: 2026, m: 8, d: 11 });
    const lines = renderDigestForGraph(report, "Noir game");
    expect(lines[0]).toBe("Overdue:");
    expect(lines.join("\n")).toContain("(Noir game/References/Observer.md:");
    expect(lines.join("\n")).not.toContain("revisit the charter"); // later bucket stays hidden
    expect(lines.join("\n")).not.toContain("tatami"); // parked stays hidden
  });
});
