/**
 * Who hangs off what.
 *
 * The folder tree is the hierarchy — there is no second opinion to reconcile
 * and nothing to keep in step. A folder speaks through a note carrying its own
 * name, sitting either *inside* it (`World/World.md`) or *beside* it
 * (`Buddies.md` next to `Buddies/`); everything in that folder hangs off that
 * note, and the note itself answers to the folder above. A folder nobody
 * speaks for is a filing convenience rather than a generation, so its notes
 * pass up to the nearest folder that does speak.
 *
 * Three things follow from a path being unique, and they are the reason this
 * replaced a `parent:` field resolved by bare name. Nothing can be orphaned:
 * every file is in a folder. Nothing can loop: a directory tree has no rings.
 * And two notes may share a name freely, because the folder they sit in says
 * which is which — one `Images` under every chapter, and no ambiguity to
 * report. Whether a *wikilink* to such a name is ambiguous is a separate
 * question, and one for whoever writes the link.
 */

import { baseName, dirName, stemOf } from "./types";
import { casefold, comparePyStrings } from "./py-compat";

export interface Hierarchy {
  /** Child note path → its parent's note path. The hub is absent; it is the root. */
  parentOf: ReadonlyMap<string, string>;
  /** Parent note path → its children, in the order a reader meets them. */
  childrenOf: ReadonlyMap<string, string[]>;
}

/**
 * The tree over `notePaths`, all of which are taken to belong to `graphDir`.
 *
 * Pure over paths alone: it reads no files, so a caller that has already
 * listed a graph's notes has everything this needs.
 */
export function hierarchyOf(
  notePaths: readonly string[],
  graphDir: string,
  hub: string,
): Hierarchy {
  const byPath = new Map<string, string>();
  for (const path of notePaths) byPath.set(casefold(path), path);

  /** The note a folder speaks through, preferring the one inside it. */
  const speakerFor = (dir: string): string | undefined => {
    const name = dir === "" ? null : baseName(dir);
    if (name === null) return undefined;
    const inside = byPath.get(casefold(`${dir}/${name}.md`));
    if (inside !== undefined) return inside;
    const above = dirName(dir);
    return byPath.get(casefold(above === "" ? `${name}.md` : `${above}/${name}.md`));
  };

  // A graph at the vault root has "" for its folder, which `speakerFor` cannot
  // name, so the hub is registered against it directly.
  const speaker = (dir: string): string | undefined =>
    casefold(dir) === casefold(graphDir) ? hub : speakerFor(dir);

  const parentOf = new Map<string, string>();
  for (const path of notePaths) {
    if (casefold(path) === casefold(hub)) continue;

    let dir = dirName(path);
    let found: string | undefined;
    // Bounded by the path's own depth: every step drops a segment.
    for (let step = 0; step <= path.split("/").length; step++) {
      const here = speaker(dir);
      // Skipping itself is what sends a note that speaks for its own folder up
      // to the folder above, rather than making it its own parent.
      if (here !== undefined && here !== path) {
        found = here;
        break;
      }
      if (casefold(dir) === casefold(graphDir)) break;
      const up = dirName(dir);
      if (up === dir) break;
      dir = up;
    }
    parentOf.set(path, found ?? hub);
  }

  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of parentOf) {
    const brood = childrenOf.get(parent) ?? [];
    brood.push(child);
    childrenOf.set(parent, brood);
  }
  for (const brood of childrenOf.values()) {
    brood.sort((a, b) => comparePyStrings(casefold(stemOf(a)), casefold(stemOf(b))));
  }

  return { parentOf, childrenOf };
}
