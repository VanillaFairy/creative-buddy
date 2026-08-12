/**
 * Which graph owns a note.
 *
 * Deliberately matched against a graph LIST rather than walked up the folder
 * tree. findGraphs stops descending the moment it finds a graph, so a charter
 * folder nested inside a graph is never listed — and a tree walk would happily
 * return it, handing the rest of the plugin a graphDir that model.graphs() does
 * not contain (the map silently swaps such a value for its first graph). Asking
 * the list can only ever answer with a graph everything else already agrees on.
 */
export function graphOfNote(graphs: readonly string[], notePath: string): string | null {
  let best: string | null = null;
  for (const dir of graphs) {
    // "" is the vault root and contains every note; anything else has to match
    // on a separator, or graph "Noir" would swallow "Noir game/Heavy Rain.md".
    if (dir !== "" && !notePath.startsWith(dir + "/")) continue;
    // Longest wins: the nearest of two listed graphs is the one that owns the
    // note, and a folder graph always outranks a graph at the vault root.
    if (best === null || dir.length > best.length) best = dir;
  }
  return best;
}
