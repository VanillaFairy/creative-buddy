/**
 * What clicking a node will do to its branch, or null when it has no branch to
 * fold and the click opens the note instead.
 *
 * The map has two ways of saying a node has children — `children`, which it is
 * drawing, and `collapsedChildren`, which it is hiding — and `buildMindmapData`
 * uses exactly one of them per node. Reading both here is what lets the dot and
 * the click agree about what is about to happen, instead of each working it out
 * from the counts and drifting apart.
 */
export type FoldMark = "collapse" | "expand" | null;

export function foldMark(node: {
  children: readonly unknown[];
  collapsedChildren: number;
}): FoldMark {
  if (node.collapsedChildren > 0) return "expand";
  return node.children.length > 0 ? "collapse" : null;
}

/**
 * How many notes this node would hide if it were folded — which is the count
 * its dot shows once it is.
 *
 * The radial map reserves room for this whether or not the node is folded, so
 * that gaining a `+12` does not make a note wider than the ring gave it and
 * shove its neighbours along. Folding must cost a gap, never everyone's place
 * on the map.
 */
export function hiddenIfFolded(node: FoldCounts): number {
  if (node.collapsedChildren > 0) return node.collapsedChildren;
  let total = 0;
  for (const child of node.children) total += 1 + hiddenIfFolded(child);
  return total;
}

interface FoldCounts {
  children: readonly FoldCounts[];
  collapsedChildren: number;
}
