/**
 * The map as rings around its hub.
 *
 * Nothing here is new geometry — it is the same `d3-flextree` pass the flat map
 * runs, with its axes read differently: x is an angle in radians and depth is a
 * radius. The one rule belonging to this shape alone is how much of a ring a
 * node reserves. Captions never rotate, so one at the top of the circle lies
 * flat across its ring and takes its full width in breadth; reserving that
 * worst case everywhere costs a little air at the sides of a sparse graph and
 * buys a map that never overlaps itself.
 */

import { hierarchy } from "d3-hierarchy";
import { flextree } from "d3-flextree";
import { radialCaption, DOT_RADIUS, HUB_DOT_RADIUS } from "./geometry";
import type { MindmapNode } from "./layout";
import type { Bounds, Caption, Measure } from "./geometry";

/**
 * The least room between one ring and the next. A ring with few notes on it
 * takes exactly this; a crowded one is sized by what stands on it and ignores
 * the gap entirely, which is why loosening it does nothing to a busy circle.
 */
const RING_GAP = 170;

/** How the map is asked to space its rings. */
export interface RadialOptions {
  ringGap?: number;
}
/** Breathing room either side of what a node reserves on its ring. */
const BREADTH_GAP = 14;
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
}

export function radialLayout(
  root: MindmapNode,
  reachOf: ReachOf,
  options: RadialOptions = {},
): RadialLayout {
  const ringGap = options.ringGap ?? RING_GAP;
  const breadthOf = (node: MindmapNode): number => {
    const reach = reachOf(node);
    return reach.dot * 2 + (reach.caption > 0 ? CAPTION_GAP + reach.caption : 0) + BREADTH_GAP;
  };

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
  const needed = new Map<number, number>();
  const collect = (node: MindmapNode, depth: number): void => {
    if (depth > 0) needed.set(depth, (needed.get(depth) ?? 0) + breadthOf(node));
    for (const child of node.children) collect(child, depth + 1);
  };
  collect(root, 0);

  const depths = [...needed.keys()].sort((a, b) => a - b);
  const ringsFrom = (want: (depth: number) => number): Map<number, number> => {
    const out = new Map<number, number>();
    let outward = 0;
    for (const depth of depths) {
      outward = Math.max(outward + ringGap, want(depth));
      out.set(depth, outward);
    }
    return out;
  };

  let rings = ringsFrom((depth) => needed.get(depth)! / TAU);

  // The hub sits at the origin and has no ring; it borrows the first one's gap
  // purely to have a radius to divide by.
  const ringOf = (depth: number): number => rings.get(depth) ?? ringGap;
  const angularSize = (depth: number, node: MindmapNode): number =>
    breadthOf(node) / ringOf(depth);

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

  // Summing breadths underestimates a ring, because that same max-separation
  // rule spaces neighbours by the wider of the two rather than their average.
  // Left there, the first pass overruns a turn, the whole circle grows to
  // absorb it, and the per-ring sizing above is undone — a quiet ring gets
  // dragged out by a busy one after all. So the rings are measured against what
  // they actually packed into and sized again from that. Angles go as
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

  const laid = pack();

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

  const nodes: RadialNode[] = [];
  const byPath = new Map<string, RadialNode>();
  laid.each((n) => {
    const angle = (n.x - middle) * scale;
    const radius = n.depth === 0 ? 0 : ringOf(n.depth) / scale;
    const x = radius * Math.sin(angle);
    const node: RadialNode = {
      path: n.data.path, data: n.data, depth: n.depth, angle, radius, x,
      y: -radius * Math.cos(angle),
      labelAnchor: x < 0 ? "end" : "start",
    };
    nodes.push(node);
    byPath.set(node.path, node);
  });

  const links: RadialLink[] = [];
  laid.each((n) => {
    if (n.parent === null) return;
    const source = byPath.get(n.parent.data.path);
    const target = byPath.get(n.data.path);
    if (source !== undefined && target !== undefined) links.push({ source, target });
  });

  return { nodes, links, bounds: boundsOf(nodes, reachOf) };
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
