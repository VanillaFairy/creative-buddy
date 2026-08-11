import { Note } from "./notes";
import { Problem, baseName, dirName } from "./types";
import { casefold, pyRepr } from "./py-compat";

/** Path equality with the filesystem's own case rules (the oracle runs on NTFS). */
export function samePath(a: string, b: string): boolean {
  return casefold(a) === casefold(b);
}

export interface ResolveResult {
  edges: Map<Note, Note>;
  problems: Problem[];
}

/** Match each note's parent: to a note in the same graph, by stem, case-insensitively. */
export function resolveParents(notes: Note[], hub: string): ResolveResult {
  const byName = new Map<string, Note>();
  for (const note of notes) byName.set(casefold(note.stem), note); // last wins, like the dict comprehension

  const edges = new Map<Note, Note>();
  const problems: Problem[] = [];

  for (const note of notes) {
    if (note.parent === null) {
      if (!samePath(note.path, hub)) {
        problems.push({
          kind: "orphan-root",
          note: baseName(note.path),
          detail: "no parent: value, and this note is not the hub",
        });
      }
      continue;
    }
    const target = byName.get(casefold(note.parent));
    if (target === undefined) {
      problems.push({
        kind: "unresolved-parent",
        note: baseName(note.path),
        detail: `parent ${pyRepr(note.parent)} names no note in this graph`,
      });
    } else {
      edges.set(note, target);
    }
  }

  return { edges, problems };
}

export function byNameMap(notes: Note[]): Map<string, Note> {
  const map = new Map<string, Note>();
  for (const note of notes) map.set(casefold(note.stem), note);
  return map;
}
