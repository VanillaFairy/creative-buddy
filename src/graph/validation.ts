import { Note, noteFromFile } from "./notes";
import { Problem, VaultView, baseName, dirName } from "./types";
import { casefold, pyRepr } from "./py-compat";
import { collectNoteFiles, findGraphs, hubPath } from "./discovery";

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

function parentDirDisplay(path: string, rootName: string): string {
  const dir = dirName(path);
  return dir === "" ? rootName : baseName(dir);
}

/** Notes sharing a stem — one address with two answers. */
export function duplicateNames(notes: Note[], rootName: string): Problem[] {
  const seen = new Map<string, Note[]>();
  for (const note of notes) {
    const key = casefold(note.stem);
    const group = seen.get(key);
    if (group !== undefined) group.push(note);
    else seen.set(key, [note]);
  }
  const problems: Problem[] = [];
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    const rest = group
      .slice(1)
      .map((other) => `${parentDirDisplay(other.path, rootName)}/${baseName(other.path)}`)
      .join(", ");
    problems.push({
      kind: "duplicate-name",
      note: baseName(group[0]!.path),
      detail: `name is shared by ${rest}`,
    });
  }
  return problems;
}

/**
 * Notes sitting in a folder that is not one of their ancestors. Mirrors the
 * PATCHED oracle: the ancestor walk tracks visited notes so parent rings
 * terminate (see locked decision 0 in the plan).
 */
export function misfiled(notes: Note[], graphDir: string, hub: string, rootName: string): Problem[] {
  const byName = byNameMap(notes);
  const problems: Problem[] = [];

  for (const note of notes) {
    if (samePath(note.path, hub)) continue;

    const ancestors = new Set<string>();
    const walked = new Set<string>();
    let current: Note = note;
    while (current.parent !== null && ancestors.size < notes.length) {
      const key = casefold(current.path);
      if (walked.has(key)) break;
      walked.add(key);
      const parent = byName.get(casefold(current.parent));
      if (parent === undefined) break;
      ancestors.add(casefold(parent.stem));
      if (samePath(parent.path, hub)) break;
      current = parent;
    }

    let folder = dirName(note.path);
    const folderNameOf = (dir: string): string => (dir === "" ? rootName : baseName(dir));
    if (casefold(folderNameOf(folder)) === casefold(note.stem)) folder = dirName(folder);
    if (samePath(folder, graphDir)) continue;

    const folderName = folderNameOf(folder);
    if (!ancestors.has(casefold(folderName))) {
      problems.push({
        kind: "misfiled",
        note: baseName(note.path),
        detail: `sits in ${pyRepr(folderName)}, which is not one of its ancestors`,
      });
    }
  }

  return problems;
}

export interface GraphReport {
  graph: string;
  path: string;
  counts: { notes: number; problems: number };
  problems: Problem[];
}

export interface ValidationReport {
  ok: boolean;
  root: string;
  graphs: GraphReport[];
}

export function loadGraphNotes(view: VaultView, graphDir: string): Note[] {
  return collectNoteFiles(view, graphDir).map((p) => noteFromFile(p, view.get(p)!));
}

export function checkGraph(view: VaultView, graphDir: string): GraphReport {
  const notes = loadGraphNotes(view, graphDir);
  const hub = hubPath(view, graphDir);
  const { edges, problems } = resolveParents(notes, hub);
  for (const ring of findCycles(notes, edges)) problems.push(cycleProblem(ring));
  problems.push(...duplicateNames(notes, view.rootName));
  problems.push(...misfiled(notes, graphDir, hub, view.rootName));
  return {
    graph: graphDir === "" ? view.rootName : baseName(graphDir),
    path: graphDir === "" ? "." : graphDir,
    counts: { notes: notes.length, problems: problems.length },
    problems,
  };
}

export function buildValidationReport(view: VaultView): ValidationReport {
  const graphs = findGraphs(view).map((dir) => checkGraph(view, dir));
  return {
    ok: graphs.every((g) => g.problems.length === 0),
    root: ".",
    graphs,
  };
}

export interface GraphStats {
  nodes: number;
  hubChildren: number;
}

/** The --tree footer: node count (hub excluded) and direct hub children. */
export function graphStats(view: VaultView, graphDir: string): GraphStats {
  const notes = loadGraphNotes(view, graphDir);
  const hub = hubPath(view, graphDir);
  const { edges } = resolveParents(notes, hub);
  let hubChildren = 0;
  for (const parent of edges.values()) {
    if (samePath(parent.path, hub)) hubChildren++;
  }
  return { nodes: notes.length - 1, hubChildren };
}
