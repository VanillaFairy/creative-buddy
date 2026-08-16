import { describe, it, expect } from "vitest";
import systemPrompt from "../assets/prompts/system.md";
import grill from "../assets/prompts/grill.md";
import consult from "../assets/prompts/consult.md";
import askMe from "../assets/prompts/presets/ask-me.md";
import summarize from "../assets/prompts/presets/summarize.md";
import { buildSystemPrompt, buildSessionPreamble } from "../src/agent/prompts";
import { noteAnnouncement } from "../src/chat/note-context";

/**
 * A prompt is prose, so it is soft-wrapped, and a phrase worth asserting on
 * lands wherever the wrap puts it. Comparing against flattened whitespace is
 * what stops a reflow — an edit that changes nothing the model reads — from
 * turning the suite red. This has now caught two people out.
 */
const flat = (markdown: string): string => markdown.replace(/\s+/g, " ");

describe("shipped prompt assets", () => {
  it("no asset references the python scripts or Bash", () => {
    for (const asset of [systemPrompt, grill, consult]) {
      expect(asset).not.toMatch(/graph_check\.py|obligations\.py|python scripts|\bBash\b/);
    }
  });
  it("system prompt keeps the iron rules verbatim", () => {
    expect(systemPrompt).toContain("**Never invent a fact.**");
    expect(systemPrompt).toContain("**Your inventions come out.**");
    expect(systemPrompt).toContain("**Questions and ideas are not statements.**");
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

  /**
   * The panel says which note is open (src/chat/note-context.ts). This is the
   * other end of that wire: without the rule, the line arrives as an odd remark.
   */
  it("system prompt says what an open-note line means", () => {
    expect(systemPrompt).toContain("**The note the user is reading comes first.**");
    expect(flat(systemPrompt)).toContain("context for you, never content");
  });

  /**
   * The panel has a second line, for when the user leaves. It needs pinning to
   * the prompt the same way, or half the wire is guarded and the other half can
   * drift — which is the defect this pair of tests exists to prevent, half done.
   */
  it("the rule covers the line that says the user has left", () => {
    const away = noteAnnouncement(null, "Fiction/Solaris/The contact.md")!;
    // Without its capital and full stop, so the prompt is free to quote it
    // mid-sentence and still be held to its words.
    expect(flat(systemPrompt)).toContain(away.replace(/^The /, "").replace(/\.$/, ""));
  });

  /**
   * The rule quotes a line whose words live in `note-context.ts`. Reword one end
   * and the prompt goes on describing a line that no longer arrives — with every
   * test still green, because each end is fine on its own. This is the assertion
   * that fails instead.
   */
  it("the rule quotes the line the panel actually sends", () => {
    const sent = noteAnnouncement("Fiction/Solaris/The contact.md", undefined)!;
    // Either side of the backticked path: what the line opens with, and the
    // footing it puts the path on.
    const [opening, footing] = sent.split(/`[^`]*`\./);
    expect(flat(systemPrompt)).toContain(opening!.trim());
    expect(flat(systemPrompt)).toContain(footing!.trim().replace(/\.$/, ""));
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
    for (const heading of ["## Charter", "## Shape", "## Open questions", "## Ideas to explore"]) {
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

  /**
   * A vault note has no closed questions. An answer becomes an ordinary
   * statement and the box comes off, because a `**Q.**` / `A.` pair is a second
   * copy of that statement sitting in the same file — the duplication "Writing a
   * statement" exists to forbid. The convention shipped for months and is still
   * described in the plans under `docs/`, so this is the assertion that stops it
   * being read back in. `docs/` keeps its own pairs and its own test: a spec
   * records that alternatives were weighed, a character sheet does not.
   */
  it("no asset still describes a closed-question pair", () => {
    for (const [name, asset] of ASSETS) {
      expect([name, /Closed questions|\*\*Q\. /.test(asset)]).toEqual([name, false]);
    }
    expect(systemPrompt).toContain("**Answering one dissolves it.**");
  });

  it("both note sections are told to disappear once empty", () => {
    expect(systemPrompt).toContain("**An emptied section comes out.**");
    expect(flat(systemPrompt)).toContain("`## Ideas to explore` answers to the same rule");
    expect(grill).toContain("the emptied heading goes too");
  });

  /**
   * The idea layer is the weightless half of the split, and the notation is what
   * makes it weightless: `countOpenQuestions` in src/open-questions.ts counts
   * `- [ ]` anywhere in a body without looking at headings, so an idea written as
   * a box would heat its node on the map and become exactly the obligation this
   * layer exists to remove. Plain bullets are load-bearing, not cosmetic.
   */
  it("ideas are plain bullets and are never asked", () => {
    expect(flat(systemPrompt)).toContain("plain bullets, no boxes");
    expect(systemPrompt).toContain("**Never ask an idea.**");
  });

  it("parked ideas are reached for only once nothing is open", () => {
    expect(flat(grill)).toContain("Parked ideas are doors");
    expect(flat(askMe)).toContain("Look for ideas I have parked instead");
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
