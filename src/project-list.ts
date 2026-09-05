import type { GraphModel } from "./graph/graph-model";
import { projectName } from "./view-title";
import { baseName } from "./graph/types";
import { graphOfNote } from "./graph/ownership";

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

/**
 * The folder you have open, offered as a project of its own.
 *
 * A refusal is a row you can see and cannot press. It is there because a folder
 * that simply goes missing reads as a bug, while one that names the project
 * holding it is an answer.
 */
export interface FolderOffer {
  dir: string;
  name: string;
  /** Where it sits — null when its name already says. */
  location: string | null;
  /** Why it cannot become a project; null when it can. */
  refusal: string | null;
}

/**
 * What the picker offers for `dir`, the folder holding the note being read.
 *
 * Null twice over: nothing is open, or the folder is a project already and the
 * list above holds it. Otherwise a row, refused or not.
 *
 * `graphOfNote` answers for a folder path exactly as it does for a note — the
 * question is the same prefix match — and it deliberately does not count a
 * folder as its own owner, which is why the list membership is asked first.
 */
export function folderOffer(model: GraphModel, dir: string | null): FolderOffer | null {
  if (dir === null) return null;
  const graphs = model.graphs();
  if (graphs.includes(dir)) return null;

  const row = { dir, name: projectName(dir, model.rootName)!, location: locationOf(dir) };
  // findGraphs stops at the first project it finds, so a charter on the root
  // note would leave the root the only project the plugin can still see.
  if (dir === "") return { ...row, refusal: "would hide every other project" };

  const owner = graphOfNote(graphs, dir);
  return {
    ...row,
    refusal: owner === null ? null : `already part of ${projectName(owner, model.rootName)}`,
  };
}

/** The button's own words, so both pickers say them the same way. */
export function offerLabel(offer: FolderOffer): string {
  return `Create a project from current folder: ${offer.name}`;
}
