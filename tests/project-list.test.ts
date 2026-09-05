import { describe, it, expect } from "vitest";
import { GraphModel } from "../src/graph/graph-model";
import {
  bootstrapHint,
  folderOffer,
  noteCount,
  offerLabel,
  projectRowLabel,
  projectRows,
} from "../src/project-list";

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

describe("folderOffer", () => {
  const vault = {
    "Sea Fort/Sea Fort.md": hub("Sea Fort"),
    "Sea Fort/Soundings/Depths.md": note("Sea Fort"),
    "Harbour/Tide tables.md": note("Harbour"),
    "Clips/Sound design/Reel.md": note("Sound design"),
    "Stray.md": "Nothing here.\n",
  };

  it("offers a folder that no project owns", () => {
    expect(folderOffer(modelOf("MyVault", vault), "Harbour")).toEqual({
      dir: "Harbour",
      name: "Harbour",
      location: null,
      refusal: null,
    });
  });

  it("says where a nested folder sits, so two of a name can be told apart", () => {
    expect(folderOffer(modelOf("MyVault", vault), "Clips/Sound design")).toMatchObject({
      name: "Sound design",
      location: "Clips",
      refusal: null,
    });
  });

  /** findGraphs stops at the first project it finds, so this folder can never be one. */
  it("refuses a folder inside a project, and names the project holding it", () => {
    expect(folderOffer(modelOf("MyVault", vault), "Sea Fort/Soundings")).toMatchObject({
      name: "Soundings",
      refusal: "already part of Sea Fort",
    });
  });

  /** A charter on the root note makes it the only project findGraphs can reach. */
  it("refuses the vault root, because a project there would hide the rest", () => {
    expect(folderOffer(modelOf("MyVault", vault), "")).toMatchObject({
      dir: "",
      name: "MyVault",
      location: "the whole vault",
      refusal: "would hide every other project",
    });
  });

  it("offers nothing for a folder that is already a project — the list above holds it", () => {
    expect(folderOffer(modelOf("MyVault", vault), "Sea Fort")).toBeNull();
  });

  it("offers nothing when no note is open", () => {
    expect(folderOffer(modelOf("MyVault", vault), null)).toBeNull();
  });

  it("names a root project as the owner by the vault's name", () => {
    const model = modelOf("MyVault", {
      "MyVault.md": hub("MyVault"),
      "Harbour/Tide tables.md": note("MyVault"),
    });
    expect(folderOffer(model, "Harbour")!.refusal).toBe("already part of MyVault");
  });
});

describe("offerLabel", () => {
  it("names the folder in the row, as the button that acts on it", () => {
    const offer = { dir: "Harbour", name: "Harbour", location: null, refusal: null };
    expect(offerLabel(offer)).toBe("Create a project from current folder: Harbour");
  });
});
