import { describe, it, expect } from "vitest";
import { GraphModel } from "../src/graph/graph-model";
import { buildMindmapData } from "../src/mindmap/layout";
import {
  type Highlight,
  type Links,
  neighboursOf,
  toggle,
  add,
  remove,
  extend,
  prune,
  menuFor,
  drawnLit,
} from "../src/mindmap/highlight";

// ---------------------------------------------------------------------------
// Literal fixture for the pure rules.
//
//        G.md (hub, no parent entry)
//       / |  \
//      A  B   C
//     / \
//   A1  A2
//
// Cross-links: B <-> A1 (A1 is the `to`), A2 -> C (A2 is the `from`), and a
// pathological self-link on C, to prove neighboursOf never lets a note stand
// in as its own neighbour.
// ---------------------------------------------------------------------------
const HUB = "G/G.md";
const A = "G/A.md";
const B = "G/B.md";
const C = "G/C.md";
const A1 = "G/A/A1.md";
const A2 = "G/A/A2.md";

const links: Links = {
  parentOf: new Map([
    [A, HUB],
    [B, HUB],
    [C, HUB],
    [A1, A],
    [A2, A],
  ]),
  crossLinks: [
    { from: B, to: A1 },
    { from: A2, to: C },
    { from: C, to: C },
  ],
};

/** The neighbour set a correct `neighboursOf` must produce, derived from a `Links` fixture itself. */
function expectedNeighbours(of: Links, path: string): Set<string> {
  const out = new Set<string>();
  const parent = of.parentOf.get(path);
  if (parent !== undefined) out.add(parent);
  for (const [child, parentOfChild] of of.parentOf) if (parentOfChild === path) out.add(child);
  for (const edge of of.crossLinks) {
    if (edge.from === path && edge.to !== path) out.add(edge.to);
    if (edge.to === path && edge.from !== path) out.add(edge.from);
  }
  out.delete(path);
  return out;
}

describe("neighboursOf", () => {
  it("includes the parent, every child, and cross-link partners reached as `from`", () => {
    expect(neighboursOf(links, A)).toEqual(expectedNeighbours(links, A));
    expect(neighboursOf(links, A).has(HUB)).toBe(true);
    expect(neighboursOf(links, A).has(A1)).toBe(true);
    expect(neighboursOf(links, A).has(A2)).toBe(true);
  });

  it("includes a cross-link partner reached as `to` as well as `from`", () => {
    // A1 is only ever the `to` side of its edge with B.
    expect(neighboursOf(links, A1)).toEqual(expectedNeighbours(links, A1));
    expect(neighboursOf(links, A1).has(B)).toBe(true);
    // A2 is only ever the `from` side of its edge with C.
    expect(neighboursOf(links, A2)).toEqual(expectedNeighbours(links, A2));
    expect(neighboursOf(links, A2).has(C)).toBe(true);
  });

  it("never includes the note itself, even a note with a self-link", () => {
    expect(neighboursOf(links, C).has(C)).toBe(false);
    expect(neighboursOf(links, C)).toEqual(expectedNeighbours(links, C));
    for (const path of [HUB, A, B, C, A1, A2]) expect(neighboursOf(links, path).has(path)).toBe(false);
  });

  it("gives the hub its children even though it has no parent entry", () => {
    expect(links.parentOf.has(HUB)).toBe(false);
    expect(neighboursOf(links, HUB)).toEqual(expectedNeighbours(links, HUB));
    expect(neighboursOf(links, HUB)).toEqual(new Set([A, B, C]));
  });

  it("gives a note with no connections an empty set", () => {
    const lonely: Links = { parentOf: new Map(), crossLinks: [] };
    expect(neighboursOf(lonely, "Solo/Solo.md")).toEqual(new Set());
  });
});

describe("toggle", () => {
  it("from off, centers on the note with lit = the note plus its neighbours", () => {
    const result = toggle(null, links, A);
    expect(result).not.toBeNull();
    expect(result!.center).toBe(A);
    expect(result!.lit).toEqual(new Set([A, ...neighboursOf(links, A)]));
  });

  it("toggling the center back off", () => {
    const on = toggle(null, links, A)!;
    expect(toggle(on, links, A)).toBeNull();
  });

  it("toggling another note while on recenters there and forgets any earlier add/remove history", () => {
    let state = toggle(null, links, A)!;
    // Build history: add a note that isn't a neighbour of A, and remove one that is.
    state = add(state, C);
    state = remove(state, A2);
    expect(state.lit.has(C)).toBe(true);
    expect(state.lit.has(A2)).toBe(false);

    const recentered = toggle(state, links, B)!;
    expect(recentered.center).toBe(B);
    // A fresh Highlight on B: exactly B plus its neighbours, no trace of the C add
    // or the A2 remove from the A-centered history.
    expect(recentered.lit).toEqual(new Set([B, ...neighboursOf(links, B)]));
  });
});

describe("add", () => {
  it("lights exactly the given note, leaving the rest of lit and the center untouched", () => {
    const before = toggle(null, links, A)!;
    const beforeLit = new Set(before.lit);
    const after = add(before, C);
    expect(after.center).toBe(before.center);
    expect(after.lit).toEqual(new Set([...beforeLit, C]));
    // The input state was not mutated.
    expect(before.lit).toEqual(beforeLit);
  });
});

describe("remove", () => {
  it("dims exactly the given note", () => {
    const before = toggle(null, links, A)!;
    expect(before.lit.has(A1)).toBe(true);
    const beforeLit = new Set(before.lit);
    const after = remove(before, A1);
    expect(after.center).toBe(before.center);
    expect(after.lit).toEqual(new Set([...beforeLit].filter((p) => p !== A1)));
    expect(before.lit).toEqual(beforeLit);
  });

  it("is a no-op on the center: the center stays lit", () => {
    const before = toggle(null, links, A)!;
    const after = remove(before, A);
    expect(after.center).toBe(A);
    expect(after.lit.has(A)).toBe(true);
    expect(after.lit).toEqual(before.lit);
  });
});

describe("extend", () => {
  it("lights the note and all its neighbours, including one removed earlier", () => {
    let state = toggle(null, links, HUB)!;
    // A is a neighbour of the hub; remove it, then extend from A2 (whose
    // neighbours include A) and prove A is back.
    state = remove(state, A);
    expect(state.lit.has(A)).toBe(false);
    const beforeLit = new Set(state.lit);

    const after = extend(state, links, A2);
    const expectedAdds = new Set([A2, ...neighboursOf(links, A2)]);
    expect(after.lit).toEqual(new Set([...beforeLit, ...expectedAdds]));
    expect(after.lit.has(A)).toBe(true);
    expect(after.center).toBe(state.center);
    // The input state was not mutated.
    expect(state.lit).toEqual(beforeLit);
  });
});

describe("prune", () => {
  it("leaves null as null", () => {
    expect(prune(null, new Set([A]))).toBeNull();
  });

  it("goes off when the center is missing from existing", () => {
    const state = toggle(null, links, A)!;
    expect(prune(state, new Set([B, C]))).toBeNull();
  });

  it("drops a lit non-center note that is missing, leaving the rest untouched", () => {
    const state = toggle(null, links, A)!;
    expect(state.lit.has(A1)).toBe(true);
    const existing = new Set([...state.lit].filter((p) => p !== A1));
    const after = prune(state, existing);
    expect(after).not.toBeNull();
    expect(after!.center).toBe(A);
    expect(after!.lit).toEqual(existing);
    expect(after!.lit.has(A1)).toBe(false);
  });

  it("changes nothing when nothing is missing", () => {
    const state = toggle(null, links, A)!;
    const existing = new Set([...state.lit, "G/Unrelated.md"]);
    const after = prune(state, existing);
    expect(after).not.toBeNull();
    expect(after!.center).toBe(state.center);
    expect(after!.lit).toEqual(state.lit);
  });
});

describe("menuFor", () => {
  it("off: nothing checked, no membership item, no extend", () => {
    const menu = menuFor(null, A);
    expect(menu.checked).toBe(false);
    expect(menu.membership).toBeNull();
    expect(menu.extend).toBe(false);
  });

  it("the center: checked, no membership item (no Remove on the center), extend offered", () => {
    const state = toggle(null, links, A)!;
    const menu = menuFor(state, A);
    expect(menu.checked).toBe(true);
    expect(menu.membership).toBeNull();
    expect(menu.extend).toBe(true);
  });

  it("a lit note that is not the center: unchecked, Remove offered, extend offered", () => {
    const state = toggle(null, links, A)!;
    expect(state.lit.has(A1)).toBe(true);
    const menu = menuFor(state, A1);
    expect(menu.checked).toBe(false);
    expect(menu.membership).toBe("remove");
    expect(menu.extend).toBe(true);
  });

  it("a dimmed note: unchecked, Add offered, extend offered", () => {
    const state = toggle(null, links, A)!;
    expect(state.lit.has(C)).toBe(false);
    const menu = menuFor(state, C);
    expect(menu.checked).toBe(false);
    expect(menu.membership).toBe("add");
    expect(menu.extend).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// drawnLit: literal parentOf + collapsed fixtures.
//
//   R
//   └─ P (collapsed)
//       └─ Q (collapsed)
//           └─ X
// ---------------------------------------------------------------------------
describe("drawnLit", () => {
  const R = "T/R.md";
  const P = "T/R/P.md";
  const Q = "T/R/P/Q.md";
  const X = "T/R/P/Q/X.md";
  const Y = "T/Y.md"; // a sibling branch, never folded, never lit

  const parentOf = new Map([
    [P, R],
    [Q, P],
    [X, Q],
    [Y, R],
  ]);

  const highlightOn = (lit: string[], center: string): Highlight => ({ center, lit: new Set(lit) });

  it("with no folds, drawnLit is exactly the lit set", () => {
    const state = highlightOn([R, P, Y], R);
    expect(drawnLit(state, parentOf, new Set())).toEqual(new Set([R, P, Y]));
  });

  it("a lit note under one collapsed ancestor is drawn as that ancestor", () => {
    const state = highlightOn([R, X], R);
    const result = drawnLit(state, parentOf, new Set([P]));
    expect(result.has(P)).toBe(true);
    expect(result.has(X)).toBe(false);
  });

  it("nested folds: the outermost collapsed ancestor wins, not the immediate one", () => {
    const state = highlightOn([R, X], R);
    const result = drawnLit(state, parentOf, new Set([P, Q]));
    expect(result.has(P)).toBe(true);
    expect(result.has(Q)).toBe(false);
    expect(result.has(X)).toBe(false);
  });

  it("a lit note that is itself collapsed, but not hidden by an ancestor fold, is drawn as itself", () => {
    const state = highlightOn([R, P], R);
    const result = drawnLit(state, parentOf, new Set([P]));
    expect(result.has(P)).toBe(true);
  });

  it("a collapsed branch that hides nothing lit, and is not itself lit, contributes nothing", () => {
    const state = highlightOn([R, Y], R);
    const result = drawnLit(state, parentOf, new Set([P]));
    expect(result.has(P)).toBe(false);
    expect(result).toEqual(new Set([R, Y]));
  });

  it("tolerates collapsed paths from other graphs or notes that no longer exist", () => {
    const state = highlightOn([R, Y], R);
    expect(() =>
      drawnLit(state, parentOf, new Set(["Other/graph/Ghost.md", "T/R/P/Deleted.md"])),
    ).not.toThrow();
    expect(drawnLit(state, parentOf, new Set(["Other/graph/Ghost.md"]))).toEqual(new Set([R, Y]));
  });
});

// ---------------------------------------------------------------------------
// Real-data composition: buildMindmapData -> Links, and a fold under prune:
// true (the default) feeding drawnLit.
//
//   HL (hub)
//   ├─ A (branch)
//   │   └─ A1
//   └─ B  -- wikilinks A1, a non-parent edge -> a cross-link
// ---------------------------------------------------------------------------
describe("composed with buildMindmapData", () => {
  const HUB_P = "HL/HL.md";
  const A_P = "HL/A/A.md";
  const A1_P = "HL/A/A1.md";
  const B_P = "HL/B.md";

  function graph(): GraphModel {
    return new GraphModel(
      "Vault",
      new Map([
        [HUB_P, "# HL\n\nHub.\n"],
        [A_P, "Branch A.\n"],
        [A1_P, "Child of A.\n"],
        [B_P, "Sees [[A1]].\n"],
      ]),
    );
  }

  it("neighboursOf agrees with the builder's own parentOf and crossLinks", () => {
    const data = buildMindmapData(graph(), "HL", new Set());
    const built: Links = { parentOf: data.parentOf, crossLinks: data.crossLinks };

    expect(data.crossLinks).toContainEqual({ from: B_P, to: A1_P });
    expect(neighboursOf(built, A1_P)).toEqual(expectedNeighbours(built, A1_P));
    expect(neighboursOf(built, A1_P).has(A_P)).toBe(true); // parent
    expect(neighboursOf(built, A1_P).has(B_P)).toBe(true); // cross-link partner
  });

  it("toggle + drawnLit compose correctly across a folded branch under prune: true", () => {
    const collapsed = new Set([A_P]);
    const data = buildMindmapData(graph(), "HL", collapsed, { prune: true });
    const built: Links = { parentOf: data.parentOf, crossLinks: data.crossLinks };

    // The pruned tree really did drop A's children from the drawn tree...
    const branchA = data.root!.children.find((c) => c.path === A_P)!;
    expect(branchA.children).toEqual([]);
    // ...but the full hierarchy still knows A1 is under A, which is what
    // neighboursOf and drawnLit rely on.
    expect(data.parentOf.get(A1_P)).toBe(A_P);

    const state = toggle(null, built, A1_P)!;
    expect(state.lit).toEqual(new Set([A1_P, ...neighboursOf(built, A1_P)]));
    expect(state.lit.has(A_P)).toBe(true);
    expect(state.lit.has(B_P)).toBe(true);

    const result = drawnLit(state, data.parentOf, collapsed);
    // A1 is hidden behind A's fold, so it is drawn as A; A itself is lit and
    // not hidden by anything above it; B is lit and never folded.
    expect(result).toEqual(new Set([A_P, B_P]));
    expect(result.has(A1_P)).toBe(false);
  });
});
