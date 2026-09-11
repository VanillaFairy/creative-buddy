import { describe, it, expect } from "vitest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { VaultView } from "../src/graph/types";
import { findGraphs, collectNoteFiles } from "../src/graph/discovery";

const view = (name: string) => new VaultView(loadFixtureVault(name));

describe("findGraphs", () => {
  it("finds the single graph in simple/", () => {
    expect(findGraphs(view("simple"))).toEqual(["Noir game"]);
  });
  it("does not descend into a found graph (nested charter belongs to the outer graph)", () => {
    expect(findGraphs(view("edge-cases"))).toEqual(["Edge"]);
  });
  it("the root itself may be a graph", () => {
    expect(findGraphs(view("rooty"))).toEqual([""]);
  });
  it("orders multiple graphs like sorted(Path)", () => {
    expect(findGraphs(view("multi"))).toEqual(["Alpha", "Beta"]);
  });
});

describe("collectNoteFiles (the graph's notes)", () => {
  it("leaves out the folders that are somebody's tooling, not somebody's notes", () => {
    // `.claude/`, `.obsidian/` and the rest are already skipped when hunting
    // for graphs. They were not skipped when listing a graph's notes, so a
    // scratch file under `.claude/` arrived as a node — and now that the
    // folder tree *is* the hierarchy, it would arrive as a whole branch.
    const files = new Map<string, string>([
      ["G/G.md", "## Charter\n"],
      ["G/Real.md", ""],
      ["G/.claude/todo/scratch.md", ""],
      ["G/.obsidian/plugins/notes.md", ""],
      ["G/node_modules/pkg/readme.md", ""],
    ]);
    expect(collectNoteFiles(new VaultView({ rootName: "V", files }), "G")).toEqual([
      "G/G.md",
      "G/Real.md",
    ]);
  });

  it("includes subfolders, excludes Log/ case-insensitively, sorts Windows-style", () => {
    const files = collectNoteFiles(view("simple"), "Noir game");
    expect(files).toEqual([
      "Noir game/Heavy Rain.md",
      "Noir game/Noir game.md",
      "Noir game/References/Observer.md",
      "Noir game/References/References.md",
      "Noir game/Мысли.md",
    ]);
  });
});

describe("isMarkdown suffix semantics", () => {
  it("a file named exactly `.md` has no suffix in Python, so it is not collected", () => {
    const files = new Map<string, string>([
      ["G/G.md", "## Charter\n"],
      ["G/.md", "not a markdown suffix"],
    ]);
    const view = new VaultView({ rootName: "V", files });
    expect(collectNoteFiles(view, "G")).toEqual(["G/G.md"]);
  });
});
