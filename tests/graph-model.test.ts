import { describe, it, expect } from "vitest";
import { loadFixtureVault } from "./helpers/load-fixture";
import { GraphModel } from "../src/graph/graph-model";
import { VaultView } from "../src/graph/types";
import { hierarchyOf } from "../src/graph/hierarchy";
import { collectNoteFiles } from "../src/graph/discovery";

const TODAY = { y: 2026, m: 8, d: 11 };

function modelFrom(name: string): GraphModel {
  const vault = loadFixtureVault(name);
  return new GraphModel(vault.rootName, vault.files);
}

/** What a note hangs off, asked of the model's own view of the graph. */
function parentIn(model: GraphModel, graphDir: string, note: string): string | undefined {
  const view = new VaultView({ rootName: model.rootName, files: model.snapshotFiles() });
  const paths = collectNoteFiles(view, graphDir);
  return hierarchyOf(paths, graphDir, model.hubPathOf(graphDir)).parentOf.get(note);
}

function statsFrom(view: VaultView, graphDir: string) {
  const paths = collectNoteFiles(view, graphDir);
  const hub = paths.find((p) => p.endsWith(`${graphDir}.md`))!;
  const { childrenOf } = hierarchyOf(paths, graphDir, hub);
  return { nodes: paths.length - 1, hubChildren: (childrenOf.get(hub) ?? []).length };
}

describe("GraphModel", () => {
  it("mirrors a fresh full computation after setFile", () => {
    const model = modelFrom("simple");
    model.setFile("Noir game/References/New Node.md", "Fresh.\n");
    const fresh = new VaultView({ rootName: "simple", files: model.snapshotFiles() });
    expect(model.stats("Noir game")).toEqual(
      statsFrom(fresh, "Noir game"),
    );
    expect(model.notes("Noir game").some((n) => n.stem === "New Node")).toBe(true);
  });

  it("hands a folder's notes upward when the note that spoke for it goes", () => {
    // The folder is the hierarchy, so losing `References.md` does not strand
    // `Observer` — it passes up to the nearest folder that still speaks, which
    // is the graph's own, and that is the hub.
    const model = modelFrom("simple");
    expect(parentIn(model, "Noir game", "Noir game/References/Observer.md"))
      .toBe("Noir game/References/References.md");
    model.deleteFile("Noir game/References/References.md");
    expect(parentIn(model, "Noir game", "Noir game/References/Observer.md"))
      .toBe("Noir game/Noir game.md");
  });

  it("renameFile keeps content and updates identity", () => {
    const model = modelFrom("simple");
    model.renameFile("Noir game/References/Observer.md", "Noir game/References/Observed.md");
    expect(model.notes("Noir game").some((n) => n.stem === "Observed")).toBe(true);
    expect(parentIn(model, "Noir game", "Noir game/References/Observed.md"))
      .toBe("Noir game/References/References.md");
  });

  it("caches between mutations and invalidates on change", () => {
    const model = modelFrom("simple");
    const first = model.graphs();
    expect(model.graphs()).toBe(first); // same object → cached
    model.setFile("Noir game/Another.md", "anything at all");
    expect(model.graphs()).not.toBe(first);
    expect(model.stats("Noir game")!.nodes).toBe(first.length === 0 ? 0 : 5);
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
