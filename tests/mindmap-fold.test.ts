import { describe, it, expect } from "vitest";
import { foldMark, hiddenIfFolded } from "../src/mindmap/fold";

/** Only the two counts matter, so a stand-in carries nothing else. */
const node = (children: number, collapsedChildren: number) => ({
  children: Array.from({ length: children }, () => ({})),
  collapsedChildren,
});

describe("foldMark", () => {
  it("offers to collapse a branch whose children are on screen", () => {
    expect(foldMark(node(3, 0))).toBe("collapse");
  });

  it("offers to expand a branch that is hiding its children", () => {
    expect(foldMark(node(0, 4))).toBe("expand");
  });

  it("offers nothing on a leaf, because clicking it opens the note instead", () => {
    expect(foldMark(node(0, 0))).toBeNull();
  });

  it("offers to expand a branch that somehow reports both, since something is hidden", () => {
    // `buildMindmapData` empties `children` when it collapses a node, so this
    // pair cannot arise today. It is pinned because the answer is not
    // arbitrary: if anything is hidden, the click that reveals it is the one
    // worth offering.
    expect(foldMark(node(2, 5))).toBe("expand");
  });
});

describe("hiddenIfFolded", () => {
  const branch = (children: Branch[] = [], collapsedChildren = 0): Branch => ({ children, collapsedChildren });
  type Branch = { children: Branch[]; collapsedChildren: number };

  it("counts nothing under a leaf", () => {
    expect(hiddenIfFolded(branch())).toBe(0);
  });

  it("counts a whole subtree, not just the children one level down", () => {
    expect(hiddenIfFolded(branch([branch([branch(), branch()]), branch()]))).toBe(4);
  });

  it("takes an already-folded node's own count, since its children are not in the tree", () => {
    expect(hiddenIfFolded(branch([], 9))).toBe(9);
  });

  it("counts through a folded child, so a fold higher up still reserves the same room", () => {
    const open = branch([branch([branch(), branch()])]);
    const withFoldedChild = branch([branch([], 2)]);
    expect(hiddenIfFolded(withFoldedChild)).toBe(hiddenIfFolded(open));
  });
});
