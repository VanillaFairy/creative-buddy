import { describe, it, expect } from "vitest";
import { DENSITIES, densityFrom, spreadOf } from "../src/mindmap/density";

describe("density", () => {
  it("spreads the map further at every step from Near to Far", () => {
    const spreads = DENSITIES.map((step) => spreadOf(step.id));
    for (let i = 1; i < spreads.length; i++) expect(spreads[i]!).toBeGreaterThan(spreads[i - 1]!);
  });

  it("never draws notes nearer each other than the tight layout put them", () => {
    // Scaling the anchors of fixed-size captions by less than one is what lets
    // them run into each other; at one or more, every gap only widens.
    for (const step of DENSITIES) expect(spreadOf(step.id)).toBeGreaterThanOrEqual(1);
  });

  it("reads back every density it offers", () => {
    for (const step of DENSITIES) expect(densityFrom(step.id)).toBe(step.id);
  });

  it("opens a map saved without a density, or with one it no longer knows, at Medium", () => {
    expect(densityFrom(undefined)).toBe("mid");
    expect(densityFrom("sparse")).toBe("mid");
  });
});
