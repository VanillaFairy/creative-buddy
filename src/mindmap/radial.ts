/**
 * The map as bands around its hub.
 *
 * Two questions, answered in that order: which way round the circle each note
 * lies, and how far out. This file owns the first. It is the same `d3-flextree`
 * pass the flat map runs, with its axes read differently — x is an angle in
 * radians and depth is a radius — and the one rule belonging to this shape
 * alone is how much of a circle a node reserves.
 *
 * The second question belongs to `bands.ts`. Reserving a share of a circle is
 * not the same as needing it: two captions can be nearer each other than
 * either reserved and still not touch, and one that cannot has a whole lane of
 * radius to step into. So the circle worked out here is the loosest a
 * generation ever gets, and the band it is actually drawn into is usually
 * nearer the hub.
 *
 * Captions never rotate, so how much of a ring one takes up depends on where
 * on the circle it stands: at the top it lies flat across its ring and takes
 * its whole width out of it, at three o'clock it points straight down its own
 * radius and takes none. Reserving the first case everywhere is the safe thing
 * and it is what left the hub sitting alone in an empty disc, so a ring is
 * measured against where its notes actually stand instead. That is circular —
 * a bearing settles a ring and a ring settles the bearing — and it is walked
 * round a fixed number of times until both are quiet.
 */

import { hierarchy } from "d3-hierarchy";
import { flextree } from "d3-flextree";
import { radialCaption, CAPTION_HEIGHT, DOT_RADIUS, HUB_DOT_RADIUS } from "./geometry";
import { placeBands } from "./bands";
import type { Generation } from "./bands";
import type { MindmapNode } from "./layout";
import type { Bounds, Caption, Measure } from "./geometry";

/**
 * The least room between one generation's circle and the next's. A generation
 * with few notes on it takes exactly this; a crowded one is sized by what
 * stands on it and ignores the gap entirely, which is why loosening it does
 * nothing to a busy circle.
 */
const RING_GAP = 170;

/** How the map is asked to space its rings. */
export interface RadialOptions {
  ringGap?: number;
}
/** Breathing room either side of what a node reserves on its ring. */
const BREADTH_GAP = 14;
/**
 * How many times the rings and the bearings are settled against each other.
 *
 * Six. Measured across a range of real shapes, the innermost ring is inside a
 * pixel of where it ends up by the fourth pass and the outermost inside two by
 * the sixth; going on to twelve moves nothing anyone can see. A pass is two
 * `flextree` runs, which is cheap against a map that redraws on a 300ms debounce.
 */
const SETTLING_PASSES = 6;
/** The space between a dot and the caption beside it. */
export const CAPTION_GAP = 7;
/**
 * The gap between a folded node's dot and the hidden-question ring drawn
 * around it. Nothing at this seam reserves ring space for it — not
 * `angularSize`, not `boundsOf` — so it must stay under CAPTION_GAP, the only
 * slack this seam has to give.
 */
export const HIDDEN_RING_GAP = 3;
const TAU = Math.PI * 2;

export interface Reach { dot: number; caption: number; }
export type ReachOf = (node: MindmapNode) => Reach;

export interface Reaching { reach: Reach; caption: Caption; }

/**
 * How a node becomes the `Reach` a ring reserves for it, and the `Caption`
 * that reservation was measured against — one call so a view can draw the
 * caption it already paid for instead of measuring the stem a second time.
 */
export function reachFor(stem: string, isHub: boolean, foldCount: number, measure: Measure): Reaching {
  const caption = radialCaption(stem, measure, { suffix: foldCount > 0 ? `+${foldCount}` : null });
  return { reach: { dot: isHub ? HUB_DOT_RADIUS : DOT_RADIUS, caption: caption.width }, caption };
}

export interface RadialNode {
  path: string;
  data: MindmapNode;
  depth: number;
  /** Radians. Zero points straight up and the angle grows clockwise. */
  angle: number;
  radius: number;
  /**
   * Which lane of its generation's band the note stands in, counting outward
   * from nought. Notes of one generation no longer share a radius; they share
   * a band, and this says where in it.
   */
  lane: number;
  /** Cartesian, with the hub at the origin. */
  x: number;
  y: number;
  /** Which side of the dot the caption hangs off. */
  labelAnchor: "start" | "end";
}

export interface RadialLink { source: RadialNode; target: RadialNode; }

export interface RadialLayout {
  nodes: RadialNode[];
  links: RadialLink[];
  bounds: Bounds;
  /**
   * The circle each generation's bearings were measured against, by depth.
   *
   * This is where the generation would stand with every note of it on one
   * radius, and it is what every note's share of the circle was reserved on.
   * The band it actually draws into is usually nearer the hub than this — see
   * `bands.ts` — so `radius` on a node is not this number, and the arc a note
   * was given is an angle times *this*, not times where it ended up.
   */
  rings: ReadonlyMap<number, number>;
}

export function radialLayout(
  root: MindmapNode,
  reachOf: ReachOf,
  options: RadialOptions = {},
): RadialLayout {
  const ringGap = options.ringGap ?? RING_GAP;

  // Where each note stood when the rings were last measured. Empty to begin
  // with, which reads as the worst case: every caption reserved as if it lay
  // flat across its ring.
  let bearing = new Map<string, number>();

  // How much of a ring a note takes up. A caption is horizontal and a ring is
  // not, so only the part of one that lies across the ring is the ring's to
  // find — `|cos|` of the bearing, all of it at the top and the bottom of the
  // circle and none of it at three and nine o'clock, where the caption points
  // straight down its own radius instead. It is a line of text wherever it
  // stands, though, so what it takes never falls below one.
  const breadthOf = (node: MindmapNode): number => {
    const reach = reachOf(node);
    const angle = bearing.get(node.path);
    const across = angle === undefined ? 1 : Math.abs(Math.cos(angle));
    const caption = reach.caption > 0 ? CAPTION_GAP + reach.caption : 0;
    return Math.max(reach.dot * 2, CAPTION_HEIGHT) + across * caption + BREADTH_GAP;
  };

  const byDepth = new Map<number, MindmapNode[]>();
  const collect = (node: MindmapNode, depth: number): void => {
    if (depth > 0) {
      const at = byDepth.get(depth) ?? [];
      at.push(node);
      byDepth.set(depth, at);
    }
    for (const child of node.children) collect(child, depth + 1);
  };
  collect(root, 0);
  const depths = [...byDepth.keys()].sort((a, b) => a - b);

  let rings = new Map<number, number>();
  // The hub sits at the origin and has no ring; it borrows the first one's gap
  // purely to have a radius to divide by.
  const ringOf = (depth: number): number => rings.get(depth) ?? ringGap;
  const angularSize = (depth: number, node: MindmapNode): number =>
    breadthOf(node) / ringOf(depth);

  // Every note's breadth is known before anything is placed, so each ring can be
  // sized to what actually stands on it rather than to the busiest ring in the
  // graph. Sizing the whole circle from its worst ring is the obvious thing to
  // do and it is badly wrong on a real project: one ring of forty-four notes
  // held a ring of eight three and a half times further out than eight notes
  // need, and a ring of ten beyond it more than five times further.
  //
  // Each ring still has to clear the one inside it, so the radii are walked
  // outward and never allowed to fall back — a ring sized purely by its own
  // crowding can otherwise land inside a busier ring it is supposed to enclose.
  const ringsFrom = (want: (depth: number) => number): Map<number, number> => {
    const out = new Map<number, number>();
    let outward = 0;
    for (const depth of depths) {
      outward = Math.max(outward + ringGap, want(depth));
      out.set(depth, outward);
    }
    return out;
  };

  // flextree's contour-tracing pass separates any two nodes it finds
  // adjacent — cousins from different parents included, not only siblings —
  // by the MEAN of their sizes. That is right for boxes centred on both
  // sides of their own space; it is wrong for a caption that hangs entirely
  // off one side of its dot, which needs its full width toward a neighbour,
  // not half of it. `(a+b)/2 + |a-b|/2 = max(a,b)`, so adding the second
  // term as `spacing` on top of flextree's own mean turns the separation it
  // enforces into the max the shape actually needs.
  const pack = () =>
    flextree<MindmapNode>()
      .nodeSize((n) => [angularSize(n.depth, n.data), 1])
      .spacing((a, b) => Math.abs(angularSize(a.depth, a.data) - angularSize(b.depth, b.data)) / 2)(
      hierarchy(root, (d) => d.children),
    );

  let nodes: RadialNode[] = [];
  let byPath = new Map<string, RadialNode>();
  let laid = pack();

  // Breadth depends on bearing and bearing depends on breadth, so the two are
  // walked round together. Each turn reserves against where the notes actually
  // stood on the last one, which pulls the rings in, which moves the notes
  // again — by a smaller step every time, since a ring only ever shrinks and a
  // shrinking ring cannot spread its notes past a full turn. Every shape
  // measured is quiet well before the last pass. The count is fixed rather
  // than fitted to a tolerance so that one graph always draws one way.
  for (let pass = 0; pass < SETTLING_PASSES; pass++) {
    rings = ringsFrom(
      (depth) => (byDepth.get(depth) ?? []).reduce((sum, node) => sum + breadthOf(node), 0) / TAU,
    );

    // Summing breadths underestimates a ring, because that same max-separation
    // rule spaces neighbours by the wider of the two rather than their average.
    // Left there, the first pass overruns a turn, the whole circle grows to
    // absorb it, and the per-ring sizing above is undone — a quiet ring gets
    // dragged out by a busy one after all. So the rings are measured against
    // what they actually packed into and sized again from that. Angles go as
    // 1/radius, so a single correction lands it.
    const used = new Map<number, { low: number; high: number }>();
    pack().each((n) => {
      if (n.depth === 0) return;
      const half = angularSize(n.depth, n.data) / 2;
      const at = used.get(n.depth) ?? { low: Infinity, high: -Infinity };
      used.set(n.depth, { low: Math.min(at.low, n.x - half), high: Math.max(at.high, n.x + half) });
    });
    rings = ringsFrom((depth) => {
      const at = used.get(depth);
      const span = at === undefined ? 0 : at.high - at.low;
      return (rings.get(depth) ?? ringGap) * Math.max(1, span / TAU);
    });

    laid = pack();

    // Once every node has the full breadth it reserved, a busy ring can want
    // more than a full turn. Shrinking every angle and growing every radius by
    // the same factor leaves each node exactly the arc it reserved and closes
    // the circle. It only ever shrinks: a three-note graph stays a fan.
    let left = Infinity;
    let right = -Infinity;
    laid.each((n) => {
      const half = angularSize(n.depth, n.data) / 2;
      left = Math.min(left, n.x - half);
      right = Math.max(right, n.x + half);
    });
    const span = right - left;
    const scale = span > TAU ? TAU / span : 1;
    const middle = (left + right) / 2;

    nodes = [];
    byPath = new Map<string, RadialNode>();
    bearing = new Map<string, number>();
    laid.each((n) => {
      const angle = (n.x - middle) * scale;
      const radius = n.depth === 0 ? 0 : ringOf(n.depth) / scale;
      const x = radius * Math.sin(angle);
      const node: RadialNode = {
        path: n.data.path, data: n.data, depth: n.depth, angle, radius, lane: 0, x,
        y: -radius * Math.cos(angle),
        labelAnchor: x < 0 ? "end" : "start",
      };
      nodes.push(node);
      byPath.set(node.path, node);
      bearing.set(node.path, angle);
    });
  }

  // The bearings are settled; the distances are not. Every generation has a
  // ring it could have to itself, and `placeBands` decides how much nearer the
  // hub it is worth drawing instead — see `bands.ts` for why that is a
  // question worth asking.
  const generations: Generation[] = [];
  for (const depth of depths) {
    const notes = nodes.filter((node) => node.depth === depth);
    if (notes.length === 0) continue;
    generations.push({
      depth,
      loosest: notes[0]!.radius,
      notes: notes.map((node) => ({ path: node.path, angle: node.angle, reach: reachOf(node.data) })),
    });
  }
  const reserved = new Map(generations.map((g) => [g.depth, g.loosest]));
  const seats = placeBands(generations, reachOf(root), ringGap);
  for (const node of nodes) {
    const seat = seats.get(node.path);
    if (seat === undefined) continue;
    node.radius = seat.radius;
    node.lane = seat.lane;
    node.x = seat.radius * Math.sin(node.angle);
    node.y = -seat.radius * Math.cos(node.angle);
    node.labelAnchor = node.x < 0 ? "end" : "start";
  }

  const links: RadialLink[] = [];
  laid.each((n) => {
    if (n.parent === null) return;
    const source = byPath.get(n.parent.data.path);
    const target = byPath.get(n.data.path);
    if (source !== undefined && target !== undefined) links.push({ source, target });
  });

  return { nodes, links, bounds: boundsOf(nodes, reachOf), rings: reserved };
}

/**
 * The box the drawing occupies. A caption hangs off one side of its dot only,
 * so a node reaches further that way than the other. Its height is left out — a
 * caption stands a few pixels taller than a dot, which the fit margin already
 * covers, and a constant for that slop would be one nobody could name.
 */
function boundsOf(nodes: RadialNode[], reachOf: ReachOf): Bounds {
  const bounds: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  for (const node of nodes) {
    const reach = reachOf(node.data);
    const tail = reach.caption > 0 ? reach.dot + CAPTION_GAP + reach.caption : reach.dot;
    const rightward = node.labelAnchor === "start" ? tail : reach.dot;
    const leftward = node.labelAnchor === "start" ? reach.dot : tail;
    bounds.minX = Math.min(bounds.minX, node.x - leftward);
    bounds.maxX = Math.max(bounds.maxX, node.x + rightward);
    bounds.minY = Math.min(bounds.minY, node.y - reach.dot);
    bounds.maxY = Math.max(bounds.maxY, node.y + reach.dot);
  }
  return bounds;
}

const at = (angle: number, radius: number): string =>
  `${radius * Math.sin(angle)},${-radius * Math.cos(angle)}`;

/**
 * A parent edge: a cubic whose controls sit on each end's own bearing, halfway
 * between the two rings. It leaves the parent radially and arrives at the child
 * radially, so a branch reads as a branch rather than as a chord.
 */
export function radialLinkPath(source: RadialNode, target: RadialNode): string {
  const middle = (source.radius + target.radius) / 2;
  return `M${at(source.angle, source.radius)}C${at(source.angle, middle)} ${at(target.angle, middle)} ${at(target.angle, target.radius)}`;
}

/** Fraction of the chord midpoint's distance from the hub that survives the pull. */
const CHORD_MIDPOINT_KEEP = 0.4;

/**
 * A cross-link cuts across the circle rather than following it. A quadratic
 * Bezier's apex sits at half the control point's distance, so pulling the
 * control in to 40% of the midpoint's distance puts the curve at 70% of it —
 * pulled in by 30%, just enough to keep it off the ring it starts and ends
 * on, which is the ring it would otherwise be mistaken for.
 */
export function crossLinkPath(from: RadialNode, to: RadialNode): string {
  const cx = ((from.x + to.x) / 2) * CHORD_MIDPOINT_KEEP;
  const cy = ((from.y + to.y) / 2) * CHORD_MIDPOINT_KEEP;
  return `M${from.x},${from.y}Q${cx},${cy} ${to.x},${to.y}`;
}
