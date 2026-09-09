import { describe, it, expect } from "vitest";
import {
  nodeBox,
  childRegionPath,
  edgeOpacity,
  fitTransform,
  inspectorLine,
  radialCaption,
  NODE_HEIGHT,
  HUB_HEIGHT,
  DOT_RADIUS,
  HUB_DOT_RADIUS,
  type Caption,
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

describe("edgeOpacity", () => {
  it("draws the trunk stronger than the twigs", () => {
    expect(edgeOpacity(0)).toBeGreaterThan(edgeOpacity(2));
  });

  it("stops attenuating past the fourth level so deep edges stay visible", () => {
    expect(edgeOpacity(4)).toBe(edgeOpacity(9));
    expect(edgeOpacity(9)).toBeGreaterThan(0.4);
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

describe("radialCaption", () => {
  /** A name far too long for any sensible cap, with spaces the trim has to notice. */
  const LONG = "A ferry crossing that never arrives at the far bank";
  /** The same overrun without spaces, so a truncation's slack is one character, never more. */
  const RUN = "x".repeat(120);
  /** One character's advance in the stand-in face — the slack any per-character trim leaves. */
  const STEP = measure("x");
  /** Whatever character a box truncates with; a caption has to use the same one. */
  const ELLIPSIS = nodeBox(LONG, measure).label.slice(-1);

  /**
   * A caption's own arithmetic has to close: `width` is the number a caller
   * reserves screen space with, so it must be exactly the parts that get drawn.
   */
  const expectAddsUp = (caption: Caption): void => {
    if (caption.suffix === null) {
      expect(caption.suffixX).toBeNull();
      expect(caption.width).toBe(measure(caption.label));
    } else {
      expect(caption.suffixX).not.toBeNull();
      // The count sits after the stem, never on top of it.
      expect(caption.suffixX!).toBeGreaterThan(measure(caption.label));
      expect(caption.width).toBe(caption.suffixX! + measure(caption.suffix));
    }
  };

  it("draws a name that fits as bare text — no padding either side", () => {
    const caption = radialCaption("Doors", measure);
    expect(caption.label).toBe("Doors");
    expect(caption.width).toBe(measure("Doors"));
    expect(caption.suffix).toBeNull();
    expect(caption.suffixX).toBeNull();
  });

  it("gives a one-letter note no floor to sit on, unlike a box", () => {
    const caption = radialCaption("A", measure);
    expect(caption.width).toBe(measure("A"));
    expect(caption.width).toBeLessThan(nodeBox("A", measure).width);
  });

  it("is text and nothing else — no height, no inset, no divider", () => {
    expect(Object.keys(radialCaption("Doors", measure, { suffix: "+4" })).sort()).toEqual([
      "label",
      "suffix",
      "suffixX",
      "width",
    ]);
  });

  it("takes no options at all, and reads every empty count as no count", () => {
    const bare = radialCaption("Doors", measure);
    expect(radialCaption("Doors", measure, {})).toEqual(bare);
    expect(radialCaption("Doors", measure, { suffix: undefined })).toEqual(bare);
    expect(radialCaption("Doors", measure, { suffix: null })).toEqual(bare);
    expect(radialCaption("Doors", measure, { suffix: "" })).toEqual(bare);
  });

  it("holds an over-long name tighter than the same name in a box", () => {
    const caption = radialCaption(LONG, measure);
    expect(caption.width).toBeLessThan(nodeBox(LONG, measure).width);
    expect([...caption.label].length).toBeLessThan([...LONG].length);
  });

  it("reports the width it will actually draw, not the cap it clipped against", () => {
    const caption = radialCaption(LONG, measure);
    expect(caption.width).toBe(measure(caption.label));
  });

  it("truncates with the same character a box uses", () => {
    expect(radialCaption(LONG, measure).label.slice(-1)).toBe(ELLIPSIS);
  });

  it("keeps the start of the name, so a clipped caption still names the note", () => {
    const caption = radialCaption(LONG, measure);
    expect(LONG.startsWith(caption.label.slice(0, -1))).toBe(true);
  });

  it("never leaves a dangling space before the ellipsis, wherever the cut lands", () => {
    const spacey = "ab ".repeat(70);
    for (let take = 1; take <= spacey.length; take++) {
      expect(radialCaption(spacey.slice(0, take), measure).label).not.toMatch(/\s…$/);
    }
  });

  it("counts astral characters as one, so an emoji stem is not cut mid-pair", () => {
    const caption = radialCaption("🚢".repeat(80), measure);
    expect([...caption.label].every((ch) => ch === "🚢" || ch === ELLIPSIS)).toBe(true);
    // No lone surrogate survived the slice.
    expect([...caption.label].some((ch) => {
      const code = ch.codePointAt(0)!;
      return code >= 0xd800 && code <= 0xdfff;
    })).toBe(false);
  });

  it("sets the count after the stem, a constant gap away", () => {
    const short = radialCaption("Doors", measure, { suffix: "+4" });
    const gap = short.suffixX! - measure(short.label);
    expect(gap).toBeGreaterThan(0);
    expect(short.suffix).toBe("+4");

    const other = radialCaption("References", measure, { suffix: "+12" });
    expect(other.suffixX! - measure(other.label)).toBe(gap);
  });

  it("leaves a short stem whole when it carries a count", () => {
    expect(radialCaption("Doors", measure, { suffix: "+4" }).label).toBe("Doors");
  });

  it("adds up, in every shape a caption comes in", () => {
    for (const caption of [
      radialCaption("", measure),
      radialCaption("A", measure),
      radialCaption("Doors", measure),
      radialCaption("Doors", measure, { suffix: "+4" }),
      radialCaption(LONG, measure),
      radialCaption(LONG, measure, { suffix: "+12" }),
      radialCaption(RUN, measure, { suffix: "+123" }),
      radialCaption("🚢".repeat(80), measure, { suffix: "+9" }),
    ]) {
      expectAddsUp(caption);
    }
  });

  it("clips the stem to keep the count, since a name loses less than a number", () => {
    const withCount = radialCaption(LONG, measure, { suffix: "+12" });
    expect(withCount.suffix).toBe("+12");
    expect([...withCount.label].length).toBeLessThan([...radialCaption(LONG, measure).label].length);
  });

  it("takes the count's room out of the stem instead of adding it on top", () => {
    const bare = radialCaption(RUN, measure);
    const withCount = radialCaption(RUN, measure, { suffix: "+12" });
    // Both clip against one total cap, and a per-character trim can undershoot
    // it by at most a character — so the count can never widen the caption.
    expect(withCount.width).toBeLessThanOrEqual(bare.width + STEP);
  });

  it("never drops the count, even one too wide to be sensible", () => {
    const absurd = "+999999999999999999999999";
    const caption = radialCaption(LONG, measure, { suffix: absurd });
    expect(caption.suffix).toBe(absurd);
    expect(caption.suffixX).not.toBeNull();
    expectAddsUp(caption);
  });

  it("stops growing however long the name gets", () => {
    const widths: number[] = [];
    for (let take = 0; take <= 120; take++) widths.push(radialCaption(RUN.slice(0, take), measure).width);
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);

    const plateau = radialCaption("x".repeat(200), measure).width;
    expect(radialCaption("x".repeat(400), measure).width).toBe(plateau);
    expect(plateau).toBeLessThan(measure("x".repeat(200)));
  });

  describe("the dots beside the captions", () => {
    it("draws the hub larger than a note", () => {
      expect(HUB_DOT_RADIUS).toBeGreaterThan(DOT_RADIUS);
    });

    it("gives both a radius you can actually see", () => {
      expect(DOT_RADIUS).toBeGreaterThan(0);
      expect(Number.isFinite(HUB_DOT_RADIUS)).toBe(true);
    });
  });
});
