import { describe, it, expect } from "vitest";
import { graphOfNote } from "../src/graph/ownership";

describe("graphOfNote", () => {
  it("finds the graph a note sits directly inside", () => {
    expect(graphOfNote(["Noir game"], "Noir game/Heavy Rain.md")).toBe("Noir game");
  });

  it("finds it from any depth below", () => {
    expect(graphOfNote(["Noir game"], "Noir game/References/Detail/Observer.md")).toBe("Noir game");
  });

  it("resolves the hub note itself to its own graph", () => {
    expect(graphOfNote(["Noir game"], "Noir game/Noir game.md")).toBe("Noir game");
  });

  it("is null for a note in no graph", () => {
    expect(graphOfNote(["Noir game"], "Inbox/Scratch.md")).toBeNull();
  });

  it("is null when the vault holds no graphs at all", () => {
    expect(graphOfNote([], "Noir game/Heavy Rain.md")).toBeNull();
  });

  /**
   * The whole point of matching against the graph list rather than walking the
   * folder tree: findGraphs stops descending on a hit, so a charter folder
   * nested inside a graph is never listed and must resolve to the outer graph.
   * An upward walk would return "Noir game/Side quest" — a graphDir no other
   * part of the plugin knows about.
   */
  it("resolves to the outermost graph when a charter folder is nested inside one", () => {
    expect(graphOfNote(["Noir game"], "Noir game/Side quest/Lead.md")).toBe("Noir game");
  });

  it("prefers the nearest graph when the list really does hold both", () => {
    expect(graphOfNote(["Noir game", "Noir game/Side quest"], "Noir game/Side quest/Lead.md")).toBe("Noir game/Side quest");
  });

  it("matches only on a folder boundary, never a name prefix", () => {
    expect(graphOfNote(["Noir"], "Noir game/Heavy Rain.md")).toBeNull();
  });

  it("a graph at the vault root owns every note", () => {
    expect(graphOfNote([""], "Anywhere/At/All.md")).toBe("");
    expect(graphOfNote([""], "Top.md")).toBe("");
  });

  it("does not let the vault-root graph outrank a folder graph", () => {
    expect(graphOfNote(["", "Noir game"], "Noir game/Heavy Rain.md")).toBe("Noir game");
  });

  it("ignores a graph dir that only looks like an ancestor", () => {
    expect(graphOfNote(["Noir game/References"], "Noir game/Heavy Rain.md")).toBeNull();
  });
});
