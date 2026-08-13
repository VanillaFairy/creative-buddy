import { describe, it, expect } from "vitest";
import { DIALOG_PRESETS, restorePresetsOpen, visiblePresets } from "../src/chat/presets";

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

describe("visiblePresets", () => {
  it("offers only the two standing presets when the note asks nothing", () => {
    expect(visiblePresets(0).map((p) => p.id)).toEqual(["ask-me", "summarize"]);
  });

  it("offers the note's questions as soon as it owes one", () => {
    expect(visiblePresets(1).map((p) => p.id)).toEqual(["ask-me", "summarize", "note-questions"]);
  });

  it("puts the note preset last, so the two standing ones never move under the cursor", () => {
    // The row grows and shrinks as you walk around the vault. Whatever is always
    // there has to stay where it was.
    expect(visiblePresets(7).at(-1)?.id).toBe("note-questions");
    expect(visiblePresets(7).slice(0, 2)).toEqual(visiblePresets(0));
  });

  it("gives the note preset a label, a tooltip and something to say", () => {
    // Label and tooltip are pinned, not merely checked for emptiness: the row
    // draws both, and a reworded button is a change to what the user reads.
    const preset = visiblePresets(1).at(-1)!;
    expect(preset.label).toBe("Current note questions");
    expect(preset.title).toBe("Work through this note's open questions, one at a time");
    expect(preset.prompt.trim()).not.toBe("");
  });

  it("issues the note preset its own id, so the row redraws when it appears", () => {
    expect(new Set(visiblePresets(3).map((p) => p.id)).size).toBe(3);
  });
});
