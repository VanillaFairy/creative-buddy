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
    const { view, notes } = setup("problems", "Tangle");
    expect(duplicateNames(notes, view.rootName)).toEqual([
      {
        kind: "duplicate-name",
        note: "Twin.md",
        detail: "name is shared by Tangle/Twin.md",
      },
    ]);
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
