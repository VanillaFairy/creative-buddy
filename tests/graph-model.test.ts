import { describe, it, expect } from "vitest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { GraphModel } from "../src/graph/graph-model";
import { VaultView } from "../src/graph/types";
import { buildValidationReport } from "../src/graph/validation";

const TODAY = { y: 2026, m: 8, d: 11 };

function modelFrom(name: string): GraphModel {
  const vault = loadFixtureVault(name);
  return new GraphModel(vault.rootName, vault.files);
}

describe("GraphModel", () => {
  it("mirrors a fresh full computation after setFile", () => {
    const model = modelFrom("simple");
    model.setFile("Noir game/New Node.md", '---\nparent: "[[References]]"\n---\n\nFresh.\n');
    const fresh = new VaultView({ rootName: "simple", files: model.snapshotFiles() });
    expect(model.validation()).toEqual(buildValidationReport(fresh));
    expect(model.validation().ok).toBe(true);
  });

  it("deleteFile surfaces the resulting unresolved parent", () => {
    const model = modelFrom("simple");
    model.deleteFile("Noir game/References/References.md");
    const problems = model.validation().graphs[0]!.problems;
    expect(problems.some((p) => p.kind === "unresolved-parent" && p.note === "Heavy Rain.md")).toBe(true);
  });

  it("renameFile keeps content and updates identity", () => {
    const model = modelFrom("simple");
    model.renameFile("Noir game/References/Observer.md", "Noir game/References/Observed.md");
    expect(model.validation().graphs[0]!.problems).toEqual([]); // parent: References still resolves
    expect(model.notes("Noir game").some((n) => n.stem === "Observed")).toBe(true);
  });

  it("caches between mutations and invalidates on change", () => {
    const model = modelFrom("simple");
    const first = model.validation();
    expect(model.validation()).toBe(first); // same object → cached
    model.setFile("Noir game/Another.md", "no frontmatter");
    expect(model.validation()).not.toBe(first);
    expect(model.validation().ok).toBe(false); // orphan-root now
  });

  it("contentOf hands back a note's raw text for the body-level facts views derive", () => {
    const model = modelFrom("simple");
    expect(model.contentOf("Noir game/Heavy Rain.md")).toContain("send Farah the pacing doc");
  });

  it("contentOf matches case the way every other vault lookup does", () => {
    const model = modelFrom("simple");
    expect(model.contentOf("noir game/heavy rain.md")).toContain("send Farah the pacing doc");
  });

  it("contentOf is empty for a path the vault does not hold", () => {
    const model = modelFrom("simple");
    expect(model.contentOf("Noir game/Nowhere.md")).toBe("");
  });

  it("notifies listeners once per mutation and honours unsubscribe", () => {
    const model = modelFrom("simple");
    let calls = 0;
    const off = model.onChange(() => calls++);
    model.setFile("Noir game/X.md", "x");
    model.deleteFile("Noir game/X.md");
    off();
    model.setFile("Noir game/Y.md", "y");
    expect(calls).toBe(2);
  });

  it("a listener that subscribes another mid-notification excludes the new one from that same mutation", () => {
    const model = modelFrom("simple");
    let lateCalls = 0;
    let subscribed = false;
    model.onChange(() => {
      if (!subscribed) {
        subscribed = true;
        model.onChange(() => lateCalls++);
      }
    });
    model.setFile("Noir game/X.md", "x"); // late listener subscribes here — must NOT fire for this mutation
    expect(lateCalls).toBe(0);
    model.setFile("Noir game/Y.md", "y"); // but must fire for the next one
    expect(lateCalls).toBe(1);
  });

  it("exposes rootName and hubPathOf for the views", () => {
    const model = modelFrom("simple");
    expect(model.rootName).toBe("simple");
    expect(model.hubPathOf("Noir game")).toBe("Noir game/Noir game.md");
    const rooty = modelFrom("rooty");
    expect(rooty.hubPathOf("")).toBe("rooty.md");
  });

  it("stats of a nonexistent graph dir is null (no hub file to count against)", () => {
    const model = modelFrom("simple");
    expect(model.stats("Nonexistent")).toBeNull();
  });
});
