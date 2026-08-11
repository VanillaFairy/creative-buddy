import { GraphModel } from "../graph/graph-model";
import { Note, nameResolutionMap } from "../graph/notes";
import { baseName } from "../graph/types";
import { casefold, comparePyStrings, DateOnly } from "../graph/py-compat";
import { resolveParents, samePath, GraphStats } from "../graph/validation";
import { SURFACED, Bucket } from "../graph/obligations";
import { isInsidePath } from "../agent/permissions";

export interface MindmapNode {
  path: string;
  stem: string;
  kind: string | null;
  status: string | null;
  problemKinds: string[];
  obligationCount: number;
  children: MindmapNode[];
  collapsedChildren: number;
}

export interface MindmapData {
  root: MindmapNode | null;
  unreachable: Array<{ stem: string; path: string; parent: string | null }>;
  crossLinks: Array<{ from: string; to: string }>;
  stats: GraphStats | null;
}

export function buildMindmapData(model: GraphModel, graphDir: string, today: DateOnly, collapsed: ReadonlySet<string>): MindmapData {
  const notes = model.notes(graphDir);
  const hub = model.hubPathOf(graphDir);
  const { edges } = resolveParents(notes, hub);

  // problems by note filename
  const validation = model.validation();
  const graphReport = validation.graphs.find((g) => g.path === (graphDir === "" ? "." : graphDir));
  const problemsByNote = new Map<string, string[]>();
  for (const problem of graphReport?.problems ?? []) {
    const list = problemsByNote.get(problem.note) ?? [];
    list.push(problem.kind);
    problemsByNote.set(problem.note, list);
  }

  // surfaced obligation counts by note path
  const register = model.obligations(today);
  const obligationCount = new Map<string, number>();
  for (const [bucket] of SURFACED) {
    for (const entry of register[bucket as Bucket]) {
      if (!isInsidePath(entry.note, graphDir)) continue;
      obligationCount.set(entry.note, (obligationCount.get(entry.note) ?? 0) + 1);
    }
  }

  // children map, normcase-ordered like the oracle's tree()
  const childrenOf = new Map<string, Note[]>();
  for (const [child, parent] of edges) {
    const list = childrenOf.get(parent.path) ?? [];
    list.push(child);
    childrenOf.set(parent.path, list);
  }
  for (const brood of childrenOf.values()) brood.sort((a, b) => comparePyStrings(casefold(a.stem), casefold(b.stem)));

  const drawn = new Set<string>();
  const toNode = (note: Note): MindmapNode => {
    drawn.add(note.path);
    const kids = (childrenOf.get(note.path) ?? []).filter((k) => !drawn.has(k.path));
    const isCollapsed = collapsed.has(note.path);
    return {
      path: note.path,
      stem: note.stem,
      kind: note.kind,
      status: note.status,
      problemKinds: problemsByNote.get(baseName(note.path)) ?? [],
      obligationCount: obligationCount.get(note.path) ?? 0,
      children: isCollapsed ? [] : kids.map(toNode),
      collapsedChildren: isCollapsed ? countDescendants(kids, childrenOf) : 0,
    };
  };

  const hubNote = notes.find((n) => samePath(n.path, hub)) ?? null;
  const root = hubNote === null ? null : toNode(hubNote);

  // For the unreachable tray, walk the FULL tree regardless of collapse:
  const reachable = new Set<string>();
  if (hubNote !== null) {
    const stack = [hubNote];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (reachable.has(current.path)) continue;
      reachable.add(current.path);
      for (const child of childrenOf.get(current.path) ?? []) stack.push(child);
    }
  }
  const unreachable = notes
    .filter((n) => !reachable.has(n.path))
    .map((n) => ({ stem: n.stem, path: n.path, parent: n.parent }))
    .sort((a, b) => comparePyStrings(casefold(a.stem), casefold(b.stem)));

  // cross-links: wikilinks that are not parent edges, resolved in-graph
  const resolve = nameResolutionMap(notes);
  const crossLinks: Array<{ from: string; to: string }> = [];
  const seenLinks = new Set<string>();
  for (const note of notes) {
    const parentOf = edges.get(note);
    for (const target of note.links) {
      const resolved = resolve.get(casefold(target));
      if (resolved === undefined || resolved.path === note.path) continue;
      if (parentOf !== undefined && resolved.path === parentOf.path) continue;
      const key = `${note.path}→${resolved.path}`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      crossLinks.push({ from: note.path, to: resolved.path });
    }
  }

  return { root, unreachable, crossLinks, stats: model.stats(graphDir) };
}

function countDescendants(kids: Note[], childrenOf: Map<string, Note[]>): number {
  let count = 0;
  const stack = [...kids];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current.path)) continue;
    seen.add(current.path);
    count++;
    for (const child of childrenOf.get(current.path) ?? []) stack.push(child);
  }
  return count;
}
