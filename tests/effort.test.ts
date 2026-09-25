import { describe, it, expect } from "vitest";
import { asFamily, asLevel, coerce, DEFAULT_EFFORT, EFFORT_LABELS, EffortLevel, LEVELS, levelsFor } from "../src/agent/effort";

describe("levelsFor", () => {
  it("gives every level to the families that honour every level", () => {
    for (const model of ["fable", "opus", "sonnet"]) {
      expect(levelsFor(model)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    }
  });

  it("gives Haiku nothing, because Haiku has no effort control", () => {
    expect(levelsFor("haiku")).toEqual([]);
  });

  it("gives an unrecognised model nothing rather than guessing", () => {
    // Sending an effort the CLI rejects would fail the whole session, so an
    // unknown name fails closed.
    expect(levelsFor("mythos")).toEqual([]);
    expect(levelsFor("")).toEqual([]);
  });

  it("orders levels cheapest first, so the picker reads as a dial", () => {
    expect(levelsFor("opus")).toEqual(LEVELS);
  });
});

describe("asFamily", () => {
  it("reads a pinned version back as its family", () => {
    expect(asFamily("claude-fable-5-1")).toBe("fable");
    expect(asFamily("claude-opus-5")).toBe("opus");
    expect(asFamily("claude-sonnet-5")).toBe("sonnet");
    expect(asFamily("claude-haiku-4-5")).toBe("haiku");
  });

  it("passes a family through", () => {
    expect(asFamily("opus")).toBe("opus");
  });

  it("leaves a model outside the offered families alone", () => {
    // Nothing to collapse it into; levelsFor already fails it closed.
    expect(asFamily("claude-mythos-5-1")).toBe("claude-mythos-5-1");
    expect(asFamily("")).toBe("");
  });
});

describe("coerce", () => {
  it("keeps a level the model honours", () => {
    expect(coerce("opus", "max")).toBe("max");
    expect(coerce("sonnet", "low")).toBe("low");
  });

  it("is null for a model with no effort at all, whatever was stored", () => {
    expect(coerce("haiku", "max")).toBeNull();
    expect(coerce("haiku", DEFAULT_EFFORT)).toBeNull();
  });

  it("falls back to the default when what was stored is not a level", () => {
    // workspace.json is a file on disk; a hand-edit or an older plugin version
    // can put anything in it, and the value goes straight to the CLI.
    expect(coerce("opus", "banana")).toBe(DEFAULT_EFFORT);
    expect(coerce("opus", undefined)).toBe(DEFAULT_EFFORT);
    expect(coerce("opus", null)).toBe(DEFAULT_EFFORT);
    expect(coerce("opus", 3)).toBe(DEFAULT_EFFORT);
  });

  it("defaults to what the CLI would have done unasked", () => {
    expect(DEFAULT_EFFORT).toBe("high");
  });
});

describe("asLevel", () => {
  it("passes a real level through", () => {
    expect(asLevel("xhigh")).toBe("xhigh");
  });

  it("says nothing about models — a preference outlives the model it was set on", () => {
    // The conversation may be sitting on Haiku right now; the level it keeps is
    // still the one to restore when it moves back to a model that has effort.
    expect(asLevel("max")).toBe("max");
  });

  it("falls back when the stored value is not a level", () => {
    expect(asLevel("banana")).toBe(DEFAULT_EFFORT);
    expect(asLevel(undefined)).toBe(DEFAULT_EFFORT);
    expect(asLevel(null, "low")).toBe("low");
  });
});

describe("EFFORT_LABELS", () => {
  it("names every level, so adding one cannot leave a blank option", () => {
    for (const level of LEVELS) {
      expect(EFFORT_LABELS[level as EffortLevel]).toBeTruthy();
    }
    expect(Object.keys(EFFORT_LABELS).sort()).toEqual([...LEVELS].sort());
  });
});
