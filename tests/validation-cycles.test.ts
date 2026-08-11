import { describe, it, expect } from "vitest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { VaultView } from "../src/graph/types";
import { collectNoteFiles, hubPath } from "../src/graph/discovery";
import { noteFromFile } from "../src/graph/notes";
import { resolveParents, findCycles, cycleProblem } from "../src/graph/validation";

function ringSetup() {
  const view = new VaultView(loadFixtureVault("problems"));
  const notes = collectNoteFiles(view, "Tangle").map((p) => noteFromFile(p, view.get(p)!));
  const { edges } = resolveParents(notes, hubPath(view, "Tangle"));
  return { notes, edges };
}

describe("findCycles", () => {
  it("finds each ring exactly once", () => {
    const { notes, edges } = ringSetup();
    const cycles = findCycles(notes, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.map((n) => n.stem).sort()).toEqual(["Loop A", "Loop B", "Loop C"]);
  });

  it("names the ring by its alphabetically first note and closes the chain", () => {
    const { notes, edges } = ringSetup();
    const problem = cycleProblem(findCycles(notes, edges)[0]!);
    expect(problem).toEqual({
      kind: "cycle",
      note: "Loop A.md",
      detail: "parent chain forms a cycle: Loop A -> Loop B -> Loop C -> Loop A",
    });
  });

  it("a clean graph has no cycles", () => {
    const view = new VaultView(loadFixtureVault("simple"));
    const notes = collectNoteFiles(view, "Noir game").map((p) => noteFromFile(p, view.get(p)!));
    const { edges } = resolveParents(notes, hubPath(view, "Noir game"));
    expect(findCycles(notes, edges)).toEqual([]);
  });
});
