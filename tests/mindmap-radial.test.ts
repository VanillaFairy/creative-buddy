import { describe, it, expect } from "vitest";
import { radialLayout, radialLinkPath, crossLinkPath, CAPTION_GAP } from "../src/mindmap/radial";
import type { Reach, ReachOf, RadialLayout, RadialLink, RadialNode } from "../src/mindmap/radial";
import type { MindmapNode } from "../src/mindmap/layout";

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

/** How much room each neighbouring pair on a ring actually got, in drawn pixels. */
const arcSteps = (ring: RadialNode[]): number[] => {
  const steps: number[] = [];
  for (let i = 1; i < ring.length; i++) {
    steps.push((ring[i]!.angle - ring[i - 1]!.angle) * ring[i]!.radius);
  }
  return steps;
};

/**
 * The least breadth the spec says a node takes up: its dot, the gap and its
 * whole caption. The real reservation may be more generous — padding is the
 * module's business — so every check here is a floor, never an equality.
 */
const leastBreadth = (reach: Reach): number => reach.dot + CAPTION_GAP + reach.caption;

/** The test's own model of a caption's height. The layout only promises breadth. */
const CAPTION_HALF_HEIGHT = 7;

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

const overlaps = (a: Rect, b: Rect): boolean =>
  a.left + EPS < b.right && b.left + EPS < a.right && a.top + EPS < b.bottom && b.top + EPS < a.bottom;

const where = (node: RadialNode, rect: Rect): string =>
  `${node.path} @${node.angle.toFixed(4)}rad r${node.radius.toFixed(2)} ` +
  `[${rect.left.toFixed(2)}..${rect.right.toFixed(2)}]x[${rect.top.toFixed(2)}..${rect.bottom.toFixed(2)}]`;

/** The load-bearing invariant, checked pair by pair over one ring. */
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

  it("holds when the notes on a ring are wildly different widths", () => {
    // A layout that reserves one width for everything passes the even case and
    // fails here — the wide captions land on top of their narrow neighbours.
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
    expect(TAU * ring[0]!.radius).toBeGreaterThanOrEqual((ring.length - 1) * leastBreadth(reach) - EPS);
  });
});

describe("radialLayout: crowding grows the circle instead of squeezing the notes", () => {
  it("gives every neighbouring pair at least the breadth it reserved, roomy or packed", () => {
    const reach: Reach = { dot: 6, caption: 90 };
    for (const count of [4, 12, 60]) {
      const layout = radialLayout(note("Hub", brood(count)), () => reach);
      for (const step of arcSteps(ringAt(layout, 1))) {
        expect(step).toBeGreaterThanOrEqual(leastBreadth(reach) - EPS);
      }
    }
  });

  it("gives the same room on an inner and an outer ring of a deep graph", () => {
    const reach: Reach = { dot: 5, caption: 100 };
    const layout = radialLayout(note("Hub", nested(7, 2)), () => reach);
    for (const depth of [1, 2]) {
      for (const step of arcSteps(ringAt(layout, depth))) {
        expect(step).toBeGreaterThanOrEqual(leastBreadth(reach) - EPS);
      }
    }
  });

  it("pushes the first ring further out when sixty notes stand on it than when four do", () => {
    const reachOf = evenReach(90);
    const roomy = radialLayout(note("Hub", brood(4)), reachOf);
    const packed = radialLayout(note("Hub", brood(60)), reachOf);
    expect(ringAt(packed, 1)[0]!.radius).toBeGreaterThan(ringAt(roomy, 1)[0]!.radius);
  });

  it("reserves a wider caption's whole extra width, not a share of it", () => {
    const narrow: Reach = { dot: 6, caption: 40 };
    const wide: Reach = { dot: 6, caption: 160 };
    const stepOf = (reach: Reach): number =>
      Math.min(...arcSteps(ringAt(radialLayout(note("Hub", brood(8)), () => reach), 1)));
    expect(stepOf(wide)).toBeGreaterThanOrEqual(stepOf(narrow) + (wide.caption - narrow.caption) - EPS);
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
    const reachOf = evenReach(70);
    const fanStep = Math.max(...arcSteps(ringAt(radialLayout(note("Hub", brood(3)), reachOf), 1)));
    const packedStep = Math.max(...arcSteps(ringAt(radialLayout(note("Hub", brood(60)), reachOf), 1)));
    expect(fanStep).toBeLessThanOrEqual(packedStep + EPS);
  });

  it("opens the fan wider for wide notes than for small ones, rather than filling the circle either way", () => {
    // A layout that spreads whatever it is given evenly around the circle gives
    // both of these the same span; one that reserves real breadth does not.
    const span = (reachOf: ReachOf): number => {
      const angles = radialLayout(note("Hub", brood(3)), reachOf).nodes.map((n: RadialNode) => n.angle);
      return Math.max(...angles) - Math.min(...angles);
    };
    expect(span(evenReach(10, 2))).toBeLessThan(span(evenReach(200, 6)));
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

  it("never lets a caption cross the dot it belongs to", () => {
    const reachOf = evenReach(75);
    const layout = radialLayout(note("Hub", brood(24)), reachOf);
    for (const node of layout.nodes) {
      const rect = captionRect(node, reachOf(node.data));
      if (node.labelAnchor === "start") expect(rect.left).toBeGreaterThanOrEqual(node.x);
      else expect(rect.right).toBeLessThanOrEqual(node.x);
    }
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

  it("returns bounds that enclose every caption and every dot it laid out", () => {
    const root = note("Hub", nested(5, 2));
    const reachOf = variedReach(root, [30, 170, 60, 120]);
    const { nodes, bounds } = radialLayout(root, reachOf);
    for (const node of nodes) {
      const reach = reachOf(node.data);
      const rect = captionRect(node, reach);
      expect(bounds.minX).toBeLessThanOrEqual(rect.left + EPS);
      expect(bounds.maxX).toBeGreaterThanOrEqual(rect.right - EPS);
      expect(bounds.minX).toBeLessThanOrEqual(node.x - reach.dot + EPS);
      expect(bounds.maxX).toBeGreaterThanOrEqual(node.x + reach.dot - EPS);
      expect(bounds.minY).toBeLessThanOrEqual(node.y - reach.dot + EPS);
      expect(bounds.maxY).toBeGreaterThanOrEqual(node.y + reach.dot - EPS);
    }
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

/** Checks a path's two ends and hands back the shape between them. */
const expectRunsBetween = (path: string, from: RadialNode, to: RadialNode): Point[] => {
  const points = pointsIn(path);
  expect(points.length, `a curve needs a shape between its ends, got ${path}`).toBeGreaterThanOrEqual(3);
  expect(points[0]!.x).toBeCloseTo(from.x, 6);
  expect(points[0]!.y).toBeCloseTo(from.y, 6);
  expect(points[points.length - 1]!.x).toBeCloseTo(to.x, 6);
  expect(points[points.length - 1]!.y).toBeCloseTo(to.y, 6);
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

  it("stays a real curve between two notes on opposite sides of the circle", () => {
    const ring = ringAt(radialLayout(note("Hub", brood(60)), reachOf), 1);
    const points = pointsIn(crossLinkPath(ring[0]!, ring[30]!));
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
