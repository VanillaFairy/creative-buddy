import { describe, it, expect } from "vitest";
import {
  nodeBox,
  childRegionPath,
  edgeWeight,
  fitTransform,
  inspectorLine,
  NODE_HEIGHT,
  HUB_HEIGHT,
} from "../src/mindmap/geometry";

/** A fixed-advance stand-in for the real face — 7px a character. */
const measure = (text: string): number => [...text].length * 7;

describe("nodeBox", () => {
  it("pads a normal node's measured label and keeps the fixed row height", () => {
    const box = nodeBox("Doors", measure);
    expect(box.label).toBe("Doors");
    expect(box.width).toBe(5 * 7 + 26);
    expect(box.height).toBe(NODE_HEIGHT);
    expect(box.labelX).toBe(13);
    expect(box.suffix).toBeNull();
    expect(box.suffixX).toBeNull();
  });

  it("floors a very short label so a one-letter note is still a target", () => {
    expect(nodeBox("A", measure).width).toBe(52);
  });

  it("gives the hub no padding — its width is its title, so the spine sits flush", () => {
    const box = nodeBox("Noir game", measure, { isHub: true });
    expect(box.width).toBe(9 * 7);
    expect(box.labelX).toBe(0);
    expect(box.height).toBe(HUB_HEIGHT);
  });

  it("ellipsises a label that would overrun and reports the clipped width", () => {
    const long = "A ferry crossing that never arrives at the far bank";
    const box = nodeBox(long, measure);
    expect(box.label.endsWith("…")).toBe(true);
    expect(box.label.length).toBeLessThan(long.length);
    expect(box.width).toBeLessThanOrEqual(240);
  });

  it("keeps a label that lands exactly on the cap intact", () => {
    const exact = "x".repeat((240 - 26) / 7);
    expect(nodeBox(exact, measure).label).toBe(exact);
  });

  it("does not leave a dangling space before the ellipsis", () => {
    const box = nodeBox("Cutting room floor conversations about the ferry", measure);
    expect(box.label).not.toMatch(/ …$/);
  });

  it("counts astral characters as one, so an emoji stem is not cut mid-pair", () => {
    const box = nodeBox("🚢".repeat(60), measure);
    expect([...box.label].every((ch) => ch === "🚢" || ch === "…")).toBe(true);
  });

  it("lays the folded-child count out in its own area, behind a divider", () => {
    const box = nodeBox("References", measure, { suffix: "+7" });
    expect(box.label).toBe("References");
    expect(box.suffix).toBe("+7");
    // label ends at 13 + 70; the rule sits one gap past it, the count one gap past the rule.
    expect(box.dividerX).toBe(13 + 10 * 7 + 8);
    expect(box.suffixX).toBe(13 + 10 * 7 + 8 + 8);
    expect(box.width).toBe(13 * 2 + 10 * 7 + 8 * 2 + 2 * 7);
  });

  it("gives the count equal breathing room either side of the rule", () => {
    const box = nodeBox("References", measure, { suffix: "+7" });
    const labelEnd = box.labelX + 10 * 7;
    expect(box.dividerX! - labelEnd).toBe(box.suffixX! - box.dividerX!);
  });

  it("has no divider when nothing is folded away", () => {
    expect(nodeBox("Doors", measure).dividerX).toBeNull();
  });

  it("treats an empty suffix as none rather than reserving a gap for it", () => {
    expect(nodeBox("Doors", measure, { suffix: "" })).toEqual(nodeBox("Doors", measure));
  });

  it("clips the label to keep the count, since a name loses less than a number", () => {
    const long = "A ferry crossing that never arrives at the far bank";
    const withCount = nodeBox(long, measure, { suffix: "+12" });
    expect(withCount.suffix).toBe("+12");
    expect(withCount.width).toBeLessThanOrEqual(240);
    expect([...withCount.label].length).toBeLessThan([...nodeBox(long, measure).label].length);
  });
});

describe("childRegionPath", () => {
  it("is nothing when the node hides nothing", () => {
    expect(childRegionPath(nodeBox("Doors", measure))).toBeNull();
  });

  it("starts at the divider and closes there, so it never covers the label", () => {
    const box = nodeBox("References", measure, { suffix: "+7" });
    const path = childRegionPath(box)!;
    expect(path.startsWith(`M ${box.dividerX},${-box.height / 2}`)).toBe(true);
    expect(path.trimEnd().endsWith("Z")).toBe(true);
  });

  it("rounds only the right corners, so it seats inside the box's own outline", () => {
    const box = nodeBox("References", measure, { suffix: "+7" });
    const path = childRegionPath(box)!;
    // Two arcs (the right corners) and no more.
    expect(path.match(/A /g)!.length).toBe(2);
    expect(path).toContain(`${box.width}`);
  });
});

describe("edgeWeight", () => {
  it("draws the trunk heavier than the twigs", () => {
    expect(edgeWeight(0).width).toBeGreaterThan(edgeWeight(2).width);
    expect(edgeWeight(0).opacity).toBeGreaterThan(edgeWeight(2).opacity);
  });

  it("stops attenuating past the fourth level so deep edges stay visible", () => {
    expect(edgeWeight(4)).toEqual(edgeWeight(9));
    expect(edgeWeight(9).width).toBeGreaterThan(0.5);
    expect(edgeWeight(9).opacity).toBeGreaterThan(0.4);
  });
});

describe("fitTransform", () => {
  const viewport = { width: 800, height: 600 };

  it("scales a graph that overruns the pane down until it fits inside the margin", () => {
    const t = fitTransform({ minX: 0, minY: 0, maxX: 2000, maxY: 1000 }, viewport);
    expect(t.k).toBeLessThan(1);
    expect(2000 * t.k).toBeLessThanOrEqual(800 - 64 + 0.001);
  });

  it("grows a small graph to use the pane, centred on both axes", () => {
    const t = fitTransform({ minX: 0, minY: 0, maxX: 400, maxY: 300 }, viewport);
    expect(t.k).toBeGreaterThan(1);
    expect(t.x).toBe((800 - 400 * t.k) / 2);
    expect(t.y).toBe((600 - 300 * t.k) / 2);
  });

  it("caps the growth, so a three-note graph does not read as a mockup", () => {
    expect(fitTransform({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, viewport).k).toBe(1.6);
  });

  it("offsets content that starts away from the origin", () => {
    const t = fitTransform({ minX: -400, minY: -100, maxX: -300, maxY: -50 }, viewport);
    expect(-400 * t.k + t.x).toBe((800 - 100 * t.k) / 2);
  });

  it("floors the scale rather than shrinking a huge graph to nothing", () => {
    expect(fitTransform({ minX: 0, minY: 0, maxX: 100000, maxY: 100000 }, viewport).k).toBe(0.25);
  });

  it("survives a pane that has not been laid out yet", () => {
    const t = fitTransform({ minX: 0, minY: 0, maxX: 500, maxY: 500 }, { width: 0, height: 0 });
    expect(Number.isFinite(t.k) && Number.isFinite(t.x) && Number.isFinite(t.y)).toBe(true);
  });
});

describe("inspectorLine", () => {
  const bare = { stem: "Doors", kind: null, status: null, problemKinds: [], collapsedChildren: 0 };

  it("says nothing when the name is all there is to say", () => {
    expect(inspectorLine(bare)).toBeNull();
  });

  it("reads the note's own vocabulary back, in frontmatter order", () => {
    expect(inspectorLine({ ...bare, kind: "statement", status: "open" })).toBe("Doors · statement · open");
  });

  it("counts what is folded away", () => {
    expect(inspectorLine({ ...bare, collapsedChildren: 7 })).toBe("Doors · 7 hidden");
  });

  it("puts problems last, where the eye lands after the facts", () => {
    expect(inspectorLine({ ...bare, kind: "statement", problemKinds: ["misfiled"] })).toBe("Doors · statement · misfiled");
  });

  it("ignores an empty frontmatter scalar rather than printing a stray separator", () => {
    expect(inspectorLine({ ...bare, kind: "", status: "open" })).toBe("Doors · open");
  });
});
