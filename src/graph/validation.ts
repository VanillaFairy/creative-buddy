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

/** Every parent ring, found exactly once (one parent per note → one walk finds it). */
export function findCycles(notes: Note[], edges: Map<Note, Note>): Note[][] {
  const UNSEEN = 0;
  const WALKING = 1;
  const SETTLED = 2;
  const state = new Map<Note, number>();
  for (const note of notes) state.set(note, UNSEEN);
  const cycles: Note[][] = [];

  for (const note of notes) {
    if (state.get(note) !== UNSEEN) continue;
    const trail: Note[] = [];
    const position = new Map<Note, number>();
    let current: Note | undefined = note;
    while (current !== undefined && state.get(current) === UNSEEN) {
      state.set(current, WALKING);
      position.set(current, trail.length);
      trail.push(current);
      current = edges.get(current);
    }
    if (current !== undefined && state.get(current) === WALKING) {
      cycles.push(trail.slice(position.get(current)!));
    }
    for (const walked of trail) state.set(walked, SETTLED);
  }

  return cycles;
}

/** One ring, named after its alphabetically first note so runs are stable. */
export function cycleProblem(ring: Note[]): Problem {
  let head = ring[0]!;
  for (const note of ring) {
    if (casefold(baseName(note.path)) < casefold(baseName(head.path))) head = note;
  }
  const start = ring.indexOf(head);
  const ordered = [...ring.slice(start), ...ring.slice(0, start)];
  const chain = [...ordered, head].map((n) => n.stem).join(" -> ");
  return {
    kind: "cycle",
    note: baseName(head.path),
    detail: `parent chain forms a cycle: ${chain}`,
  };
}
