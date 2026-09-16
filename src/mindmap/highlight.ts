import type { MindmapData } from "./layout";

/** Highlight when it is on. Off is `null`. `lit` always contains `center`. */
export interface Highlight {
  readonly center: string;
  readonly lit: ReadonlySet<string>;
}

/** What the rules need from the map data: the whole hierarchy and the cross-links. */
export type Links = Pick<MindmapData, "parentOf" | "crossLinks">;

/** Parent, children, and cross-link partners in either direction. Never includes `path` itself. */
export function neighboursOf(links: Links, path: string): Set<string> {
  const out = new Set<string>();
  const parent = links.parentOf.get(path);
  if (parent !== undefined) out.add(parent);
  for (const [child, parentOfChild] of links.parentOf) {
    if (parentOfChild === path) out.add(child);
  }
  for (const edge of links.crossLinks) {
    if (edge.from === path) out.add(edge.to);
    if (edge.to === path) out.add(edge.from);
  }
  out.delete(path);
  return out;
}

/** Off when `path` is the center; otherwise a fresh Highlight centered on `path`. */
export function toggle(state: Highlight | null, links: Links, path: string): Highlight | null {
  if (state !== null && state.center === path) return null;
  return { center: path, lit: new Set([path, ...neighboursOf(links, path)]) };
}

export function add(state: Highlight, path: string): Highlight {
  return { center: state.center, lit: new Set([...state.lit, path]) };
}

/** A no-op on the center. */
export function remove(state: Highlight, path: string): Highlight {
  if (path === state.center) return state;
  const lit = new Set(state.lit);
  lit.delete(path);
  return { center: state.center, lit };
}

/** Lights `path` and all its neighbours. */
export function extend(state: Highlight, links: Links, path: string): Highlight {
  return { center: state.center, lit: new Set([...state.lit, path, ...neighboursOf(links, path)]) };
}

/** Off when the center is not in `existing`; otherwise drops lit paths that are not. */
export function prune(state: Highlight | null, existing: ReadonlySet<string>): Highlight | null {
  if (state === null) return null;
  if (!existing.has(state.center)) return null;
  const lit = new Set([...state.lit].filter((path) => existing.has(path)));
  return { center: state.center, lit };
}

export interface HighlightMenu {
  /** Whether the Highlight checkbox is ticked on this note. */
  checked: boolean;
  /** The membership item this note offers, if any. */
  membership: "add" | "remove" | null;
  /** Whether Extend Highlight is offered. */
  extend: boolean;
}

export function menuFor(state: Highlight | null, path: string): HighlightMenu {
  if (state === null) return { checked: false, membership: null, extend: false };
  if (path === state.center) return { checked: true, membership: null, extend: true };
  const lit = state.lit.has(path);
  return { checked: false, membership: lit ? "remove" : "add", extend: true };
}

/**
 * The drawn notes that paint lit: each lit note itself, or — when a fold hides
 * it — its outermost collapsed ancestor, which is the one actually drawn.
 */
export function drawnLit(
  state: Highlight,
  parentOf: ReadonlyMap<string, string>,
  collapsed: ReadonlySet<string>,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const path of state.lit) {
    // Walk to the root, keeping the last (outermost) collapsed ancestor seen —
    // it hides everything beneath it, including any narrower fold on the way down.
    let outermost: string | null = null;
    let current = parentOf.get(path);
    while (current !== undefined) {
      if (collapsed.has(current)) outermost = current;
      current = parentOf.get(current);
    }
    result.add(outermost ?? path);
  }
  return result;
}

/** Whether an edge between two drawn ends is lit: both ends must be in the drawn-lit set. */
export function edgeLit(lit: ReadonlySet<string>, a: string, b: string): boolean {
  return lit.has(a) && lit.has(b);
}
