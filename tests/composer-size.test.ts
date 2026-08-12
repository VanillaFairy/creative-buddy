import { describe, it, expect } from "vitest";
import { draggedHeight, heightBounds, pxLength } from "../src/chat/composer-size";

describe("pxLength", () => {
  it("reads a px length", () => {
    expect(pxLength("74.25px")).toBe(74.25);
  });

  it("reads a whole number of pixels", () => {
    expect(pxLength("240px")).toBe(240);
  });

  it("is null for the values a browser gives when there is no limit", () => {
    expect(pxLength("none")).toBeNull();
    expect(pxLength("auto")).toBeNull();
    expect(pxLength("")).toBeNull();
  });

  it("is null for a unit it was not asked about, rather than guessing", () => {
    // getComputedStyle resolves to px, so anything else means the assumption
    // behind this whole module has broken and a guess would hide it.
    expect(pxLength("40vh")).toBeNull();
    expect(pxLength("3lh")).toBeNull();
    expect(pxLength("50%")).toBeNull();
  });
});

describe("heightBounds", () => {
  it("takes both limits from the computed style", () => {
    expect(heightBounds("74.25px", "488.8px")).toEqual({ min: 74.25, max: 488.8 });
  });

  it("falls back to no floor and no ceiling when the style names none", () => {
    expect(heightBounds("auto", "none")).toEqual({ min: 0, max: Infinity });
  });
});

describe("draggedHeight", () => {
  const bounds = { min: 74, max: 480 };

  it("grows the box when the grip is pulled up", () => {
    expect(draggedHeight(100, -50, bounds)).toBe(150);
  });

  it("shrinks the box when the grip is pushed down", () => {
    expect(draggedHeight(200, 50, bounds)).toBe(150);
  });

  it("stays where it was when the pointer has not moved", () => {
    expect(draggedHeight(200, 0, bounds)).toBe(200);
  });

  it("stops at the floor however far down you push", () => {
    expect(draggedHeight(100, 9000, bounds)).toBe(74);
  });

  it("stops at the ceiling however far up you pull", () => {
    expect(draggedHeight(100, -9000, bounds)).toBe(480);
  });

  it("keeps the floor when the pane is too short to honour both limits", () => {
    // A box you cannot type into is worse than one that overflows.
    expect(draggedHeight(100, 9000, { min: 74, max: 20 })).toBe(74);
    expect(draggedHeight(100, -9000, { min: 74, max: 20 })).toBe(74);
  });

  it("is unbounded above when the style set no ceiling", () => {
    expect(draggedHeight(100, -400, { min: 0, max: Infinity })).toBe(500);
  });
});
