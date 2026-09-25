import { describe, it, expect } from "vitest";
import { asFamily, FAMILY_NAMES, modelLabels } from "../src/agent/models";

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

describe("modelLabels", () => {
  it("names each family after the version the CLI resolves it to", () => {
    // The shape claude.exe 2.1.282 returns from supportedModels().
    const labels = modelLabels([
      { value: "default", resolvedModel: "claude-opus-5-5[1m]" },
      { value: "opus[1m]", resolvedModel: "claude-opus-5-5[1m]" },
      { value: "claude-fable-5-1[1m]", resolvedModel: "claude-fable-5-1" },
      { value: "sonnet", resolvedModel: "claude-sonnet-5" },
      { value: "haiku", resolvedModel: "claude-haiku-4-5-20251001" },
    ]);
    expect(labels).toEqual({ fable: "Fable 5.1", opus: "Opus 5.5", sonnet: "Sonnet 5", haiku: "Haiku 4.5" });
  });

  it("offers every family in the same order whatever the CLI lists", () => {
    const labels = modelLabels([{ value: "haiku", resolvedModel: "claude-haiku-4-5" }]);
    expect(Object.keys(labels)).toEqual(Object.keys(FAMILY_NAMES));
  });

  it("falls back to the bare family name for one the CLI did not list", () => {
    // A failed or partial listing still leaves a working picker.
    const labels = modelLabels([{ value: "sonnet", resolvedModel: "claude-sonnet-5" }]);
    expect(labels["opus"]).toBe(FAMILY_NAMES["opus"]);
    expect(modelLabels([])).toEqual(FAMILY_NAMES);
  });

  it("reads the value when a row carries no resolved model", () => {
    expect(modelLabels([{ value: "claude-opus-5" }])["opus"]).toBe("Opus 5");
  });

  it("ignores rows it cannot read a version from", () => {
    const labels = modelLabels([
      { value: "opus", resolvedModel: "opus" },
      { value: "claude-mythos-5-1" },
      { value: "claude-opus-5-5" },
    ]);
    expect(labels["opus"]).toBe("Opus 5.5");
  });
});
