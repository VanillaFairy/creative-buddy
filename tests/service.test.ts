import { describe, it, expect } from "vitest";
import { isService, serviceBox } from "../src/mindmap/service";
import { radialCaption, CAPTION_HEIGHT, DOT_RADIUS } from "../src/mindmap/geometry";
import { CAPTION_GAP } from "../src/mindmap/radial";
import type { Measure } from "../src/mindmap/geometry";

describe("isService", () => {
  it("is the one kind the plugin reads", () => {
    expect(isService("service")).toBe(true);
  });

  it("does not care how it was capitalised", () => {
    expect(isService("Service")).toBe(true);
    expect(isService("SERVICE")).toBe(true);
    expect(isService("sErViCe")).toBe(true);
  });

  it("is the whole kind or nothing", () => {
    // A charter is free to define any of these; none of them is the reserved
    // word, and a note filed under one keeps its box.
    for (const kind of ["services", "service note", "webservice", "self-service", "svc"]) {
      expect(isService(kind), kind).toBe(false);
    }
  });

  it("an unfiled note is not a service node", () => {
    expect(isService(null)).toBe(false);
  });
});

describe("serviceBox", () => {
  /** A measurer with no font behind it, so every width here is arithmetic. */
  const measure: Measure = (text) => text.length * 7;

  it("is a dot with the name beside it, where a box would have been", () => {
    const caption = radialCaption("Images", measure);
    const box = serviceBox("Images", measure);
    expect(box.label).toBe(caption.label);
    expect(box.labelX).toBe(DOT_RADIUS * 2 + CAPTION_GAP);
    expect(box.width).toBe(box.labelX + caption.width);
  });

  it("leaves room for the dot and for the line of text", () => {
    const box = serviceBox("Images", measure);
    expect(box.height).toBeGreaterThanOrEqual(DOT_RADIUS * 2);
    expect(box.height).toBeGreaterThanOrEqual(CAPTION_HEIGHT);
  });

  it("says what a fold hides after the name, never behind a divider", () => {
    // A divider splits a box into the note's own area and its child-ref area.
    // There is no box here to split, so a service node borrows the radial
    // convention: the count simply follows the name.
    const caption = radialCaption("Images", measure, { suffix: "+3" });
    const box = serviceBox("Images", measure, { suffix: "+3" });
    expect(box.suffix).toBe("+3");
    expect(box.dividerX).toBeNull();
    expect(box.suffixX).toBe(box.labelX + caption.suffixX!);
  });

  it("ellipsises a long name exactly as a caption does", () => {
    const long = "Images of the long since demolished east wing".repeat(4);
    expect(serviceBox(long, measure).label).toBe(radialCaption(long, measure).label);
  });
});
