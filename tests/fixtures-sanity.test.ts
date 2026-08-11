import { describe, it, expect } from "vitest";
import { loadFixtureVault, loadExpected } from "./helpers/load-fixture";

const FIXTURES = ["simple", "problems", "edge-cases", "rooty", "multi"] as const;

describe("fixture integrity", () => {
  it.each(FIXTURES)("%s loads and has expected JSON", (name) => {
    const vault = loadFixtureVault(name);
    expect(vault.files.size).toBeGreaterThan(0);
    expect(loadExpected(name, "graph-check")).toHaveProperty("graphs");
    expect(loadExpected(name, "obligations")).toHaveProperty("counts");
  });

  it("the BOM fixture really starts with a BOM", () => {
    const vault = loadFixtureVault("edge-cases");
    const bom = vault.files.get("Edge/Bom.md");
    expect(bom).toBeDefined();
    expect(bom!.charCodeAt(0)).toBe(0xfeff);
  });

  it("fixtures use LF endings", () => {
    const vault = loadFixtureVault("simple");
    for (const [, content] of vault.files) expect(content).not.toContain("\r");
  });
});
