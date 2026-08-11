import { describe, it, expect } from "vitest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { VaultView } from "../src/graph/types";
import { findGraphs, collectNoteFiles, markdownFiles } from "../src/graph/discovery";

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

describe("collectNoteFiles (validation walk)", () => {
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

describe("markdownFiles (obligations walk)", () => {
  it("excludes lowercase log/ and skip-dirs", () => {
    const files = markdownFiles(view("edge-cases"), "Edge");
    expect(files).not.toContain("Edge/log/2026-08-02-a.md");
    expect(files).toContain("Edge/Inner/Leaf.md");
  });
});

describe("markdownFiles ordering", () => {
  it("sorts with the Windows key like the oracle (prefix-sibling case)", () => {
    const files = new Map<string, string>([
      ["G/G.md", "## Charter\n"],
      ["G/Act/x.md", "x"],
      ["G/Act2/y.md", "y"],
    ]);
    const view = new VaultView({ rootName: "V", files });
    expect(markdownFiles(view, "G")).toEqual(["G/Act2/y.md", "G/Act/x.md", "G/G.md"]);
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
