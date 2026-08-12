import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The mechanical half of the open/closed questions convention.
 *
 * Deciding whether a question has been answered — and writing the answer — takes
 * someone who has read the code, so no check can do that part. What a check can
 * do is catch the way the convention actually gets broken: an answer recorded in
 * place, with the question struck through, instead of moved down and written out.
 * That is the whole job here.
 */

const DOCS = path.join(__dirname, "..", "docs");

function markdownFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (at: string): void => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) found.push(full);
    }
  };
  walk(dir);
  return found;
}

/**
 * One `## ` section's body, or null when the document has no such heading.
 * Deliberately naive about fenced code — a `## ` inside a fence would end the
 * section early, which no questions section has any reason to contain.
 */
function section(markdown: string, title: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

const FILES = markdownFiles(DOCS);
const relative = (file: string): string => path.relative(DOCS, file).split(path.sep).join("/");

describe("questions sections", () => {
  it("there is a questions section somewhere to check", () => {
    // Guards the guard: a rename upstream would otherwise make both rules below
    // pass by having nothing to say.
    const withQuestions = FILES.filter((file) => section(fs.readFileSync(file, "utf8"), "Open questions") !== null);
    expect(withQuestions.map(relative)).not.toEqual([]);
  });

  it("an answered question moves to Closed questions rather than being struck through", () => {
    const offenders = FILES.filter((file) => {
      const open = section(fs.readFileSync(file, "utf8"), "Open questions");
      // ~~like this~~. A tilde fence (~~~) has nothing between the pairs, so it
      // cannot match and the plan's fenced examples stay legal.
      return open !== null && /~~[^~\n]+~~/.test(open);
    });
    expect(offenders.map(relative)).toEqual([]);
  });

  it("every closed question is followed by its answer", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const closed = section(fs.readFileSync(file, "utf8"), "Closed questions");
      if (closed === null) continue;
      const marks = [...closed.matchAll(/^\*\*([QA])\.\*\*/gm)].map((match) => match[1]).join("");
      // Q then A, all the way down. Also rejects an empty Closed section, which
      // is a heading nobody has filled in rather than a convention being kept.
      if (!/^(QA)+$/.test(marks)) offenders.push(`${relative(file)} → ${marks === "" ? "(nothing)" : marks}`);
    }
    expect(offenders).toEqual([]);
  });
});
