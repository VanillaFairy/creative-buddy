import { describe, it, expect } from "vitest";
import systemPrompt from "../assets/prompts/system.md";
import grill from "../assets/prompts/grill.md";
import consult from "../assets/prompts/consult.md";
import askMe from "../assets/prompts/presets/ask-me.md";
import summarize from "../assets/prompts/presets/summarize.md";
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

/**
 * The vocabulary contract, mechanically.
 *
 * `## One name per thing` in the system prompt is the whole rule, and most of it
 * is guidance no check can grade — whether a sentence used "node" in the sense
 * the glossary means takes a reader. What a check can do is hold the line on the
 * names that have already drifted once, so a second name for a settled concept
 * cannot quietly come back. Every string below was a real regression found in a
 * live graph, not a hypothetical one.
 */
describe("one name per thing", () => {
  // The presets are shipped prompt text like any other, and they talk to the
  // user about the same concepts, so they answer to the same glossary.
  const ASSETS: Array<[string, string]> = [
    ["system.md", systemPrompt],
    ["grill.md", grill],
    ["consult.md", consult],
    ["presets/ask-me.md", askMe],
    ["presets/summarize.md", summarize],
  ];

  /**
   * The glossary has to name the retired words in order to retire them, so table
   * rows come out before the scan. Prose is what this guards; a regression that
   * appears only inside a table is out of its reach, and that is the trade.
   */
  const prose = (asset: string): string =>
    asset
      .split("\n")
      .filter((line) => !line.startsWith("| "))
      .join("\n");

  it("the system prompt fixes all four reserved headings", () => {
    for (const heading of ["## Charter", "## Shape", "## Open questions", "## Closed questions"]) {
      expect(systemPrompt).toContain(`| \`${heading}\``);
    }
  });

  it("no asset uses a retired name for a settled concept", () => {
    const retired = [/middle node/i, /compost question/i, /a grilling/i, /Open on this note/i];
    const offenders: string[] = [];
    for (const [name, asset] of ASSETS) {
      for (const pattern of retired) if (pattern.test(prose(asset))) offenders.push(`${name} → ${pattern.source}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the closed-question pair is shown in the shape it must be written in", () => {
    // Bold question, plain answer on the very next line — one paragraph, the
    // boldness doing the separating. The prompt carries a worked example, and
    // this is what stops that example drifting from the prose describing it.
    expect(systemPrompt).toMatch(/^\*\*Q\. .+\*\*\nA\. /m);
    expect(systemPrompt).toContain("**Answering one moves it.**");
  });

  it("no asset still tells the interviewer to tick a box in place", () => {
    for (const [name, asset] of ASSETS) {
      expect([name, /[Tt]ick anything|ticks on questions/.test(asset)]).toEqual([name, false]);
    }
    expect(systemPrompt).toContain("| Closing a question they just answered | silent |");
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
