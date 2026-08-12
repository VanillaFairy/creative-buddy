import { describe, it, expect } from "vitest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { GraphModel } from "../src/graph/graph-model";
import { buildMindmapData } from "../src/mindmap/layout";
import { CollapseStore } from "../src/mindmap/collapse-store";

function dataFor(fixture: string, graphDir: string, collapsed: string[] = []) {
  const vault = loadFixtureVault(fixture);
  const model = new GraphModel(vault.rootName, vault.files);
  return buildMindmapData(model, graphDir, new Set(collapsed));
}

describe("buildMindmapData", () => {
  it("builds the tree from parent edges, hub at the root, children in normcase order", () => {
    const data = dataFor("simple", "Noir game");
    expect(data.root!.stem).toBe("Noir game");
    expect(data.root!.children.map((c) => c.stem)).toEqual(["References", "Мысли"]);
    const refs = data.root!.children[0]!;
    expect(refs.children.map((c) => c.stem)).toEqual(["Heavy Rain", "Observer"]);
  });

  it("collapse hides children but flags them", () => {
    const data = dataFor("simple", "Noir game", ["Noir game/References/References.md"]);
    const refs = data.root!.children[0]!;
    expect(refs.children).toEqual([]);
    expect(refs.collapsedChildren).toBe(2);
  });

  it("unreachable notes land in the tray with their parent claim", () => {
    const data = dataFor("problems", "Tangle");
    const stems = data.unreachable.map((u) => u.stem).sort();
    expect(stems).toEqual(["Ghost", "Loop A", "Loop B", "Loop C", "Orphan"]);
    expect(data.unreachable.find((u) => u.stem === "Ghost")!.parent).toBe("Nobody");
    expect(data.unreachable.find((u) => u.stem === "Orphan")!.parent).toBeNull();
  });

  it("cross-links are non-parent wikilinks resolved inside the graph", () => {
    const data = dataFor("simple", "Noir game");
    // The hub's Shape links to References and Heavy Rain; References is a parent edge target of the hub? No —
    // parent edges point child→parent, so hub→References is NOT a parent edge and both links survive.
    expect(data.crossLinks).toContainEqual({ from: "Noir game/Noir game.md", to: "Noir game/References/References.md" });
    expect(data.crossLinks).toContainEqual({ from: "Noir game/Noir game.md", to: "Noir game/Heavy Rain.md" });
  });

  it("badges carry the validation kinds, and stay empty for a clean note", () => {
    const data = dataFor("problems", "Tangle");
    expect(findNode(data.root!, "Lost")!.problemKinds).toContain("misfiled");
    const tangle = dataFor("simple", "Noir game");
    expect(findNode(tangle.root!, "Observer")!.problemKinds).toEqual([]);
  });

  it("stats ride along for the hub badge", () => {
    const data = dataFor("simple", "Noir game");
    expect(data.stats).toEqual({ nodes: 4, hubChildren: 2 });
  });

  it("missing graph directory yields a null root and null stats", () => {
    const data = dataFor("simple", "NoSuchGraph");
    expect(data.root).toBeNull();
    expect(data.stats).toBeNull();
  });
});

function findNode(root: import("../src/mindmap/layout").MindmapNode, stem: string): import("../src/mindmap/layout").MindmapNode | null {
  if (root.stem === stem) return root;
  for (const child of root.children) {
    const hit = findNode(child, stem);
    if (hit !== null) return hit;
  }
  return null;
}

describe("CollapseStore", () => {
  it("persists per-graph collapse sets through JSON", () => {
    const store = new CollapseStore();
    store.toggle("Noir game", "Noir game/References/References.md");
    expect(store.isCollapsed("Noir game", "Noir game/References/References.md")).toBe(true);
    const revived = CollapseStore.fromJSON(store.toJSON());
    expect(revived.isCollapsed("Noir game", "Noir game/References/References.md")).toBe(true);
    revived.toggle("Noir game", "Noir game/References/References.md");
    expect(revived.isCollapsed("Noir game", "Noir game/References/References.md")).toBe(false);
  });
});
