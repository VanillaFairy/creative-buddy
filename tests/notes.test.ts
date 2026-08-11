import { describe, it, expect } from "vitest";
import { noteFromFile, extractLinks, nameResolutionMap } from "../src/graph/notes";

describe("noteFromFile", () => {
  it("extracts the full index row", () => {
    const raw = [
      "---",
      'parent: "[[References]]"',
      "kind: reference",
      "status: rot",
      "aliases:",
      "  - the shelf",
      "---",
      "",
      "Links out to [[Heavy Rain]] and [[Observer|the dense one]] and [[Noir game#Charter]].",
    ].join("\n");
    const note = noteFromFile("Noir game/References/References.md", raw);
    expect(note).toEqual({
      path: "Noir game/References/References.md",
      stem: "References",
      parent: "References",
      kind: "reference",
      status: "rot",
      aliases: ["the shelf"],
      links: ["Heavy Rain", "Observer", "Noir game"],
    });
  });

  it("absent metadata reads as null/empty, never defaults", () => {
    const note = noteFromFile("G/Plain.md", "no frontmatter at all");
    expect(note.parent).toBeNull();
    expect(note.kind).toBeNull();
    expect(note.status).toBeNull();
    expect(note.aliases).toEqual([]);
    expect(note.links).toEqual([]);
  });

  it("a single string alias becomes a one-item list", () => {
    const note = noteFromFile("G/A.md", "---\naliases: solo\n---\n");
    expect(note.aliases).toEqual(["solo"]);
  });

  it("a nested-list alias item digs to its innermost scalar, like parent: does", () => {
    const note = noteFromFile("G/A.md", "---\naliases:\n  - [[nested]]\n---\n");
    expect(note.aliases).toEqual(["nested"]);
  });

  it("BOM hides frontmatter from parent (validation semantics)", () => {
    const note = noteFromFile("G/B.md", '\uFEFF---\nparent: "[[G]]"\n---\n');
    expect(note.parent).toBeNull();
  });

  it("normalises CRLF before parsing", () => {
    const note = noteFromFile("G/C.md", "---\r\nparent: X\r\n---\r\n");
    expect(note.parent).toBe("X");
  });
});

describe("extractLinks", () => {
  it("keeps duplicates and order, drops blanks", () => {
    expect(extractLinks("[[A]] then [[B|b]] then [[A]] and [[ ]]")).toEqual(["A", "B", "A"]);
  });
});

describe("nameResolutionMap", () => {
  it("maps casefolded stems first, aliases only when free", () => {
    const a = noteFromFile("G/Alpha.md", "---\naliases: [beta]\n---\n");
    const b = noteFromFile("G/Beta.md", "x");
    const map = nameResolutionMap([a, b]);
    expect(map.get("alpha")).toBe(a);
    expect(map.get("beta")).toBe(b); // the real stem wins over Alpha's alias
  });
});
