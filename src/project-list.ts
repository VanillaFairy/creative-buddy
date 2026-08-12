import type { GraphModel } from "./graph/graph-model";
import { projectName } from "./view-title";
import { baseName } from "./graph/types";

/**
 * One project as the picker offers it. The dir is what a conversation or a map
 * binds to; everything else is there so the choice can be an informed one
 * rather than a guess from a folder path.
 */
export interface ProjectRow {
  dir: string;
  name: string;
  /** Where the project sits — null when its name already says it. */
  location: string | null;
  /** Notes besides the hub, the same figure the map's header reports. */
  notes: number;
}

/**
 * Copy and formatting the two pickers share. The chat renders in React and the
 * map in plain DOM, so anything either of them says lives here rather than
 * being written out twice and drifting.
 */
export const PICKER_INDEXING = "Reading the vault — projects will appear here in a moment.";
export const PICKER_EMPTY =
  "No projects yet. A project is a folder holding a note of the same name whose body carries a ## Charter heading.";

export function noteCount(notes: number): string {
  return notes === 1 ? "1 note" : `${notes} notes`;
}

/** What a screen reader gets, since the count is visual shorthand. */
export function projectRowLabel(row: ProjectRow): string {
  const where = row.location === null ? "" : `, ${row.location}`;
  return `${row.name}${where} — ${noteCount(row.notes)}`;
}

/**
 * How to start a project that is not on the list yet, told whichever way is
 * actually open to you. The interviewer can only write inside the project it is
 * bound to, so it can only set up a new folder for you from a project that
 * spans the whole vault — and pointing at that row when the vault has no such
 * project would be pointing at nothing.
 */
export function bootstrapHint(rows: readonly ProjectRow[]): string {
  return rows.some((row) => row.dir === "")
    ? "Starting something new? Pick the whole vault and tell me — I'll ask what to call the folder first."
    : "Starting something new? Make it a folder with a note of the same name inside, and give that note a ## Charter heading.";
}

/**
 * The line under the name, there to tell two same-named projects apart. A
 * top-level folder needs none — its name is already the whole address.
 */
function locationOf(dir: string): string | null {
  if (dir === "") return "the whole vault";
  return dir.includes("/") ? dir.slice(0, dir.length - baseName(dir).length - 1) : null;
}

/**
 * Every project in the vault, in the graph list's order (already sorted, and
 * stable — a picker that reshuffles between openings cannot be learned).
 */
export function projectRows(model: GraphModel): ProjectRow[] {
  return model.graphs().map((dir) => ({
    dir,
    name: projectName(dir, model.rootName)!,
    location: locationOf(dir),
    notes: model.stats(dir)?.nodes ?? 0,
  }));
}
