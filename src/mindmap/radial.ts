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
import type { MindmapNode } from "./layout";
import type { Bounds } from "./geometry";

/** How far apart two rings sit before a crowded graph pushes them out. */
const RING_GAP = 170;
/** Breathing room either side of what a node reserves on its ring. */
const BREADTH_GAP = 14;
/** The space between a dot and the caption beside it. */
export const CAPTION_GAP = 7;
const TAU = Math.PI * 2;

export interface Reach { dot: number; caption: number; }
export type ReachOf = (node: MindmapNode) => Reach;

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

export function radialLayout(root: MindmapNode, reachOf: ReachOf): RadialLayout {
  const ringOf = (depth: number): number => Math.max(1, depth) * RING_GAP;
  const angularSize = (depth: number, node: MindmapNode): number => {
    const reach = reachOf(node);
    const breadth =
      reach.dot * 2 + (reach.caption > 0 ? CAPTION_GAP + reach.caption : 0) + BREADTH_GAP;
    return breadth / ringOf(depth);
  };

  // flextree's contour-tracing pass separates any two nodes it finds
  // adjacent — cousins from different parents included, not only siblings —
  // by the MEAN of their sizes. That is right for boxes centred on both
  // sides of their own space; it is wrong for a caption that hangs entirely
  // off one side of its dot, which needs its full width toward a neighbour,
  // not half of it. `(a+b)/2 + |a-b|/2 = max(a,b)`, so adding the second
  // term as `spacing` on top of flextree's own mean turns the separation it
  // enforces into the max the shape actually needs — confirmed to hold
  // across subtree boundaries, not only within one, by measuring a fixture
  // of several parents contributing wide-and-narrow children to one ring.
  const laid = flextree<MindmapNode>()
    .nodeSize((n) => [angularSize(n.depth, n.data), 1])
    .spacing((a, b) => Math.abs(angularSize(a.depth, a.data) - angularSize(b.depth, b.data)) / 2)(
    hierarchy(root, (d) => d.children),
  );

  // flextree packs siblings as tightly as their sizes allow, which on a busy
  // ring can want more than a full turn. Shrinking every angle and growing every
  // radius by the same factor leaves each node exactly the arc it reserved and
  // closes the circle. It only ever shrinks: a three-note graph stays a fan.
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

/** How far in a cross-link's chord is pulled toward the hub. */
const CHORD_PULL = 0.4;

/**
 * A cross-link cuts across the circle rather than following it. Pulling the
 * curve most of the way in toward the hub keeps it off the ring it starts and
 * ends on — which is the ring it would otherwise be mistaken for.
 */
export function crossLinkPath(from: RadialNode, to: RadialNode): string {
  const cx = ((from.x + to.x) / 2) * CHORD_PULL;
  const cy = ((from.y + to.y) / 2) * CHORD_PULL;
  return `M${from.x},${from.y}Q${cx},${cy} ${to.x},${to.y}`;
}
