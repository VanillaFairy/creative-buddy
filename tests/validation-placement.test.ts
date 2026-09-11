import { describe, it, expect } from "vitest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { VaultView } from "../src/graph/types";
import { collectNoteFiles, hubPath } from "../src/graph/discovery";
import { noteFromFile } from "../src/graph/notes";
import { duplicateNames, misfiled } from "../src/graph/validation";

function setup(fixture: string, graphDir: string) {
  const view = new VaultView(loadFixtureVault(fixture));
  const notes = collectNoteFiles(view, graphDir).map((p) => noteFromFile(p, view.get(p)!));
  return { view, notes, hub: hubPath(view, graphDir) };
}

describe("duplicateNames", () => {
  it("reports one problem per shared stem, first occurrence named", () => {
    // `Echo` twice under `Tangle`. One of them sits in a folder of its own
    // name, so neither is misfiled — the only thing wrong is the name.
    const { view, notes } = setup("problems", "Tangle");
    const reported = duplicateNames(notes, view.rootName);
    expect(reported).toHaveLength(1);
    expect(reported[0]!.kind).toBe("duplicate-name");
    expect(reported[0]!.note).toBe("Echo.md");
    expect(reported[0]!.detail).toContain("Echo.md");
  });

  it("leaves namesakes under different parents alone", () => {
    // Two notes called `Twin`, one under `Tangle` and one under `Deep`. People
    // share names; a tree says which is which by the branch it hangs off, so
    // this is a shape the graph can represent and not a mistake to report.
    const { view, notes } = setup("problems", "Tangle");
    const twins = notes.filter((n) => n.stem === "Twin");
    expect(twins).toHaveLength(2);
    expect(new Set(twins.map((n) => n.parent)).size).toBe(2);
    expect(duplicateNames(notes, view.rootName).map((p) => p.note)).not.toContain("Twin.md");
  });

  it("clean graph has none", () => {
    const { view, notes } = setup("simple", "Noir game");
    expect(duplicateNames(notes, view.rootName)).toEqual([]);
  });
});

describe("misfiled", () => {
  it("catches a note filed under a stranger folder", () => {
    const { view, notes, hub } = setup("problems", "Tangle");
    expect(misfiled(notes, "Tangle", hub, view.rootName)).toEqual([
      {
        kind: "misfiled",
        note: "Lost.md",
        detail: "sits in 'Misplaced', which is not one of its ancestors",
      },
    ]);
  });

  it("passes the shallow mirror and own-folder cases", () => {
    const { view, notes, hub } = setup("simple", "Noir game");
    expect(misfiled(notes, "Noir game", hub, view.rootName)).toEqual([]);
  });

  it("terminates on parent rings (patched-oracle semantics)", () => {
    const { view, notes, hub } = setup("problems", "Tangle");
    // The ring notes live at graph top level → folder == graph dir → skipped, no problems, no hang.
    const result = misfiled(notes, "Tangle", hub, view.rootName);
    expect(result.filter((p) => p.note.startsWith("Loop"))).toEqual([]);
  });
});
