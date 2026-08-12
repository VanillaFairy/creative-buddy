import { describe, it, expect } from "vitest";
import { GraphModel } from "../src/graph/graph-model";
import { bootstrapHint, noteCount, projectRowLabel, projectRows } from "../src/project-list";

/** A minimal hub: the folder's own note carrying the heading that makes it a graph. */
function hub(title: string): string {
  return `# ${title}\n\n## Charter\n\nWhatever this is about.\n`;
}

function note(parent: string, body = ""): string {
  return `---\nparent: "[[${parent}]]"\n---\n\n${body}\n`;
}

function modelOf(vaultName: string, files: Record<string, string>): GraphModel {
  return new GraphModel(vaultName, new Map(Object.entries(files)));
}

describe("projectRows", () => {
  it("names a top-level project after its folder and shows no location", () => {
    const model = modelOf("MyVault", { "Noir game/Noir game.md": hub("Noir game") });
    expect(projectRows(model)).toEqual([{ dir: "Noir game", name: "Noir game", location: null, notes: 0 }]);
  });

  it("shows the parent folder as the location of a nested project", () => {
    const model = modelOf("MyVault", { "Fiction/Drafts/Wolves/Wolves.md": hub("Wolves") });
    const [row] = projectRows(model);
    expect(row).toMatchObject({ dir: "Fiction/Drafts/Wolves", name: "Wolves", location: "Fiction/Drafts" });
  });

  it("calls a project at the vault root by the vault's name, and says how far it reaches", () => {
    const model = modelOf("MyVault", { "MyVault.md": hub("MyVault") });
    expect(projectRows(model)[0]).toMatchObject({ dir: "", name: "MyVault", location: "the whole vault" });
  });

  it("counts the notes besides the hub, matching what the map reports", () => {
    const model = modelOf("MyVault", {
      "Noir game/Noir game.md": hub("Noir game"),
      "Noir game/Heavy Rain.md": note("Noir game"),
      "Noir game/References/References.md": note("Noir game"),
      "Noir game/References/Observer.md": note("References"),
    });
    expect(projectRows(model)[0]!.notes).toBe(3);
    expect(projectRows(model)[0]!.notes).toBe(model.stats("Noir game")!.nodes);
  });

  it("excludes the Log folder from the count, as the graph core does", () => {
    const model = modelOf("MyVault", {
      "Noir game/Noir game.md": hub("Noir game"),
      "Noir game/Log/2026-08-01-a.md": "Wrapped up.\n",
    });
    expect(projectRows(model)[0]!.notes).toBe(0);
  });

  it("keeps the graph list's order, so the picker reads the same every time", () => {
    const model = modelOf("MyVault", {
      "Zebra/Zebra.md": hub("Zebra"),
      "Apple/Apple.md": hub("Apple"),
    });
    expect(projectRows(model).map((r) => r.dir)).toEqual(model.graphs());
  });

  it("is empty for a vault with no projects", () => {
    expect(projectRows(modelOf("MyVault", { "Stray.md": "Nothing here.\n" }))).toEqual([]);
  });
});

describe("noteCount", () => {
  it("keeps the singular singular", () => {
    expect(noteCount(1)).toBe("1 note");
  });

  it("pluralises everything else, nothing included", () => {
    expect(noteCount(0)).toBe("0 notes");
    expect(noteCount(24)).toBe("24 notes");
  });
});

describe("projectRowLabel", () => {
  it("reads out the location and the count the row shows", () => {
    const row = { dir: "Fiction/Wolves", name: "Wolves", location: "Fiction", notes: 24 };
    expect(projectRowLabel(row)).toBe("Wolves, Fiction — 24 notes");
  });

  it("says nothing about a location a project does not have", () => {
    const row = { dir: "Kitchen", name: "Kitchen", location: null, notes: 1 };
    expect(projectRowLabel(row)).toBe("Kitchen — 1 note");
  });
});

describe("bootstrapHint", () => {
  const rooted = { dir: "", name: "MyVault", location: "the whole vault", notes: 3 };
  const folder = { dir: "Kitchen", name: "Kitchen", location: null, notes: 3 };

  it("offers the interviewer's bootstrap when a project spans the whole vault", () => {
    expect(bootstrapHint([rooted, folder])).toContain("Pick the whole vault");
  });

  /** Pointing at a row that is not on the list is worse than not pointing. */
  it("explains the folder shape by hand when there is no vault-wide project to ask", () => {
    expect(bootstrapHint([folder])).toContain("## Charter");
    expect(bootstrapHint([folder])).not.toContain("Pick the whole vault");
  });

  it("still says something useful for a vault with no projects at all", () => {
    expect(bootstrapHint([])).toContain("## Charter");
  });
});
