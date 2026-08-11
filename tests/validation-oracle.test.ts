import { describe, it, expect } from "vitest";
import { loadFixtureVault, loadExpected } from "./helpers/load-fixture";
import { VaultView } from "../src/graph/types";
import { buildValidationReport, graphStats } from "../src/graph/validation";

const FIXTURES = ["simple", "problems", "edge-cases", "rooty", "multi"] as const;

describe("buildValidationReport vs oracle", () => {
  it.each(FIXTURES)("%s matches graph_check.py exactly", (name) => {
    const view = new VaultView(loadFixtureVault(name));
    expect(buildValidationReport(view)).toEqual(loadExpected(name, "graph-check"));
  });
});

describe("graphStats", () => {
  it("counts nodes and direct hub children like --tree", () => {
    const view = new VaultView(loadFixtureVault("simple"));
    expect(graphStats(view, "Noir game")).toEqual({ nodes: 4, hubChildren: 2 });
    // 5 md notes − hub = 4; References + Мысли hang off the hub.
  });
  it("flags the flat hub shape in problems/", () => {
    const view = new VaultView(loadFixtureVault("problems"));
    const stats = graphStats(view, "Tangle");
    expect(stats).not.toBeNull();
    expect(stats!.hubChildren).toBe(4); // Twin, Deep, Lost, Bad Date
  });
});
