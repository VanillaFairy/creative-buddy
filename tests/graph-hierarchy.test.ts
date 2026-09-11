import { describe, it, expect } from "vitest";
import { hierarchyOf } from "../src/graph/hierarchy";

/**
 * Who hangs off what, tested from the outside.
 *
 * The tree is the folder tree. A folder speaks through a note of its own name,
 * sitting either inside it or beside it, and everything in that folder hangs
 * off that note. Nothing here reads frontmatter, because nothing in the answer
 * depends on it any more.
 */

const GRAPH = "Game";
const HUB = "Game/Game.md";

/** The tree as `parent -> child` pairs, easiest to read and to write. */
const edges = (paths: string[], graphDir = GRAPH, hub = HUB): string[] => {
  const { parentOf } = hierarchyOf(paths, graphDir, hub);
  return [...parentOf.entries()].map(([child, parent]) => `${parent} -> ${child}`).sort();
};

const parentOf = (paths: string[], child: string): string | undefined =>
  hierarchyOf(paths, GRAPH, HUB).parentOf.get(child);

describe("hierarchyOf: the folder is the parent", () => {
  it("gives the hub no parent, because it is the root", () => {
    const { parentOf } = hierarchyOf([HUB, "Game/Loose.md"], GRAPH, HUB);
    expect(parentOf.has(HUB)).toBe(false);
  });

  it("hangs a note in the graph's own folder off the hub", () => {
    expect(parentOf([HUB, "Game/Loose.md"], "Game/Loose.md")).toBe(HUB);
  });

  it("hangs a note off the note that speaks for its folder from inside", () => {
    const paths = [HUB, "Game/World/World.md", "Game/World/Dragons.md"];
    expect(parentOf(paths, "Game/World/Dragons.md")).toBe("Game/World/World.md");
  });

  it("hangs a note off the note that speaks for its folder from beside it", () => {
    // The other shape in use: the folder's note is its sibling, not its child.
    const paths = [HUB, "Game/Buddies.md", "Game/Buddies/Claire.md"];
    expect(parentOf(paths, "Game/Buddies/Claire.md")).toBe("Game/Buddies.md");
  });

  it("sends a note that speaks for its own folder up to the folder above", () => {
    // Otherwise World/World.md would be its own parent.
    const paths = [HUB, "Game/World/World.md", "Game/World/Dragons.md"];
    expect(parentOf(paths, "Game/World/World.md")).toBe(HUB);
  });

  it("sends a note that speaks for a folder from beside it up the same way", () => {
    const paths = [HUB, "Game/Buddies.md", "Game/Buddies/Claire.md"];
    expect(parentOf(paths, "Game/Buddies.md")).toBe(HUB);
  });

  it("lets a folder nobody speaks for pass its notes up to the nearest one who does", () => {
    // A grouping folder is a filing convenience, not a generation.
    const paths = [HUB, "Game/World/World.md", "Game/World/Beasts/Dragons.md"];
    expect(parentOf(paths, "Game/World/Beasts/Dragons.md")).toBe("Game/World/World.md");
  });

  it("passes a note up to the hub when no folder on the way speaks at all", () => {
    expect(parentOf([HUB, "Game/A/B/Deep.md"], "Game/A/B/Deep.md")).toBe(HUB);
  });

  it("prefers the note inside a folder to the one beside it", () => {
    // Both shapes at once is a mistake, but it has to resolve the same way
    // every time, and the nearer claim is the one inside.
    const paths = [HUB, "Game/World.md", "Game/World/World.md", "Game/World/Dragons.md"];
    expect(parentOf(paths, "Game/World/Dragons.md")).toBe("Game/World/World.md");
  });

  it("carries a deep chain one folder at a time", () => {
    const paths = [
      HUB,
      "Game/Plots/Plots.md",
      "Game/Plots/Hunt/Hunt.md",
      "Game/Plots/Hunt/One/One.md",
      "Game/Plots/Hunt/One/Images.md",
    ];
    expect(edges(paths)).toEqual([
      "Game/Game.md -> Game/Plots/Plots.md",
      "Game/Plots/Hunt/Hunt.md -> Game/Plots/Hunt/One/One.md",
      "Game/Plots/Hunt/One/One.md -> Game/Plots/Hunt/One/Images.md",
      "Game/Plots/Plots.md -> Game/Plots/Hunt/Hunt.md",
    ]);
  });
});

describe("hierarchyOf: the shapes that used to be problems", () => {
  const paths = [
    HUB,
    "Game/Plots/Hunt/One/One.md",
    "Game/Plots/Hunt/One/Images.md",
    "Game/Plots/Hunt/Two/Two.md",
    "Game/Plots/Hunt/Two/Images.md",
  ];

  it("seats two notes of the same name under different folders without complaint", () => {
    // The whole reason for the switch: a path is unique, so a namesake per
    // folder is not an ambiguity to report, it is just the tree.
    expect(parentOf(paths, "Game/Plots/Hunt/One/Images.md")).toBe("Game/Plots/Hunt/One/One.md");
    expect(parentOf(paths, "Game/Plots/Hunt/Two/Images.md")).toBe("Game/Plots/Hunt/Two/Two.md");
  });

  it("leaves no note unattached, whatever its frontmatter says", () => {
    const { parentOf: got } = hierarchyOf(paths, GRAPH, HUB);
    for (const p of paths) {
      if (p === HUB) continue;
      expect(got.get(p), `${p} hangs off nothing`).toBeDefined();
    }
  });

  it("reaches every note from the hub, so nothing can be orphaned or looping", () => {
    const { childrenOf } = hierarchyOf(paths, GRAPH, HUB);
    const seen = new Set<string>();
    const stack = [HUB];
    while (stack.length > 0) {
      const at = stack.pop()!;
      if (seen.has(at)) continue;
      seen.add(at);
      stack.push(...(childrenOf.get(at) ?? []));
    }
    expect([...seen].sort()).toEqual([...paths].sort());
  });
});

describe("hierarchyOf: what it hands back", () => {
  const paths = [HUB, "Game/b.md", "Game/A.md", "Game/c.md"];

  it("agrees with itself: every child of a parent names that parent", () => {
    const { parentOf: up, childrenOf: down } = hierarchyOf(paths, GRAPH, HUB);
    for (const [parent, kids] of down) {
      for (const kid of kids) expect(up.get(kid)).toBe(parent);
    }
    for (const [child, parent] of up) expect(down.get(parent)).toContain(child);
  });

  it("reads a brood in one settled order, whatever order it was handed", () => {
    const forwards = hierarchyOf(paths, GRAPH, HUB).childrenOf.get(HUB);
    const backwards = hierarchyOf([...paths].reverse(), GRAPH, HUB).childrenOf.get(HUB);
    expect(backwards).toEqual(forwards);
    expect(forwards).toHaveLength(3);
  });

  it("copes with a graph at the vault root", () => {
    const { parentOf: got } = hierarchyOf(["Game.md", "Notes/Thing.md"], "", "Game.md");
    expect(got.get("Notes/Thing.md")).toBe("Game.md");
  });

  it("copes with a graph of nothing but its hub", () => {
    const { parentOf: got, childrenOf } = hierarchyOf([HUB], GRAPH, HUB);
    expect(got.size).toBe(0);
    expect(childrenOf.get(HUB) ?? []).toEqual([]);
  });
});
