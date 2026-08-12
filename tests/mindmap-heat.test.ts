import { describe, it, expect } from "vitest";
import { countOpenQuestions, heatBucket, heatClass, HEAT_MAX } from "../src/mindmap/heat";
import { loadFixtureVault } from "./helpers/load-fixture";
import { GraphModel } from "../src/graph/graph-model";
import { buildMindmapData } from "../src/mindmap/layout";
import type { MindmapNode } from "../src/mindmap/layout";

function dataFor(fixture: string, graphDir: string, collapsed: string[] = []) {
  const vault = loadFixtureVault(fixture);
  const model = new GraphModel(vault.rootName, vault.files);
  return buildMindmapData(model, graphDir, new Set(collapsed));
}

function findNode(node: MindmapNode, stem: string): MindmapNode | null {
  if (node.stem === stem) return node;
  for (const child of node.children) {
    const hit = findNode(child, stem);
    if (hit !== null) return hit;
  }
  return null;
}

const REFERENCES = "Noir game/References/References.md";
const HUB = "Noir game/Noir game.md";

describe("countOpenQuestions", () => {
  it("counts an unchecked box", () => {
    expect(countOpenQuestions("Body.\n\n- [ ] What broke the marriage?\n")).toBe(1);
  });

  it("does not count a box the user has ticked", () => {
    expect(countOpenQuestions("- [x] answered\n- [X] also answered\n- [ ] still open\n")).toBe(1);
  });

  it("counts an indented box — a question nested under a bullet is still owed", () => {
    expect(countOpenQuestions("- the scene\n  - [ ] who else is in the room?\n")).toBe(1);
  });

  it("counts the other list bullets Markdown allows", () => {
    expect(countOpenQuestions("* [ ] star\n+ [ ] plus\n- [ ] dash\n")).toBe(3);
  });

  it("ignores a fenced example — a box in a code block is documentation, not a question", () => {
    const text = ["- [ ] real", "", "```md", "- [ ] an example that never counts", "```", "", "- [ ] also real"].join("\n");
    expect(countOpenQuestions(text)).toBe(2);
  });

  it("ignores boxes in frontmatter, matching how links are read from the body", () => {
    expect(countOpenQuestions("---\nkind: scene\naliases:\n  - [ ]\n---\n\n- [ ] the only real one\n")).toBe(1);
  });

  it("survives CRLF — the split(\"\\n\") trap that once dropped every task", () => {
    expect(countOpenQuestions("---\r\nkind: scene\r\n---\r\n\r\n- [ ] one\r\n- [ ] two\r\n")).toBe(2);
  });

  it("survives a BOM", () => {
    expect(countOpenQuestions("\uFEFF- [ ] a BOM'd question still counts\n")).toBe(1);
  });

  it("ignores a box that is not opening a list item", () => {
    expect(countOpenQuestions("see the note - [ ] is not a task here\n")).toBe(0);
  });

  it("is zero for a note that asks nothing", () => {
    expect(countOpenQuestions("---\nkind: scene\n---\n\nJust prose.\n")).toBe(0);
  });

  // Both are spelled out in the `simple` fixture, which says in its own words
  // that neither should surface.
  it("does not count a cancelled line", () => {
    expect(countOpenQuestions("- [-] a cancelled line never surfaces\n")).toBe(0);
  });

  it("does not count a numbered line", () => {
    expect(countOpenQuestions("1. [ ] a numbered line is not a task\n")).toBe(0);
  });
});

describe("heatBucket", () => {
  it("maps a count straight onto the scale", () => {
    expect(heatBucket(0)).toBe(0);
    expect(heatBucket(4)).toBe(4);
    expect(heatBucket(HEAT_MAX)).toBe(HEAT_MAX);
  });

  it("clamps anything past the top of the scale — 40 questions is not hotter than 10", () => {
    expect(heatBucket(HEAT_MAX + 1)).toBe(HEAT_MAX);
    expect(heatBucket(400)).toBe(HEAT_MAX);
  });

  it("tops out at ten, so the palette stays a fixed eleven steps", () => {
    expect(HEAT_MAX).toBe(10);
  });
});

describe("heatClass", () => {
  it("names the palette step the stylesheet declares", () => {
    expect(heatClass(0)).toBe("cb-mm-heat-0");
    expect(heatClass(6)).toBe("cb-mm-heat-6");
  });

  it("clamps through the same scale, so a hot node never asks for a class that does not exist", () => {
    expect(heatClass(97)).toBe(`cb-mm-heat-${HEAT_MAX}`);
  });
});

describe("heat on the mindmap tree", () => {
  it("every node carries its own count, and only its own", () => {
    const data = dataFor("simple", "Noir game");
    // The hub asks one live question; its second box sits in a fence.
    expect(data.root!.openQuestions).toBe(1);
    expect(findNode(data.root!, "References")!.openQuestions).toBe(0);
    expect(findNode(data.root!, "Heavy Rain")!.openQuestions).toBe(4);
    expect(findNode(data.root!, "Observer")!.openQuestions).toBe(3);
    expect(findNode(data.root!, "Мысли")!.openQuestions).toBe(4);
  });

  it("an expanded node hides nothing, so its child-ref count is zero", () => {
    const data = dataFor("simple", "Noir game");
    expect(findNode(data.root!, "References")!.hiddenOpenQuestions).toBe(0);
    expect(data.root!.hiddenOpenQuestions).toBe(0);
  });

  it("a collapsed node sums the questions of everything it hides", () => {
    const data = dataFor("simple", "Noir game", [REFERENCES]);
    const refs = findNode(data.root!, "References")!;
    expect(refs.children).toEqual([]);
    expect(refs.openQuestions).toBe(0); // its own body still asks nothing
    expect(refs.hiddenOpenQuestions).toBe(7); // Heavy Rain 4 + Observer 3
  });

  it("the sum reaches the whole hidden subtree, not just the children", () => {
    const data = dataFor("simple", "Noir game", [HUB]);
    // References 0 + Heavy Rain 4 + Observer 3 + Мысли 4 — two levels down.
    expect(data.root!.hiddenOpenQuestions).toBe(11);
    expect(data.root!.openQuestions).toBe(1);
  });
});
