import { describe, it, expect } from "vitest";
import { GraphModel } from "../src/graph/graph-model";
import { buildMindmapData } from "../src/mindmap/layout";

const TODAY = { y: 2026, m: 8, d: 12 };

function crossLinksOf(files: Record<string, string>): string[] {
  const model = new GraphModel("vault");
  for (const [path, body] of Object.entries(files)) model.setFile(path, body);
  return buildMindmapData(model, "G", TODAY, new Set())
    .crossLinks.map((c) => `${c.from} -> ${c.to}`)
    .sort();
}

const HUB = "# G\n\n## Charter\n\nA graph.\n";
const child = (body: string): string => `---\nparent: G\n---\n\n${body}\n`;

describe("mindmap cross-links", () => {
  it("draws one arc when a note links the same target twice", () => {
    expect(
      crossLinksOf({
        "G/G.md": HUB,
        "G/A.md": child("Talks about [[B]] and later [[B]] again."),
        "G/B.md": child("Nothing."),
      }),
    ).toEqual(["G/A.md -> G/B.md"]);
  });

  it("draws one arc when the same target is reached by name and by alias", () => {
    expect(
      crossLinksOf({
        "G/G.md": HUB,
        "G/A.md": child("See [[B]], also known as [[Bee]]."),
        "G/B.md": `---\nparent: G\naliases: [Bee]\n---\n\nNothing.\n`,
      }),
    ).toEqual(["G/A.md -> G/B.md"]);
  });

  it("draws one arc for a pair that links both ways", () => {
    expect(
      crossLinksOf({
        "G/G.md": HUB,
        "G/A.md": child("Points at [[B]]."),
        "G/B.md": child("Points back at [[A]]."),
      }),
    ).toEqual(["G/A.md -> G/B.md"]);
  });

  it("still draws both arcs when three notes form a chain", () => {
    expect(
      crossLinksOf({
        "G/G.md": HUB,
        "G/A.md": child("Points at [[B]]."),
        "G/B.md": child("Points at [[C]]."),
        "G/C.md": child("Nothing."),
      }),
    ).toEqual(["G/A.md -> G/B.md", "G/B.md -> G/C.md"]);
  });
});
