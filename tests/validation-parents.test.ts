import { describe, it, expect } from "vitest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { VaultView } from "../src/graph/types";
import { collectNoteFiles, hubPath } from "../src/graph/discovery";
import { noteFromFile } from "../src/graph/notes";
import { resolveParents } from "../src/graph/validation";

function notesOf(fixture: string, graphDir: string) {
  const view = new VaultView(loadFixtureVault(fixture));
  const notes = collectNoteFiles(view, graphDir).map((p) => noteFromFile(p, view.get(p)!));
  return { view, notes, hub: hubPath(view, graphDir) };
}

describe("resolveParents", () => {
  it("clean graph resolves everything, hub exempt", () => {
    const { notes, hub } = notesOf("simple", "Noir game");
    const { edges, problems } = resolveParents(notes, hub);
    expect(problems).toEqual([]);
    expect(edges.size).toBe(4); // every non-hub note has a resolved parent
  });

  it("reports unresolved-parent with Python repr detail", () => {
    const { notes, hub } = notesOf("problems", "Tangle");
    const { problems } = resolveParents(notes, hub);
    expect(problems).toContainEqual({
      kind: "unresolved-parent",
      note: "Ghost.md",
      detail: "parent 'Nobody' names no note in this graph",
    });
  });

  it("reports orphan-root for parentless non-hub notes", () => {
    const { notes, hub } = notesOf("problems", "Tangle");
    const { problems } = resolveParents(notes, hub);
    expect(problems).toContainEqual({
      kind: "orphan-root",
      note: "Orphan.md",
      detail: "no parent: value, and this note is not the hub",
    });
  });

  it("matches case-insensitively and last-wins on duplicate stems", () => {
    const { notes, hub } = notesOf("edge-cases", "Edge");
    const { edges, problems } = resolveParents(notes, hub);
    const caseNote = notes.find((n) => n.stem === "Case")!;
    expect(edges.get(caseNote)?.stem).toBe("Edge");
    expect(problems.filter((p) => p.note === "Case.md")).toEqual([]);
  });
});
