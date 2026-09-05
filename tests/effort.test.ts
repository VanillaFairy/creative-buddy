import { describe, it, expect } from "vitest";
import { coerce, DEFAULT_EFFORT, EFFORT_LABELS, EffortLevel, LEVELS, levelsFor } from "../src/agent/effort";

describe("levelsFor", () => {
  it("gives every level to the models that honour every level", () => {
    for (const model of ["claude-fable-5-1", "claude-opus-5", "claude-sonnet-5"]) {
      expect(levelsFor(model)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    }
  });

  it("gives Haiku nothing, because Haiku has no effort control", () => {
    expect(levelsFor("claude-haiku-4-5")).toEqual([]);
  });

  it("gives an unrecognised model nothing rather than guessing", () => {
    // A retired id restored out of workspace.json lands here. Sending an effort
    // the CLI rejects would fail the whole session, so this fails closed.
    expect(levelsFor("claude-opus-3")).toEqual([]);
    expect(levelsFor("")).toEqual([]);
  });

  it("orders levels cheapest first, so the picker reads as a dial", () => {
    expect(levelsFor("claude-opus-5")).toEqual(LEVELS);
  });
});

describe("coerce", () => {
  it("keeps a level the model honours", () => {
    expect(coerce("claude-opus-5", "max")).toBe("max");
    expect(coerce("claude-sonnet-5", "low")).toBe("low");
  });

  it("is null for a model with no effort at all, whatever was stored", () => {
    expect(coerce("claude-haiku-4-5", "max")).toBeNull();
    expect(coerce("claude-haiku-4-5", DEFAULT_EFFORT)).toBeNull();
  });

  it("falls back to the default when what was stored is not a level", () => {
    // workspace.json is a file on disk; a hand-edit or an older plugin version
    // can put anything in it, and the value goes straight to the CLI.
    expect(coerce("claude-opus-5", "banana")).toBe(DEFAULT_EFFORT);
    expect(coerce("claude-opus-5", undefined)).toBe(DEFAULT_EFFORT);
    expect(coerce("claude-opus-5", null)).toBe(DEFAULT_EFFORT);
    expect(coerce("claude-opus-5", 3)).toBe(DEFAULT_EFFORT);
  });

  it("defaults to what the CLI would have done unasked", () => {
    expect(DEFAULT_EFFORT).toBe("high");
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
