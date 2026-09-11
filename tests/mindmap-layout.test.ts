import { describe, it, expect } from "vitest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { GraphModel } from "../src/graph/graph-model";
import { buildMindmapData } from "../src/mindmap/layout";
import { CollapseStore } from "../src/mindmap/collapse-store";
import { radialLayout, reachFor } from "../src/mindmap/radial";
import { hiddenIfFolded } from "../src/mindmap/fold";

/** `References`, found by name: it is no longer the hub's first child. */
function refsIn(data: ReturnType<typeof dataFor>) {
  return data.root!.children.find((c) => c.stem === "References")!;
}

function dataFor(fixture: string, graphDir: string, collapsed: string[] = []) {
  const vault = loadFixtureVault(fixture);
  const model = new GraphModel(vault.rootName, vault.files);
  return buildMindmapData(model, graphDir, new Set(collapsed));
}

describe("buildMindmapData", () => {
  it("builds the tree from the folders, hub at the root, children in normcase order", () => {
    // `Heavy Rain.md` sits in the graph's own folder, so it hangs off the hub —
    // the `parent: References` it used to carry moved it a level down, and a
    // folder cannot say that. `Observer.md` is in `References/`, so it does.
    const data = dataFor("simple", "Noir game");
    expect(data.root!.stem).toBe("Noir game");
    expect(data.root!.children.map((c) => c.stem)).toEqual(["Heavy Rain", "References", "Мысли"]);
    expect(refsIn(data).children.map((c) => c.stem)).toEqual(["Observer"]);
  });

  it("collapse hides children but flags them", () => {
    const data = dataFor("simple", "Noir game", ["Noir game/References/References.md"]);
    const refs = refsIn(data);
    expect(refs.children).toEqual([]);
    expect(refs.collapsedChildren).toBe(1);
  });

  it("draws every note, because a folder always leads back to the hub", () => {
    // These five used to sit in a tray: an orphan, a note claiming a parent
    // that was not there, and a ring of three. None of those shapes can be
    // built out of folders, so all five are simply on the tree.
    const data = dataFor("problems", "Tangle");
    for (const stem of ["Ghost", "Loop A", "Loop B", "Loop C", "Orphan"]) {
      expect(findNode(data.root!, stem), `${stem} is not on the tree`).not.toBeNull();
    }
  });

  it("cross-links are non-parent wikilinks resolved inside the graph", () => {
    const data = dataFor("simple", "Noir game");
    // The hub's Shape links to References and Heavy Rain; References is a parent edge target of the hub? No —
    // parent edges point child→parent, so hub→References is NOT a parent edge and both links survive.
    expect(data.crossLinks).toContainEqual({ from: "Noir game/Noir game.md", to: "Noir game/References/References.md" });
    expect(data.crossLinks).toContainEqual({ from: "Noir game/Noir game.md", to: "Noir game/Heavy Rain.md" });
  });

  it("hands a note in a folder nobody speaks for up to the one who does", () => {
    // `Lost` sits in `Misplaced/`, which has no note of its own. That used to
    // be a complaint; now the folder is simply passed through.
    const data = dataFor("problems", "Tangle");
    expect(findNode(data.root!, "Lost")).not.toBeNull();
    expect(data.root!.children.some((c) => c.stem === "Lost")).toBe(true);
  });

  it("stats ride along for the hub badge", () => {
    const data = dataFor("simple", "Noir game");
    expect(data.stats).toEqual({ nodes: 4, hubChildren: 3 });
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

/**
 * The radial map draws every note in one circle, so repacking on a fold moves
 * notes the fold never touched — you collapse one branch and the note you were
 * reading jumps across the map. Asked for the whole tree, the builder returns
 * the same tree whatever is folded, and says which notes to leave undrawn.
 */
describe("buildMindmapData, laying out the whole tree", () => {
  function wholeTree(collapsed: string[] = []) {
    const vault = loadFixtureVault("simple");
    const model = new GraphModel(vault.rootName, vault.files);
    return buildMindmapData(model, "Noir game", new Set(collapsed), { prune: false });
  }

  const shapeOf = (node: { stem: string; children: readonly unknown[] }): unknown => ({
    stem: node.stem,
    children: (node.children as { stem: string; children: readonly unknown[] }[]).map(shapeOf),
  });

  const refs = "Noir game/References/References.md";

  it("keeps every note in the tree when a branch is folded", () => {
    expect(shapeOf(wholeTree([refs]).root!)).toEqual(shapeOf(wholeTree().root!));
  });

  it("names the notes a fold is hiding, so the map can skip drawing them", () => {
    const folded = wholeTree([refs]);
    const open = folded.root!.children.find((c) => c.stem === "References")!;
    expect([...folded.hiddenPaths].sort()).toEqual(open.children.map((c) => c.path).sort());
    expect(folded.hiddenPaths.size).toBe(1);
  });

  it("still counts what the fold hides, so the dot can say how much", () => {
    const open = wholeTree([refs]).root!.children.find((c) => c.stem === "References")!;
    expect(open.collapsedChildren).toBe(1);
  });

  it("hides nothing when nothing is folded", () => {
    expect(wholeTree().hiddenPaths.size).toBe(0);
  });

  it("hides a whole branch, not just the children one level down", () => {
    const hub = "Noir game/Noir game.md";
    const all = wholeTree();
    const drawnUnderHub = (node: { path: string; children: { path: string }[] }): string[] =>
      node.children.flatMap((c) => [c.path, ...drawnUnderHub(c as never)]);
    expect([...wholeTree([hub]).hiddenPaths].sort()).toEqual(drawnUnderHub(all.root! as never).sort());
  });

  it("leaves the pruned tree alone, so the flat map is unaffected", () => {
    const vault = loadFixtureVault("simple");
    const model = new GraphModel(vault.rootName, vault.files);
    const pruned = buildMindmapData(model, "Noir game", new Set([refs]));
    expect(pruned.root!.children[0]!.children).toEqual([]);
    expect(pruned.hiddenPaths.size).toBe(0);
  });
});

/**
 * The promise the whole change exists to keep, checked end to end: build, lay
 * out, fold, lay out again, and compare where the notes ended up.
 */
describe("folding a branch on the radial map", () => {
  const measure = (text: string): number => [...text].length * 7;
  const refs = "Noir game/References/References.md";

  function placed(collapsed: string[]) {
    const vault = loadFixtureVault("simple");
    const model = new GraphModel(vault.rootName, vault.files);
    const data = buildMindmapData(model, "Noir game", new Set(collapsed), { prune: false });
    const reaching = new Map<string, ReturnType<typeof reachFor>>();
    const layout = radialLayout(data.root!, (node) => {
      const hit = reaching.get(node.path);
      if (hit !== undefined) return hit.reach;
      const built = reachFor(node.stem, node.path === data.root!.path, hiddenIfFolded(node), measure);
      reaching.set(node.path, built);
      return built.reach;
    });
    return { layout, hidden: data.hiddenPaths };
  }

  it("moves no note that stays on screen", () => {
    const open = placed([]);
    const folded = placed([refs]);
    const before = new Map(open.layout.nodes.map((n) => [n.path, { x: n.x, y: n.y }]));

    const stillDrawn = folded.layout.nodes.filter((n) => !folded.hidden.has(n.path));
    expect(stillDrawn.length).toBeGreaterThan(1);
    expect(stillDrawn.length).toBeLessThan(open.layout.nodes.length);

    for (const node of stillDrawn) {
      const was = before.get(node.path)!;
      expect(node.x).toBe(was.x);
      expect(node.y).toBe(was.y);
    }
  });

  it("leaves the folded branch's own dot where it was, so it can be reopened", () => {
    const before = placed([]).layout.nodes.find((n) => n.path === refs)!;
    const after = placed([refs]).layout.nodes.find((n) => n.path === refs)!;
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
  });
});

/**
 * A colour reaches the note that asks for it and everything below that note in
 * the tree — and the tree is the folder tree, so a plain folder is not a
 * generation and the notes inside it pass up to the branch above. What a node
 * carries is the *effective* colour: nothing downstream walks upward looking
 * for one.
 */
describe("colour down a branch", () => {
  type MapNode = import("../src/mindmap/layout").MindmapNode;

  const CHARTER = "## Charter\n\nA noir game.\n";
  const PLAIN = "Body.\n";
  const coloured = (colour: string, body: string = PLAIN): string =>
    `---\ncolor: "${colour}"\n---\n\n${body}`;

  const HUB = "Noir game/Noir game.md";
  const CAST = "Noir game/Cast/Cast.md";
  const VILLAINS = "Noir game/Cast/Villains/Villains.md";
  const WITNESS = "Noir game/Cast/Witness.md";
  const GOON = "Noir game/Cast/Villains/Henchmen/Goon.md";
  const DOODLE = "Noir game/Cast/Sketches/Doodle.md";

  /**
   * Cast is coloured and Villains recolours itself from there down. The rest
   * are the awkward shapes: Suspects is a branch note with no colour of its
   * own, so a colour has to cross it; Sketches is a plain folder, so Doodle
   * reaches Cast by passing up through it; Understudy asks for a value that is
   * not a colour; Witness sorts *after* Villains, so a colour smeared sideways
   * along a brood instead of carried down lands on it. Places and Props are
   * the control limbs.
   */
  const graph = (): GraphModel =>
    new GraphModel(
      "Vault",
      new Map([
        [HUB, CHARTER],
        [CAST, coloured("#C94F7C")],
        ["Noir game/Cast/Detective.md", PLAIN],
        [DOODLE, PLAIN],
        ["Noir game/Cast/Suspects/Suspects.md", PLAIN],
        ["Noir game/Cast/Suspects/Butler.md", PLAIN],
        ["Noir game/Cast/Understudy.md", coloured("#12345")],
        [VILLAINS, coloured("teal")],
        ["Noir game/Cast/Villains/Kingpin.md", PLAIN],
        ["Noir game/Cast/Villains/Henchmen/Henchmen.md", PLAIN],
        [GOON, PLAIN],
        [WITNESS, PLAIN],
        ["Noir game/Places/Places.md", PLAIN],
        ["Noir game/Places/Docks.md", PLAIN],
        ["Noir game/Props/Props.md", PLAIN],
        ["Noir game/Props/Knife.md", coloured("gold")],
        ["Noir game/Props/Rope.md", PLAIN],
      ]),
    );

  const built = (collapsed: string[] = [], options?: { prune: boolean }) =>
    buildMindmapData(graph(), "Noir game", new Set(collapsed), options);

  function nodeFor(data: ReturnType<typeof buildMindmapData>, stem: string): MapNode {
    const hit = findNode(data.root!, stem);
    expect(hit, `${stem} is not on the tree`).not.toBeNull();
    return hit!;
  }

  const colourOf = (data: ReturnType<typeof buildMindmapData>, stem: string): string | null =>
    nodeFor(data, stem).color;

  /** Every drawn note's effective colour, by path. */
  function coloursIn(data: ReturnType<typeof buildMindmapData>): Map<string, string | null> {
    const out = new Map<string, string | null>();
    const walk = (node: MapNode): void => {
      out.set(node.path, node.color);
      for (const kid of node.children) walk(kid);
    };
    walk(data.root!);
    return out;
  }

  it("paints the note that asks for it", () => {
    expect(colourOf(built(), "Cast")).toBe("#c94f7c");
  });

  it("reaches a child, and a grandchild through a branch note with no colour of its own", () => {
    const data = built();
    expect(colourOf(data, "Detective")).toBe("#c94f7c");
    expect(colourOf(data, "Suspects")).toBe("#c94f7c");
    expect(colourOf(data, "Butler")).toBe("#c94f7c");
  });

  it("reaches a note that a plain folder handed up to the branch", () => {
    const data = built();
    expect(findNode(data.root!, "Sketches"), "Sketches speaks for nothing").toBeNull();
    expect(colourOf(data, "Doodle")).toBe("#c94f7c");
  });

  it("a nearer colour takes over from its own note all the way down", () => {
    const data = built();
    for (const stem of ["Villains", "Kingpin", "Henchmen", "Goon"]) {
      expect(colourOf(data, stem), stem).toBe("teal");
    }
  });

  it("carries a colour down, never sideways to a later sibling", () => {
    // Witness comes after Villains in its brood and is no relation of it.
    const data = built();
    expect(colourOf(data, "Witness")).toBe("#c94f7c");
    expect(colourOf(data, "Places")).toBeNull();
    expect(colourOf(data, "Props")).toBeNull();
  });

  it("leaves the rest of the graph alone, above and beside", () => {
    const data = built();
    for (const stem of ["Noir game", "Places", "Docks", "Props", "Rope"]) {
      expect(colourOf(data, stem), stem).toBeNull();
    }
  });

  it("a value it cannot read is no colour at all, so the branch above still reaches", () => {
    expect(colourOf(built(), "Understudy")).toBe("#c94f7c");
  });

  it("a colour on a leaf paints that one dot and nothing around it", () => {
    const data = built();
    expect(nodeFor(data, "Knife").children, "Knife is meant to be a leaf").toEqual([]);
    expect(colourOf(data, "Knife")).toBe("gold");
    expect(colourOf(data, "Props")).toBeNull();
    expect(colourOf(data, "Rope")).toBeNull();
  });

  it("says what colour every node is, and invents none", () => {
    const model = graph();
    const asked = new Set(
      model.notes("Noir game").map((n) => n.color).filter((c): c is string => c !== null),
    );
    expect(asked.size).toBeGreaterThan(0);
    for (const [path, colour] of coloursIn(buildMindmapData(model, "Noir game", new Set()))) {
      expect(colour === null || asked.has(colour), `${path} was painted ${String(colour)}`).toBe(true);
    }
  });

  it("a colour on the hub paints the whole graph, until a nearer one takes over", () => {
    const model = new GraphModel(
      "Vault",
      new Map([
        [HUB, coloured("teal", CHARTER)],
        ["Noir game/Places/Places.md", PLAIN],
        ["Noir game/Places/Docks.md", PLAIN],
        [CAST, coloured("#c94f7c")],
        ["Noir game/Cast/Detective.md", PLAIN],
      ]),
    );
    const data = buildMindmapData(model, "Noir game", new Set());
    for (const stem of ["Noir game", "Places", "Docks"]) {
      expect(colourOf(data, stem), stem).toBe("teal");
    }
    for (const stem of ["Cast", "Detective"]) {
      expect(colourOf(data, stem), stem).toBe("#c94f7c");
    }
  });

  it("a colour inside a plain folder paints nobody else in that folder", () => {
    // Scraps speaks for nothing, so both of these hang off the hub as
    // siblings — sharing a folder is not a relation.
    const model = new GraphModel(
      "Vault",
      new Map([
        [HUB, CHARTER],
        ["Noir game/Scraps/Bright.md", coloured("gold")],
        ["Noir game/Scraps/Plain.md", PLAIN],
      ]),
    );
    const data = buildMindmapData(model, "Noir game", new Set());
    expect(data.root!.children.map((c) => c.stem)).toEqual(["Bright", "Plain"]);
    expect(colourOf(data, "Bright")).toBe("gold");
    expect(colourOf(data, "Plain")).toBeNull();
    expect(colourOf(data, "Noir game")).toBeNull();
  });

  it("a branch note beside its folder reaches into it, and no further", () => {
    const model = new GraphModel(
      "Vault",
      new Map([
        [HUB, CHARTER],
        ["Noir game/Relics.md", coloured("gold")],
        ["Noir game/Relics/Amulet.md", PLAIN],
        ["Noir game/Sundries.md", PLAIN],
      ]),
    );
    const data = buildMindmapData(model, "Noir game", new Set());
    expect(nodeFor(data, "Relics").children.map((c) => c.stem)).toEqual(["Amulet"]);
    expect(colourOf(data, "Relics")).toBe("gold");
    expect(colourOf(data, "Amulet")).toBe("gold");
    expect(colourOf(data, "Sundries")).toBeNull();
  });

  it("a fold changes which notes are in the tree, never what colour one is", () => {
    const open = coloursIn(built());
    const folded = coloursIn(built([VILLAINS]));
    expect(folded.get(WITNESS)).toBe("#c94f7c");
    expect(folded.get(VILLAINS)).toBe("teal");
    expect(folded.size).toBeLessThan(open.size);
    for (const [path, colour] of folded) expect(colour, path).toBe(open.get(path));
  });

  it("a fold does not wash the colour out of what it hides", () => {
    // The circle asks for the whole tree and draws part of it, so a folded
    // note is still built — and still has to know what colour it is.
    const folded = coloursIn(built([CAST], { prune: false }));
    expect(folded.get(DOODLE)).toBe("#c94f7c");
    expect(folded.get(GOON)).toBe("teal");
    expect(folded).toEqual(coloursIn(built([], { prune: false })));
  });
});
