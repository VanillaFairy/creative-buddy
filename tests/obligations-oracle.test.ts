import { describe, it, expect } from "vitest";
import { loadFixtureVault, loadExpected } from "./helpers/load-fixture";
import { VaultView } from "../src/graph/types";
import { buildObligationsReport } from "../src/graph/obligations";

const TODAY = { y: 2026, m: 8, d: 11 };
const FIXTURES = ["simple", "problems", "edge-cases", "rooty", "multi"] as const;

describe("buildObligationsReport vs oracle", () => {
  it.each(FIXTURES)("%s matches obligations.py exactly", (name) => {
    const view = new VaultView(loadFixtureVault(name));
    expect(buildObligationsReport(view, TODAY)).toEqual(loadExpected(name, "obligations"));
  });

  it("BOM'd notes still yield their tasks (utf-8-sig semantics)", () => {
    const view = new VaultView(loadFixtureVault("edge-cases"));
    const report = buildObligationsReport(view, TODAY);
    expect(report.owed.some((e) => e.note === "Edge/Bom.md")).toBe(true);
  });
});
