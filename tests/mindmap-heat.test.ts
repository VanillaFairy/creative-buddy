import { describe, it, expect } from "vitest";
import { heatBucket, heatClass, HEAT_MAX } from "../src/mindmap/heat";
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
