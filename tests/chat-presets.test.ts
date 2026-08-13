import { describe, it, expect } from "vitest";
import { DIALOG_PRESETS, restorePresetsOpen } from "../src/chat/presets";

describe("restorePresetsOpen", () => {
  it("opens a panel that has never been saved", () => {
    expect(restorePresetsOpen(undefined)).toBe(true);
    expect(restorePresetsOpen(null)).toBe(true);
  });

  it("opens a panel saved before the row existed", () => {
    expect(restorePresetsOpen({ sessions: [], active: 0 })).toBe(true);
  });

  it("keeps the row collapsed once it was collapsed", () => {
    expect(restorePresetsOpen({ presetsOpen: false })).toBe(false);
  });

  it("keeps the row open once it was open", () => {
    expect(restorePresetsOpen({ presetsOpen: true })).toBe(true);
  });

  it("opens rather than trusting a value that is not a boolean", () => {
    // A hand-edited workspace file, or state written by some future version.
    // Hiding the row on a value nobody meant is worse than showing it.
    expect(restorePresetsOpen({ presetsOpen: "false" })).toBe(true);
    expect(restorePresetsOpen({ presetsOpen: 0 })).toBe(true);
    expect(restorePresetsOpen("nonsense")).toBe(true);
  });
});

describe("DIALOG_PRESETS", () => {
  it("offers the two presets the composer draws", () => {
    expect(DIALOG_PRESETS.map((p) => p.id)).toEqual(["ask-me", "summarize"]);
  });

  it("gives every preset a label, a tooltip and something to say", () => {
    for (const preset of DIALOG_PRESETS) {
      expect(preset.label.trim()).not.toBe("");
      expect(preset.title.trim()).not.toBe("");
      expect(preset.prompt.trim()).not.toBe("");
    }
  });

  it("issues each preset its own id", () => {
    // They are React keys, and two rows under one key is a row that never updates.
    expect(new Set(DIALOG_PRESETS.map((p) => p.id)).size).toBe(DIALOG_PRESETS.length);
  });
});
