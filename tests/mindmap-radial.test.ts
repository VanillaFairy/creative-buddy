import { describe, it, expect } from "vitest";
import { radialLayout, radialLinkPath, crossLinkPath, reachFor, CAPTION_GAP } from "../src/mindmap/radial";
import type { Reach, ReachOf, RadialLayout, RadialLink, RadialNode } from "../src/mindmap/radial";
import type { MindmapNode } from "../src/mindmap/layout";
import { radialCaption, DOT_RADIUS, HUB_DOT_RADIUS } from "../src/mindmap/geometry";
import type { Measure } from "../src/mindmap/geometry";

/**
 * The radial map's promises, tested from the outside.
 *
 * Nothing here pins a ring gap, a padding or a control point's pull — those are
 * the module's own business. Every expectation is either computed from the
 * layout's own output plus the `Reach` values this file handed in, or compared
 * between two layouts. A literal in here would be a decision this test had no
 * right to make.
 */

/** Float dust: coordinates that touch exactly are not a collision. */
const EPS = 1e-6;
const TAU = Math.PI * 2;

const note = (stem: string, children: MindmapNode[] = []): MindmapNode => ({
  path: `${stem}.md`,
  stem,
  kind: null,
  status: null,
  problemKinds: [],
  children,
  collapsedChildren: 0,
  openQuestions: 0,
  hiddenOpenQuestions: 0,
});

const brood = (count: number, prefix = "n"): MindmapNode[] =>
  Array.from({ length: count }, (_, i) => note(`${prefix}${i}`));

/** A tree `breadth` wide and `depth` deep, every stem distinct. */
const nested = (breadth: number, depth: number, prefix = "t"): MindmapNode[] =>
  depth === 0
    ? []
    : Array.from({ length: breadth }, (_, i) =>
        note(`${prefix}-${depth}-${i}`, nested(breadth, depth - 1, `${prefix}${i}`)),
      );

/** Every node the same size, so crowding is the only variable under test. */
const evenReach =
  (caption: number, dot = 6): ReachOf =>
  () => ({ dot, caption });

/**
 * Different-sized nodes, keyed by the note they belong to. It throws for a note
 * that is not in the tree, so a layout that measures something it invented is
 * caught here rather than drawn.
 */
const variedReach = (root: MindmapNode, captions: number[]): ReachOf => {
  const byPath = new Map<string, Reach>();
  let seen = 0;
  const walk = (node: MindmapNode): void => {
    byPath.set(node.path, { dot: 4 + (seen % 3), caption: captions[seen % captions.length]! });
    seen++;
    for (const child of node.children) walk(child);
  };
  walk(root);
  return (node: MindmapNode) => {
    const reach = byPath.get(node.path);
    if (reach === undefined) {
      throw new Error(`radialLayout measured a note that is not in the tree: ${node.path}`);
    }
    return reach;
  };
};

/** A ring, in the order it is read around the circle. */
const ringAt = (layout: RadialLayout, depth: number): RadialNode[] =>
  layout.nodes.filter((n: RadialNode) => n.depth === depth).sort((a: RadialNode, b: RadialNode) => a.angle - b.angle);

/**
 * How much room each neighbouring pair of a generation was given, in pixels of
 * the circle their bearings were reserved on.
 *
 * Not where they ended up. A generation reserves its share of a circle and is
 * then drawn into a band nearer the hub, where the notes that no longer fit
 * side by side step outward into a lane of their own. Measured on the band,
 * two neighbours can be closer than either reserved and still not touch, so
 * the band says nothing about whether the reservation was honoured — and
 * honouring it is the whole of the mean-separation correction these tests are
 * here to hold onto.
 */
const arcSteps = (ring: RadialNode[], on: number): number[] => {
  const steps: number[] = [];
  for (let i = 1; i < ring.length; i++) {
    steps.push((ring[i]!.angle - ring[i - 1]!.angle) * on);
  }
  return steps;
};

/** The circle a generation's bearings were reserved on. */
const ringOf = (layout: RadialLayout, depth: number): number => {
  const on = layout.rings.get(depth);
  expect(on, `the layout reports no reserved circle for depth ${depth}`).toBeDefined();
  return on!;
};

/** The test's own model of a caption's height. */
const CAPTION_HALF_HEIGHT = 7;

/**
 * The least room a node takes along its own ring.
 *
 * A caption is horizontal and a ring is not, so how much of one lies *across*
 * its ring depends on where on the circle it stands: one at the top lies flat
 * across the ring and takes its whole width out of it, one at three o'clock
 * points straight down its own radius and takes none of it. It is still a line
 * of text either way, so it never takes less than its own height.
 *
 * The real reservation may be more generous — padding is the module's
 * business — so every check here is a floor, never an equality.
 */
const leastBreadth = (reach: Reach, angle: number): number =>
  Math.max(reach.dot, CAPTION_HALF_HEIGHT) +
  Math.abs(Math.cos(angle)) * (reach.caption > 0 ? CAPTION_GAP + reach.caption : 0);

/**
 * What each neighbouring pair on a ring must have between them, lined up
 * index-for-index with `arcSteps`. A caption hangs off one side of its dot, so
 * either of a pair may be the one reaching toward the other: the wider claim
 * wins.
 */
const leastSteps = (ring: RadialNode[], reachOf: ReachOf): number[] =>
  ring.slice(1).map((node: RadialNode, i: number) =>
    Math.max(
      leastBreadth(reachOf(ring[i]!.data), ring[i]!.angle),
      leastBreadth(reachOf(node.data), node.angle),
    ),
  );

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The rectangle a caption occupies on screen, worked out from the layout's
 * output and the reach this test handed in — never from the module's internals.
 */
const captionRect = (node: RadialNode, reach: Reach): Rect => {
  const near =
    node.labelAnchor === "start"
      ? node.x + reach.dot + CAPTION_GAP
      : node.x - reach.dot - CAPTION_GAP - reach.caption;
  return {
    left: near,
    right: near + reach.caption,
    top: node.y - CAPTION_HALF_HEIGHT,
    bottom: node.y + CAPTION_HALF_HEIGHT,
  };
};

/** The rectangle a dot occupies, from the same two sources. */
const dotRect = (node: RadialNode, reach: Reach): Rect => ({
  left: node.x - reach.dot,
  right: node.x + reach.dot,
  top: node.y - reach.dot,
  bottom: node.y + reach.dot,
});

const overlaps = (a: Rect, b: Rect): boolean =>
  a.left + EPS < b.right && b.left + EPS < a.right && a.top + EPS < b.bottom && b.top + EPS < a.bottom;

const where = (node: RadialNode, rect: Rect): string =>
  `${node.path} @${node.angle.toFixed(4)}rad r${node.radius.toFixed(2)} ` +
  `[${rect.left.toFixed(2)}..${rect.right.toFixed(2)}]x[${rect.top.toFixed(2)}..${rect.bottom.toFixed(2)}]`;

/**
 * The load-bearing invariant, checked pair by pair over one ring. Two things
 * are drawn per note and both of them are in the way: a reservation that counts
 * a caption's width but forgets the dot it hangs off keeps every pair of
 * captions apart and still parks a dot several pixels inside its neighbour's
 * text, which is why the second pass is here.
 */
const expectNoCollisions = (ring: RadialNode[], reachOf: ReachOf): void => {
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const a = ring[i]!;
      const b = ring[j]!;
      const rectA = captionRect(a, reachOf(a.data));
      const rectB = captionRect(b, reachOf(b.data));
      expect(overlaps(rectA, rectB), `captions collide: ${where(a, rectA)} vs ${where(b, rectB)}`).toBe(false);
    }
  }
  for (const a of ring) {
    const reachA = reachOf(a.data);
    if (reachA.caption <= 0) continue;
    const caption = captionRect(a, reachA);
    for (const b of ring) {
      if (b === a) continue;
      const dot = dotRect(b, reachOf(b.data));
      expect(
        overlaps(caption, dot),
        `a caption is written over a dot: ${where(a, caption)} vs ${where(b, dot)}`,
      ).toBe(false);
    }
  }
};

const finiteNumbers = (layout: RadialLayout): number[] =>
  layout.nodes
    .flatMap((n: RadialNode) => [n.angle, n.radius, n.x, n.y])
    .concat([layout.bounds.minX, layout.bounds.minY, layout.bounds.maxX, layout.bounds.maxY]);

// ---------------------------------------------------------------------------

describe("the collision helper this file tests with", () => {
  // A no-overlap suite that cannot detect an overlap proves nothing, so the
  // detector is itself checked before it is trusted.
  const rect = (left: number, top: number): Rect => ({ left, right: left + 50, top, bottom: top + 14 });

  it("sees two rectangles sitting on top of each other", () => {
    expect(overlaps(rect(0, 0), rect(10, 3))).toBe(true);
  });

  it("lets two rectangles that merely touch pass", () => {
    expect(overlaps(rect(0, 0), rect(50, 0))).toBe(false);
  });

  it("lets two rectangles on different lines pass", () => {
    expect(overlaps(rect(0, 0), rect(10, 20))).toBe(false);
  });
});

describe("CAPTION_GAP", () => {
  it("is a real, positive amount of air between a dot and its caption", () => {
    expect(Number.isFinite(CAPTION_GAP)).toBe(true);
    expect(CAPTION_GAP).toBeGreaterThan(0);
  });
});

describe("radialLayout: the shape of the circle", () => {
  it("puts the hub at the centre, because everything else hangs off it", () => {
    const { nodes } = radialLayout(note("Hub", brood(4)), evenReach(60));
    const hub = nodes.find((n: RadialNode) => n.depth === 0)!;
    // Close-to rather than exactly: a zero radius times a cosine lands on -0,
    // which `toBe` counts as a different number from 0 and a reader does not.
    expect(hub.x).toBeCloseTo(0, 9);
    expect(hub.y).toBeCloseTo(0, 9);
    expect(hub.radius).toBe(0);
    expect(nodes.filter((n: RadialNode) => n.depth === 0)).toHaveLength(1);
  });

  it("seats a whole generation on one ring", () => {
    const layout = radialLayout(note("Hub", nested(4, 2)), evenReach(60));
    for (const depth of [1, 2]) {
      const radii = ringAt(layout, depth).map((n: RadialNode) => n.radius);
      expect(radii.length).toBeGreaterThan(1);
      expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(EPS);
    }
  });

  it("puts each generation further out than the one before it", () => {
    const deep = note("Hub", [note("a", [note("b", [note("c")])])]);
    const { nodes } = radialLayout(deep, evenReach(60));
    const radii = [0, 1, 2, 3].map((d) => nodes.find((n: RadialNode) => n.depth === d)!.radius);
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]!).toBeGreaterThan(radii[i - 1]!);
    }
  });

  it("keeps a lone grandchild outside a first ring that crowding has pushed way out", () => {
    // The generation-by-generation check above walks a single thread, where
    // nothing is crowded and no ring can overtake another. Here the first ring
    // is packed and has to grow a long way outward, while the second holds one
    // note and would be happy anywhere. A layout that sizes each ring on its own
    // crowding alone draws the grandchild inside its own parent's ring.
    const reachOf = evenReach(120);
    const root = note("Hub", [note("parent", [note("child")]), ...brood(60, "k")]);
    const layout = radialLayout(root, reachOf);
    const first = ringAt(layout, 1);
    const second = ringAt(layout, 2);
    expect(first).toHaveLength(61);
    expect(second).toHaveLength(1);
    expect(second[0]!.radius).toBeGreaterThan(first[0]!.radius);
  });

  it("plants every node on its ring at its angle, zero pointing up and growing clockwise", () => {
    // The one convention the shell cannot guess: `angle` and `radius` have to
    // agree with `x`/`y`, or a caption is drawn nowhere near its dot.
    const { nodes } = radialLayout(note("Hub", nested(5, 2)), evenReach(50));
    for (const node of nodes) {
      expect(Math.hypot(node.x, node.y)).toBeCloseTo(node.radius, 6);
      expect(node.x).toBeCloseTo(node.radius * Math.sin(node.angle), 6);
      expect(node.y).toBeCloseTo(-node.radius * Math.cos(node.angle), 6);
    }
    // Not vacuous: something has to be off the vertical for the check to bite.
    expect(nodes.some((n: RadialNode) => Math.abs(n.x) > 1)).toBe(true);
  });

  it("reads a ring around the circle in the order the notes stand in the tree", () => {
    // A map mirrored left to right keeps `angle`, `x` and `y` agreeing with one
    // another exactly as the check above wants them to, and hands the reader a
    // note list that runs backwards against the folder it came from.
    const children = brood(6);
    const layout = radialLayout(note("Hub", children), evenReach(70));
    const ring = ringAt(layout, 1);
    expect(ring).toHaveLength(children.length);
    expect(ring.map((n: RadialNode) => n.data.stem)).toEqual(children.map((c: MindmapNode) => c.stem));
  });
});

describe("radialLayout: no two captions on a ring may collide", () => {
  it("holds for a ring packed with forty same-sized siblings", () => {
    const reachOf = evenReach(90);
    const layout = radialLayout(note("Hub", brood(40)), reachOf);
    const ring = ringAt(layout, 1);
    expect(ring).toHaveLength(40);
    expectNoCollisions(ring, reachOf);
  });

  it("holds on a second ring fed by many different parents", () => {
    const reachOf = evenReach(80);
    const layout = radialLayout(note("Hub", nested(6, 2)), reachOf);
    expect(ringAt(layout, 1)).toHaveLength(6);
    expect(ringAt(layout, 2)).toHaveLength(36);
    expectNoCollisions(ringAt(layout, 1), reachOf);
    expectNoCollisions(ringAt(layout, 2), reachOf);
  });

  it("draws a ring of wildly different widths without two captions meeting", () => {
    // A layout that reserves one width for everything passes the even case and
    // fails here — the wide captions land on top of their narrow neighbours.
    //
    // What it is not is the guard for splitting the difference between two
    // unequal neighbours. Whether two rectangles meet depends on how far out
    // the ring sits, and at the radius this implementation picks the vertical
    // drop between neighbours pulls the text apart on its own even with the
    // spacing correction taken out. "Keeps a long name's whole width beside a
    // short one on one crowded ring" further down is that guard, and it weighs
    // arc against reach so it holds at whatever radius a layout chooses.
    const root = note("Hub", nested(5, 2));
    const reachOf = variedReach(root, [12, 190, 44, 150, 8, 96]);
    const layout = radialLayout(root, reachOf);
    expectNoCollisions(ringAt(layout, 1), reachOf);
    expectNoCollisions(ringAt(layout, 2), reachOf);
  });

  it("holds for a lopsided tree where one branch carries almost everything", () => {
    const reachOf = evenReach(110);
    const root = note("Hub", [note("crowded", brood(30, "c")), note("lonely", [note("only")]), note("bare")]);
    const layout = radialLayout(root, reachOf);
    expect(ringAt(layout, 2)).toHaveLength(31);
    expectNoCollisions(ringAt(layout, 1), reachOf);
    expectNoCollisions(ringAt(layout, 2), reachOf);
  });

  it("holds for a crowded ring whose captions alternate long and short", () => {
    // A drawn-rectangle sanity check over the hardest ring there is to pack:
    // alternating 200px and 4px names, the case where a layout that splits the
    // difference between two neighbours writes the long names over the short.
    //
    // It is not the guard for that, and must not be taken for one. Whether two
    // rectangles meet depends on how far out the ring sits, and at the radius
    // this implementation happens to choose the vertical drop between
    // neighbours clears a caption's height on every pair here even with the
    // spacing correction pulled out. The guard is "keeps a long name's whole
    // width between it and the note beside it" further down, which weighs arc
    // against reach and so holds at whatever radius a layout picks.
    const children = brood(72, "k");
    const long = new Set(children.filter((_, i) => i % 2 === 0).map((child) => child.path));
    const reachOf: ReachOf = (node: MindmapNode) => ({ dot: 6, caption: long.has(node.path) ? 200 : 4 });
    const layout = radialLayout(note("Hub", children), reachOf);
    const ring = ringAt(layout, 1);
    expect(ring).toHaveLength(72);
    expectNoCollisions(ring, reachOf);
  });

  it("holds through three generations of a graph that fills every ring it has", () => {
    // Every ring here is packed, so a reservation that is short by a dot or by
    // its breathing room shows up as a caption written across a neighbouring
    // dot on whichever ring the shortfall bites first.
    const reachOf = evenReach(168);
    const layout = radialLayout(note("Hub", nested(5, 3)), reachOf);
    for (const depth of [1, 2, 3]) {
      const ring = ringAt(layout, depth);
      expect(ring).toHaveLength(5 ** depth);
      expectNoCollisions(ring, reachOf);
    }
  });

  it("holds for a ring far too big for one turn at any sane radius", () => {
    const reachOf = evenReach(160);
    const layout = radialLayout(note("Hub", brood(120)), reachOf);
    const ring = ringAt(layout, 1);
    expect(ring).toHaveLength(120);
    expectNoCollisions(ring, reachOf);
  });
});

describe("radialLayout: the circle closes and never wraps", () => {
  it("keeps the whole layout inside one turn, however much it is given", () => {
    for (const layout of [
      radialLayout(note("Hub", brood(60)), evenReach(120)),
      radialLayout(note("Hub", nested(8, 2)), evenReach(140)),
      radialLayout(note("Hub", brood(400)), evenReach(80)),
    ]) {
      const angles = layout.nodes.map((n: RadialNode) => n.angle);
      expect(Math.max(...angles) - Math.min(...angles)).toBeLessThanOrEqual(TAU + EPS);
    }
  });

  it("gives every node on a crowded ring its own place on that ring", () => {
    const layout = radialLayout(note("Hub", brood(60)), evenReach(120));
    const ring = ringAt(layout, 1);
    const places = new Set(ring.map((n: RadialNode) => `${n.x.toFixed(4)},${n.y.toFixed(4)}`));
    expect(places.size).toBe(ring.length);
  });

  it("makes the ring long enough to carry everything standing on it", () => {
    // The circumference has to hold what the ring was given: an implementation
    // that folds the overflow back over the near side fails this arithmetic.
    const reach: Reach = { dot: 6, caption: 120 };
    const layout = radialLayout(note("Hub", brood(60)), () => reach);
    const ring = ringAt(layout, 1);
    const carried = leastSteps(ring, () => reach).reduce((a: number, b: number) => a + b, 0);
    expect(TAU * ringOf(layout, 1)).toBeGreaterThanOrEqual(carried - EPS);
  });
});

describe("radialLayout: crowding grows the circle instead of squeezing the notes", () => {
  it("gives every neighbouring pair at least the breadth it reserved, roomy or packed", () => {
    const reach: Reach = { dot: 6, caption: 90 };
    for (const count of [4, 12, 60]) {
      const layout = radialLayout(note("Hub", brood(count)), () => reach);
      const ring = ringAt(layout, 1);
      const least = leastSteps(ring, () => reach);
      arcSteps(ring, ringOf(layout, 1)).forEach((step: number, i: number) => {
        expect(step).toBeGreaterThanOrEqual(least[i]! - EPS);
      });
    }
  });

  it("gives the same room on an inner and an outer ring of a deep graph", () => {
    const reach: Reach = { dot: 5, caption: 100 };
    const layout = radialLayout(note("Hub", nested(7, 2)), () => reach);
    for (const depth of [1, 2]) {
      const ring = ringAt(layout, depth);
      const least = leastSteps(ring, () => reach);
      arcSteps(ring, ringOf(layout, depth)).forEach((step: number, i: number) => {
        expect(step).toBeGreaterThanOrEqual(least[i]! - EPS);
      });
    }
  });

  it("keeps a long name's whole width beside a short one on one crowded ring", () => {
    // Nine leaves off the hub and nothing else — no second ring, no cousins, no
    // parent structure for a shortfall to hide behind. `d3-flextree` separates
    // two neighbours by the MEAN of what they reserved, which is right for a box
    // centred on its own space and wrong for a caption hanging off one side of
    // its dot. Take the correction out and this ring hands a 200px name about
    // eighty pixels less than it needs beside its 8px neighbour.
    const root = note("Hub", brood(9, "k"));
    const reachOf = variedReach(root, [200, 190, 8, 6]);
    const layout = radialLayout(root, reachOf);
    const ring = ringAt(layout, 1);
    expect(ring).toHaveLength(9);

    let lopsidedPairs = 0;
    arcSteps(ring, ringOf(layout, 1)).forEach((step: number, i: number) => {
      const before = ring[i]!;
      const after = ring[i + 1]!;
      const wantsBefore = leastBreadth(reachOf(before.data), before.angle);
      const wantsAfter = leastBreadth(reachOf(after.data), after.angle);
      const needed = Math.max(wantsBefore, wantsAfter);
      if (Math.abs(wantsBefore - wantsAfter) > 100) lopsidedPairs++;
      expect(
        step,
        `${before.path} (${wantsBefore.toFixed(0)}px) and ${after.path} (${wantsAfter.toFixed(0)}px) ` +
          `were given ${step.toFixed(2)}px of the ring between them, ` +
          `and the wider of the two needs ${needed.toFixed(0)}px of it to itself`,
      ).toBeGreaterThanOrEqual(needed - EPS);
    });
    // Not vacuous: a ring of equals would prove nothing about splitting a
    // difference, so a wide name has to actually stand next to a narrow one.
    expect(lopsidedPairs).toBeGreaterThan(0);
  });

  it("keeps a long name's whole width between it and the note beside it, whoever its parent is", () => {
    // The claim the rectangle checks above only imply. Neighbours on a ring are
    // held apart by an angle, and `d3-flextree` derives that angle from the MEAN
    // of the pair's reserved breadths — right for a box centred on its own
    // space, wrong for a caption that hangs off one side of its dot and needs
    // the whole of its width toward whatever stands next to it. Take the
    // correction out and a 200px name gets about 110px of clearance from its
    // 6px neighbour.
    //
    // Put as arc against reach, this bites whatever radius the layout chooses.
    // A rectangle check does not: it stops detecting anything the moment an
    // implementation spreads the ring wide enough that the vertical drop
    // between neighbours pulls the two lines of text apart on its own.
    const root = note("Hub", Array.from({ length: 8 }, (_, i) => note(`p${i}`, brood(6, `p${i}-`))));
    const reachOf = variedReach(root, [200, 190, 8, 6]);
    const layout = radialLayout(root, reachOf);
    const parentOf = new Map(layout.links.map((l: RadialLink) => [l.target.path, l.source.path]));

    expect(ringAt(layout, 1)).toHaveLength(8);
    expect(ringAt(layout, 2)).toHaveLength(48);

    let lopsidedPairs = 0;
    let crossParentPairs = 0;
    for (const depth of [1, 2]) {
      const ring = ringAt(layout, depth);
      arcSteps(ring, ringOf(layout, depth)).forEach((step: number, i: number) => {
        const before = ring[i]!;
        const after = ring[i + 1]!;
        const wantsBefore = leastBreadth(reachOf(before.data), before.angle);
        const wantsAfter = leastBreadth(reachOf(after.data), after.angle);
        const needed = Math.max(wantsBefore, wantsAfter);
        if (Math.abs(wantsBefore - wantsAfter) > 100) lopsidedPairs++;
        if (parentOf.get(before.path) !== parentOf.get(after.path)) crossParentPairs++;
        expect(
          step,
          `${before.path} (${wantsBefore.toFixed(0)}px) and ${after.path} (${wantsAfter.toFixed(0)}px) ` +
            `were given ${step.toFixed(2)}px of ring ${depth} between them, ` +
            `and the wider of the two needs ${needed.toFixed(0)}px of it to itself`,
        ).toBeGreaterThanOrEqual(needed - EPS);
      });
    }
    // Not vacuous. The ring has to actually seat a wide name beside a narrow
    // one, and has to seat children of different parents next to each other —
    // a correction that only pushed siblings apart would sail past a ring cut
    // from a single brood.
    expect(lopsidedPairs).toBeGreaterThan(0);
    expect(crossParentPairs).toBeGreaterThan(0);
  });

  it("pushes the first ring further out when sixty notes stand on it than when four do", () => {
    const reachOf = evenReach(90);
    const roomy = radialLayout(note("Hub", brood(4)), reachOf);
    const packed = radialLayout(note("Hub", brood(60)), reachOf);
    expect(ringAt(packed, 1)[0]!.radius).toBeGreaterThan(ringAt(roomy, 1)[0]!.radius);
  });

  it("does not grow a full ring by the whole width of every caption on it", () => {
    // A caption is horizontal and a ring is not. Reserving every caption's full
    // width across every ring — the worst case, which only a note at the top or
    // the bottom of the circle actually meets — is what left the hub sitting
    // alone in an empty disc. Once a ring goes right round, its notes point
    // every which way, and the ones out at three and nine o'clock lie along
    // their own radius and cost the ring nothing across it.
    const count = 60;
    const width = 150;
    const ringRadius = (caption: number): number => {
      const ring = ringAt(radialLayout(note("Hub", brood(count)), evenReach(caption)), 1);
      expect(ring).toHaveLength(count);
      // Only a full turn puts captions at every bearing; a fan is all one way.
      expect(ring[ring.length - 1]!.angle - ring[0]!.angle).toBeGreaterThan(Math.PI);
      return ring[0]!.radius;
    };
    const grown = ringRadius(width) - ringRadius(0);
    // Wide names still cost the ring room — this is not a licence to ignore them.
    expect(grown).toBeGreaterThan(0);
    expect(grown).toBeLessThan((count * width) / TAU);
  });

  it("keeps every caption on a ring that has been pulled in off every other one", () => {
    // The room the test above says the layout may reclaim, spent: the same
    // rings, checked as drawn rectangles. Nothing else here would notice a
    // reclamation that went one step too far.
    for (const width of [60, 150, 240]) {
      const reachOf = evenReach(width);
      const layout = radialLayout(note("Hub", brood(60)), reachOf);
      expectNoCollisions(ringAt(layout, 1), reachOf);
    }
  });

  it("spends less of the circle on narrow notes than on wide ones", () => {
    // Reserving the widest node's breadth for every node would pass every
    // collision check above and waste half the map; this is what says no.
    const root = note("Hub", brood(9));
    const wide = radialLayout(root, evenReach(150));
    const mostlyNarrow = radialLayout(root, variedReach(root, [150, 20, 20, 20, 20, 20, 20, 20, 20, 20]));
    const drawnArc = (layout: RadialLayout): number => {
      const ring = ringAt(layout, 1);
      return (ring[ring.length - 1]!.angle - ring[0]!.angle) * ring[0]!.radius;
    };
    expect(drawnArc(mostlyNarrow)).toBeLessThan(drawnArc(wide));
  });
});

describe("radialLayout: a small graph stays a fan", () => {
  it("does not hand three notes more room than sixty notes get", () => {
    // Spreading three notes 120 degrees apart reads as a bug. Arc is the honest
    // measure: crowding shrinks angles and grows radii together, so the room a
    // note gets should not depend on how empty the graph is.
    //
    // What it does depend on is where a note stands, and three notes stand
    // nowhere near where sixty do — so two rings' raw steps are not comparable.
    // Their *slack* is: the room a pair was handed over and above what the two
    // of them reserved is the module's own padding, and padding does not care
    // how busy a ring is.
    const reachOf = evenReach(70);
    const slack = (count: number): number => {
      const layout = radialLayout(note("Hub", brood(count)), reachOf);
      const ring = ringAt(layout, 1);
      const least = leastSteps(ring, reachOf);
      return Math.max(
        ...arcSteps(ring, ringOf(layout, 1)).map((step: number, i: number) => step - least[i]!),
      );
    };
    expect(slack(3)).toBeLessThanOrEqual(slack(60) + EPS);
  });

  it("leaves three notes on the ring one note sits on, at the angle seven notes get", () => {
    // The claim above is arc, and arc cannot see this: the shrink multiplies
    // every angle and divides every radius by the same factor, so it leaves
    // arc untouched. Read apart, the two halves are plain. A ring only ever
    // moves outward under crowding, so three notes sit exactly where one does;
    // and until a ring is full a note is given the slice it asked for rather
    // than a share of the circle, so three notes are spread no wider than seven.
    //
    // Seven and not six. A fan is centred, so an odd one seats a note at twelve
    // o'clock, where a caption lies flat across its ring and costs the most of
    // it, and an even one straddles that spot and never pays full price. The
    // widest step in a fan is the one beside its middle note, so the two fans
    // have to be odd together or they are not being asked the same question.
    const reachOf = evenReach(70);
    const ringOf = (count: number): RadialNode[] => ringAt(radialLayout(note("Hub", brood(count)), reachOf), 1);
    const lone = ringOf(1);
    const fan = ringOf(3);
    const more = ringOf(7);
    expect(lone).toHaveLength(1);
    expect(fan).toHaveLength(3);
    expect(more).toHaveLength(7);
    expect(fan[0]!.radius).toBeCloseTo(lone[0]!.radius, 6);
    const widestStep = (ring: RadialNode[]): number =>
      Math.max(...ring.slice(1).map((n: RadialNode, i: number) => n.angle - ring[i]!.angle));
    expect(widestStep(fan)).toBeCloseTo(widestStep(more), 6);
  });

  it("opens the fan wider for wide notes than for small ones, rather than filling the circle either way", () => {
    // A layout that spreads whatever it is given evenly around the circle gives
    // both of these the same span; one that reserves real breadth does not.
    //
    // Comparing spans only means something while both fans stand on the same
    // ring, so that is asserted first — otherwise a layout that shrinks a
    // roomy graph into the whole circle passes this on whichever side of a
    // rounding error its two spans happen to land.
    const fan = (reachOf: ReachOf): { radius: number; span: number } => {
      const layout = radialLayout(note("Hub", brood(3)), reachOf);
      const ring = ringAt(layout, 1);
      expect(ring).toHaveLength(3);
      // The circle the bearings were reserved on, not the band they were drawn
      // into: a band comes in by however much its own captions allow, which is
      // a fact about distance and has nothing to say about how wide the fan is.
      return { radius: ringOf(layout, 1), span: ring[2]!.angle - ring[0]!.angle };
    };
    const small = fan(evenReach(10, 2));
    const wide = fan(evenReach(200, 6));
    expect(small.radius).toBeCloseTo(wide.radius, 6);
    expect(small.span).toBeLessThan(wide.span);
  });
});

describe("radialLayout: captions hang outward", () => {
  it("ends a caption at its dot on the left of the circle and starts it there on the right", () => {
    const layout = radialLayout(note("Hub", nested(6, 2)), evenReach(60));
    const placed = layout.nodes.filter((n: RadialNode) => n.depth > 0);
    expect(placed.filter((n: RadialNode) => n.x < 0).every((n: RadialNode) => n.labelAnchor === "end")).toBe(true);
    expect(placed.filter((n: RadialNode) => n.x > 0).every((n: RadialNode) => n.labelAnchor === "start")).toBe(true);
    // Not vacuous: both sides of the circle have to be occupied for it to bite.
    expect(placed.some((n: RadialNode) => n.x < 0)).toBe(true);
    expect(placed.some((n: RadialNode) => n.x > 0)).toBe(true);
  });
});

describe("radialLayout: what it reports back", () => {
  it("reports one link per parent edge, always pointing one ring outward", () => {
    const root = note("Hub", [note("a", [note("b", [note("c")]), note("d")]), note("e")]);
    const { nodes, links } = radialLayout(root, evenReach(60));
    const edges: string[] = [];
    const walk = (n: MindmapNode): void => {
      for (const child of n.children) {
        edges.push(`${n.path} -> ${child.path}`);
        walk(child);
      }
    };
    walk(root);
    expect(links.map((l: RadialLink) => `${l.source.path} -> ${l.target.path}`).sort()).toEqual(edges.sort());
    expect(links).toHaveLength(nodes.length - 1);
    expect(links.every((l: RadialLink) => l.target.depth === l.source.depth + 1)).toBe(true);
  });

  it("links the very nodes it laid out, so the shell can draw one from the other", () => {
    const layout = radialLayout(note("Hub", nested(3, 2)), evenReach(60));
    for (const link of layout.links) {
      expect(layout.nodes).toContain(link.source);
      expect(layout.nodes).toContain(link.target);
    }
  });

  it("lays out every note in the tree exactly once, at the depth the tree gives it", () => {
    const root = note("Hub", nested(4, 3));
    const expected = new Map<string, number>();
    const walk = (n: MindmapNode, depth: number): void => {
      expected.set(n.path, depth);
      for (const child of n.children) walk(child, depth + 1);
    };
    walk(root, 0);
    const { nodes } = radialLayout(root, evenReach(50));
    expect(nodes).toHaveLength(expected.size);
    expect(new Set(nodes.map((n: RadialNode) => n.path)).size).toBe(nodes.length);
    for (const node of nodes) {
      expect(expected.get(node.path)).toBe(node.depth);
      expect(node.data.path).toBe(node.path);
    }
  });

  it("carries each note itself through, so the view can read its heat and its stem", () => {
    const child = note("a");
    const root = note("Hub", [child]);
    const { nodes } = radialLayout(root, evenReach(60));
    expect(nodes.find((n: RadialNode) => n.path === child.path)!.data).toBe(child);
    expect(nodes.find((n: RadialNode) => n.depth === 0)!.data).toBe(root);
  });

  it("returns the smallest box that holds every caption and every dot it laid out", () => {
    // The view hands `bounds` straight to a fit-to-viewport transform, so a box
    // that merely encloses the drawing is not enough: one a thousand times too
    // big encloses it too, and paints the whole map as a speck in the middle of
    // an empty pane. Each edge has to sit on a note.
    const root = note("Hub", nested(5, 2));
    const reachOf = variedReach(root, [30, 170, 60, 120]);
    const { nodes, bounds } = radialLayout(root, reachOf);
    expect(nodes.length).toBeGreaterThan(1);
    const drawn = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const node of nodes) {
      const reach = reachOf(node.data);
      const rect = captionRect(node, reach);
      drawn.minX = Math.min(drawn.minX, rect.left, node.x - reach.dot);
      drawn.maxX = Math.max(drawn.maxX, rect.right, node.x + reach.dot);
      drawn.minY = Math.min(drawn.minY, node.y - reach.dot);
      drawn.maxY = Math.max(drawn.maxY, node.y + reach.dot);
    }
    expect(bounds.minX).toBeCloseTo(drawn.minX, 6);
    expect(bounds.maxX).toBeCloseTo(drawn.maxX, 6);
    expect(bounds.minY).toBeCloseTo(drawn.minY, 6);
    expect(bounds.maxY).toBeCloseTo(drawn.maxY, 6);
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
    expect(bounds.maxY).toBeGreaterThan(bounds.minY);
  });

  it("lays the same graph out the same way twice", () => {
    const root = note("Hub", nested(4, 2));
    const once = radialLayout(root, evenReach(70)).nodes;
    const twice = radialLayout(root, evenReach(70)).nodes;
    expect(twice.map((n: RadialNode) => [n.path, n.angle, n.radius, n.x, n.y, n.labelAnchor])).toEqual(
      once.map((n: RadialNode) => [n.path, n.angle, n.radius, n.x, n.y, n.labelAnchor]),
    );
  });

  it("leaves the tree it was handed exactly as it found it", () => {
    const root = note("Hub", nested(3, 2));
    const before = JSON.stringify(root);
    radialLayout(root, evenReach(60));
    expect(JSON.stringify(root)).toBe(before);
  });
});

describe("radialLayout: the degenerate cases", () => {
  it("draws a lone hub without dividing by a radius it does not have", () => {
    const reachOf = evenReach(60);
    const layout = radialLayout(note("Hub"), reachOf);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.links).toHaveLength(0);
    for (const value of finiteNumbers(layout)) expect(Number.isFinite(value)).toBe(true);
    const hub = layout.nodes[0]!;
    const rect = captionRect(hub, reachOf(hub.data));
    expect(layout.bounds.minX).toBeLessThanOrEqual(rect.left + EPS);
    expect(layout.bounds.maxX).toBeGreaterThanOrEqual(rect.right - EPS);
  });

  it("draws a hub with a single child without a NaN anywhere", () => {
    const layout = radialLayout(note("Hub", [note("only")]), evenReach(60));
    for (const value of finiteNumbers(layout)) expect(Number.isFinite(value)).toBe(true);
  });

  it("copes with notes that draw no caption at all", () => {
    const root = note("Hub", brood(12));
    const reachOf: ReachOf = (node: MindmapNode) => ({ dot: 6, caption: node.stem.endsWith("0") ? 0 : 80 });
    const layout = radialLayout(root, reachOf);
    for (const value of finiteNumbers(layout)) expect(Number.isFinite(value)).toBe(true);
    expectNoCollisions(ringAt(layout, 1), reachOf);
  });
});

// ---------------------------------------------------------------------------

/** Pulls the numbers back out of a path, so a curve can be checked by its shape. */
const numbersIn = (path: string): number[] =>
  (path.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) ?? []).map(Number);

interface Point {
  x: number;
  y: number;
}

/**
 * The path's coordinates, read as pairs. The first is where the pen lands, the
 * last is where it stops, and what is in between shapes the curve — which
 * command it is written with is the module's business, not this file's.
 */
const pointsIn = (path: string): Point[] => {
  const numbers = numbersIn(path);
  expect(numbers.length % 2, `a path made of coordinate pairs, got ${path}`).toBe(0);
  const points: Point[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i]!, y: numbers[i + 1]! });
  return points;
};

/**
 * Where a curve actually runs, from its points alone — de Casteljau over as
 * many of them as there are, so this reads a quadratic and a cubic alike and
 * does not care which command the module wrote them with.
 */
const bezierAt = (points: Point[], t: number): Point => {
  let level = points;
  while (level.length > 1) {
    const next: Point[] = [];
    for (let i = 1; i < level.length; i++) {
      next.push({
        x: level[i - 1]!.x + (level[i]!.x - level[i - 1]!.x) * t,
        y: level[i - 1]!.y + (level[i]!.y - level[i - 1]!.y) * t,
      });
    }
    level = next;
  }
  return level[0]!;
};

/** Checks a path's two ends and hands back the shape between them. */
const expectRunsBetween = (path: string, from: RadialNode, to: RadialNode): Point[] => {
  const points = pointsIn(path);
  expect(points.length, `a curve needs a shape between its ends, got ${path}`).toBeGreaterThanOrEqual(3);
  // Two decimals, not six: a path is allowed to round its coordinates on the
  // way into the `d` string. The claim is that the curve starts and ends on
  // its two notes, and half a hundredth of a pixel is nobody's idea of a miss.
  expect(points[0]!.x).toBeCloseTo(from.x, 2);
  expect(points[0]!.y).toBeCloseTo(from.y, 2);
  expect(points[points.length - 1]!.x).toBeCloseTo(to.x, 2);
  expect(points[points.length - 1]!.y).toBeCloseTo(to.y, 2);
  return points.slice(1, -1);
};

describe("radialLinkPath", () => {
  const layout = radialLayout(note("Hub", [note("a", [note("b")])]), evenReach(60));
  const inner = layout.links.find((l: RadialLink) => l.source.depth === 0)!;
  const outer = layout.links.find((l: RadialLink) => l.source.depth === 1)!;

  it("leaves the parent and arrives at the child", () => {
    expectRunsBetween(radialLinkPath(outer.source, outer.target), outer.source, outer.target);
  });

  it("leaves the hub itself cleanly, radius zero and all", () => {
    const points = pointsIn(radialLinkPath(inner.source, inner.target));
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expectRunsBetween(radialLinkPath(inner.source, inner.target), inner.source, inner.target);
  });

  it("sets off from the parent straight outward and comes in on the child's own bearing", () => {
    // The check below weighs the curve's shape by how far from the hub it
    // passes, and every point of it keeps its distance whichever end's bearing
    // it was put on — so a curve whose two controls have been swapped, and which
    // therefore leaves the parent almost sideways and crosses itself on the way
    // back, sails past it. A branch setting off across the circle instead of out
    // from the hub is the very thing this curve exists not to look like.
    const layout = radialLayout(note("Hub", nested(5, 2)), evenReach(60));
    const spread = (link: RadialLink): number => Math.abs(link.source.angle - link.target.angle);
    const link = layout.links
      .filter((l: RadialLink) => l.source.depth > 0)
      .sort((a: RadialLink, b: RadialLink) => spread(b) - spread(a))[0]!;
    // Radial and chordal are the same direction for a child sitting straight
    // out from its parent, so the pair has to be well off each other's bearing.
    expect(spread(link)).toBeGreaterThan(0.15);

    const path = radialLinkPath(link.source, link.target);
    const shape = expectRunsBetween(path, link.source, link.target);
    const points = pointsIn(path);
    const leaving = {
      x: shape[0]!.x - points[0]!.x,
      y: shape[0]!.y - points[0]!.y,
    };
    const arriving = {
      x: points[points.length - 1]!.x - shape[shape.length - 1]!.x,
      y: points[points.length - 1]!.y - shape[shape.length - 1]!.y,
    };
    /** The sine of the angle between a step of the curve and a note's own radius. */
    const offRadial = (step: Point, node: RadialNode): number =>
      Math.abs(step.x * node.y - step.y * node.x) / (Math.hypot(step.x, step.y) * node.radius);
    expect(Math.hypot(leaving.x, leaving.y)).toBeGreaterThan(1);
    expect(Math.hypot(arriving.x, arriving.y)).toBeGreaterThan(1);
    expect(offRadial(leaving, link.source)).toBeCloseTo(0, 6);
    expect(offRadial(arriving, link.target)).toBeCloseTo(0, 6);
  });

  it("bends through the space between the two rings, not through the hub and not past the child", () => {
    for (const link of [inner, outer]) {
      const shape = expectRunsBetween(radialLinkPath(link.source, link.target), link.source, link.target);
      const near = Math.min(link.source.radius, link.target.radius);
      const far = Math.max(link.source.radius, link.target.radius);
      for (const point of shape) {
        const radius = Math.hypot(point.x, point.y);
        expect(radius).toBeGreaterThanOrEqual(near - EPS);
        expect(radius).toBeLessThanOrEqual(far + EPS);
      }
      expect(
        shape.some((p) => {
          const radius = Math.hypot(p.x, p.y);
          return radius > near + EPS && radius < far - EPS;
        }),
        "a branch that bends reaches into the space between the rings",
      ).toBe(true);
    }
  });
});

describe("crossLinkPath", () => {
  const reachOf = evenReach(60);
  const fan = radialLayout(note("Hub", brood(8)), reachOf);
  const deep = radialLayout(note("Hub", nested(4, 2)), reachOf);

  /** How far the straight line between two nodes passes from the hub. */
  const straightDistance = (from: RadialNode, to: RadialNode): number =>
    Math.hypot((from.x + to.x) / 2, (from.y + to.y) / 2);

  const expectBowsInward = (from: RadialNode, to: RadialNode): void => {
    const shape = expectRunsBetween(crossLinkPath(from, to), from, to);
    const straight = straightDistance(from, to);
    for (const point of shape) {
      expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(straight + EPS);
    }
    expect(
      shape.some((p) => Math.hypot(p.x, p.y) < straight - EPS),
      "a chord along the ring would be mistaken for the ring, so it has to bow",
    ).toBe(true);
  };

  it("bows toward the hub between two notes on the same ring", () => {
    const ring = ringAt(fan, 1);
    expectBowsInward(ring[0]!, ring[3]!);
  });

  it("bows toward the hub between two notes on different rings", () => {
    expectBowsInward(ringAt(deep, 1)[0]!, ringAt(deep, 2)[9]!);
  });

  it("starts and ends on its two notes whichever way round it is asked", () => {
    const ring = ringAt(fan, 1);
    expectRunsBetween(crossLinkPath(ring[5]!, ring[1]!), ring[5]!, ring[1]!);
  });

  it("draws one and the same curve whichever of its two notes is named first", () => {
    // A cross-link joins two notes and points at neither: the map dedupes them
    // by an unordered key, so which end arrives first is whatever the walk
    // happened to hit. Bend the curve around one of them and the same pair of
    // notes gets two different arcs on two different draws.
    const ring = ringAt(fan, 1);
    const one = ring[1]!;
    const other = ring[5]!;
    const there = pointsIn(crossLinkPath(one, other));
    const back = pointsIn(crossLinkPath(other, one)).reverse();
    expect(there.length).toBeGreaterThanOrEqual(3);
    expect(back).toHaveLength(there.length);
    there.forEach((point: Point, i: number) => {
      expect(point.x).toBeCloseTo(back[i]!.x, 2);
      expect(point.y).toBeCloseTo(back[i]!.y, 2);
    });
  });

  it("bows in by a real share of the chord, neither hugging it nor diving at the hub", () => {
    // "Bows inward at all" is satisfied by a hair's breadth, and satisfied
    // equally by a curve dragged all the way onto the hub. Both are wrong on
    // screen for the same reason the straight chord is: one is unreadable as a
    // curve, the other buries the middle of the map under every cross-link
    // drawn. The band is deliberately loose — the fraction itself is the
    // module's to pick — and only says the bow is worth drawing and stops well
    // short of the centre.
    const ring = ringAt(fan, 1);
    const from = ring[0]!;
    const to = ring[3]!;
    const points = pointsIn(crossLinkPath(from, to));
    const samples = 200;
    const closest = Math.min(
      ...Array.from({ length: samples + 1 }, (_, i) => {
        const point = bezierAt(points, i / samples);
        return Math.hypot(point.x, point.y);
      }),
    );
    const straight = straightDistance(from, to);
    expect(closest).toBeLessThan(straight * 0.95);
    expect(closest).toBeGreaterThan(straight * 0.6);
  });

  it("stays a real curve between two notes on opposite sides of the circle", () => {
    const ring = ringAt(radialLayout(note("Hub", brood(60)), reachOf), 1);
    const points = pointsIn(crossLinkPath(ring[0]!, ring[30]!));
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe("reachFor: the seam a node's dot and caption meet at", () => {
  const measure: Measure = (text) => [...text].length * 6;

  it("gives the hub the bigger dot and a plain note the smaller one", () => {
    const hub = reachFor("Hub", true, 0, measure);
    const plain = reachFor("Note", false, 0, measure);
    expect(hub.reach.dot).toBe(HUB_DOT_RADIUS);
    expect(plain.reach.dot).toBe(DOT_RADIUS);
  });

  it("reports the caption width radialCaption itself gives the same stem", () => {
    const stem = "A rather long note name for one ring";
    const { reach, caption } = reachFor(stem, false, 0, measure);
    const expected = radialCaption(stem, measure);
    expect(caption).toEqual(expected);
    expect(reach.caption).toBe(expected.width);
  });

  it("reserves a fold count's own width too", () => {
    const stem = "Folded branch";
    const { reach, caption } = reachFor(stem, false, 3, measure);
    const expected = radialCaption(stem, measure, { suffix: "+3" });
    expect(caption).toEqual(expected);
    expect(reach.caption).toBe(expected.width);
    // Not vacuous: the count has to actually cost width, or this would pass
    // even with the count silently dropped.
    expect(expected.width).toBeGreaterThan(radialCaption(stem, measure).width);
  });
});

/**
 * A ring is sized by what stands on it. Sizing the whole circle from its
 * busiest ring drags the quiet ones out with it — on a real project ring 1 held
 * eight notes and sat three and a half times further out than eight notes need,
 * because a ring further out held forty-four.
 */
describe("radialLayout sizes each ring by its own crowding", () => {
  const ringRadius = (layout: ReturnType<typeof radialLayout>, depth: number): number =>
    layout.nodes.find((n) => n.depth === depth)!.radius;

  it("does not push a quiet ring out because a busier one lies beyond it", () => {
    const quietBeyond = note("Hub", [note("a", [note("x"), note("y")]), note("b"), note("c")]);
    const busyBeyond = note("Hub", [note("a", brood(60, "k")), note("b"), note("c")]);
    const reach = evenReach(120);

    const quiet = radialLayout(quietBeyond, reach);
    const busy = radialLayout(busyBeyond, reach);

    // Ring 1 carries the same three notes in both, so it must land in the same
    // place in both. Only ring 2 differs.
    expect(ringRadius(busy, 1)).toBeCloseTo(ringRadius(quiet, 1), 6);
    expect(ringRadius(busy, 2)).toBeGreaterThan(ringRadius(quiet, 2));
  });

  it("keeps a quiet ring beyond a crowded one outside it all the same", () => {
    const layout = radialLayout(note("Hub", [note("a", brood(40, "k").map((k) => note(k.stem, [note("leaf")])))]), evenReach(120));
    expect(ringRadius(layout, 2)).toBeGreaterThan(ringRadius(layout, 1));
    expect(ringRadius(layout, 3)).toBeGreaterThan(ringRadius(layout, 2));
  });

  it("gives a ring room for everything standing on it", () => {
    const reach: Reach = { dot: 6, caption: 120 };
    const layout = radialLayout(note("Hub", brood(40)), () => reach);
    const ring = ringAt(layout, 1);
    const needed = leastSteps(ring, () => reach).reduce((a: number, b: number) => a + b, 0);
    expect(2 * Math.PI * ringOf(layout, 1)).toBeGreaterThanOrEqual(needed);
  });
});

describe("radialLayout density", () => {
  const chain = note("Hub", [note("a", [note("b", [note("c")])])]);

  it("draws the rings closer together when asked for a tighter density", () => {
    const far = radialLayout(chain, evenReach(60), { ringGap: 170 });
    const near = radialLayout(chain, evenReach(60), { ringGap: 90 });
    for (const depth of [1, 2, 3]) {
      const at = (l: typeof far) => l.nodes.find((n) => n.depth === depth)!.radius;
      expect(at(near)).toBeLessThan(at(far));
    }
  });

  it("keeps the rings in order however tight the density", () => {
    const near = radialLayout(chain, evenReach(60), { ringGap: 40 });
    const radii = [1, 2, 3].map((d) => near.nodes.find((n) => n.depth === d)!.radius);
    expect(radii[1]!).toBeGreaterThan(radii[0]!);
    expect(radii[2]!).toBeGreaterThan(radii[1]!);
  });

  it("cannot pull a crowded ring in past what stands on it", () => {
    const crowded = note("Hub", brood(50));
    const reach: Reach = { dot: 6, caption: 120 };
    const far = radialLayout(crowded, () => reach, { ringGap: 170 });
    const near = radialLayout(crowded, () => reach, { ringGap: 40 });
    // A ring of fifty notes is sized by its fifty notes, not by the gap. Said
    // of the circle they were reserved on: where the band is finally drawn is
    // a separate question, and density is one of the things that answers it.
    expect(ringOf(near, 1)).toBeCloseTo(ringOf(far, 1), 6);
  });

  it("uses the same spacing as before when no density is given", () => {
    const withDefault = radialLayout(chain, evenReach(60));
    const explicit = radialLayout(chain, evenReach(60), { ringGap: 170 });
    expect(withDefault.nodes.map((n) => n.radius)).toEqual(explicit.nodes.map((n) => n.radius));
  });
});
