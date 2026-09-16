# Shared Interfaces

Every name and type below is fixed. A task that needs a different shape stops and
escalates rather than renaming.

## `src/mindmap/layout.ts` (T01)

`MindmapData` gains one field:

```ts
export interface MindmapData {
  // …existing fields unchanged…
  /**
   * Every note's parent in the full hierarchy, pruned or not. The hub has no
   * entry. The flat map drops folded branches from `root`; this does not.
   */
  parentOf: ReadonlyMap<string, string>;
}
```

It is the `parentOf` that `hierarchyOf(...)` already returns inside
`buildMindmapData`, passed through unchanged.

## `src/mindmap/highlight.ts` (T02)

```ts
import type { MindmapData } from "./layout";

/** Highlight when it is on. Off is `null`. `lit` always contains `center`. */
export interface Highlight {
  readonly center: string;
  readonly lit: ReadonlySet<string>;
}

/** What the rules need from the map data: the whole hierarchy and the cross-links. */
export type Links = Pick<MindmapData, "parentOf" | "crossLinks">;

/** Parent, children, and cross-link partners in either direction. Never includes `path` itself. */
export function neighboursOf(links: Links, path: string): Set<string>;

/** Off when `path` is the center; otherwise a fresh Highlight centered on `path`. */
export function toggle(state: Highlight | null, links: Links, path: string): Highlight | null;

export function add(state: Highlight, path: string): Highlight;

/** A no-op on the center. */
export function remove(state: Highlight, path: string): Highlight;

/** Lights `path` and all its neighbours. */
export function extend(state: Highlight, links: Links, path: string): Highlight;

/** Off when the center is not in `existing`; otherwise drops lit paths that are not. */
export function prune(state: Highlight | null, existing: ReadonlySet<string>): Highlight | null;

export interface HighlightMenu {
  /** Whether the Highlight checkbox is ticked on this note. */
  checked: boolean;
  /** The membership item this note offers, if any. */
  membership: "add" | "remove" | null;
  /** Whether Extend Highlight is offered. */
  extend: boolean;
}

export function menuFor(state: Highlight | null, path: string): HighlightMenu;

/**
 * The drawn notes that paint lit: each lit note itself, or — when a fold hides
 * it — its outermost collapsed ancestor, which is the one actually drawn.
 */
export function drawnLit(
  state: Highlight,
  parentOf: ReadonlyMap<string, string>,
  collapsed: ReadonlySet<string>,
): ReadonlySet<string>;
```

Transitions return new state objects and never mutate the one passed in.

## `src/mindmap/MindmapView.tsx` (T03, T04)

- Field: `private highlight: Highlight | null = null;`
- `wireNode(g, node, setActive, links: Links)` — T03 adds the fourth parameter.
- CSS classes (T04): `cb-mm-dimmed` on dimmed nodes, tree edges and cross-links;
  `cb-mm-crosslink-held` on cross-links with both ends lit.
- CSS class (T03): `cb-mm-highlight` on the header chip.
