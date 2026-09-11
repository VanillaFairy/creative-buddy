import { describe, it, expect } from "vitest";
import { loadFixtureVault, loadExpected } from "./helpers/load-fixture";
import { VaultView, baseName, stemOf } from "../src/graph/types";
import { findGraphs, hubPath, collectNoteFiles } from "../src/graph/discovery";
import { hierarchyOf, statsOf } from "../src/graph/hierarchy";

/**
 * The TypeScript hierarchy against the Python one.
 *
 * `oracle/graph_check.py` is the contract and `tests/expected/*.json` is
 * generated from it, so this is the one test that says the port still agrees
 * with what it was ported from. It compares the drawn tree rather than the
 * edge map, because the tree is the thing a reader would notice being wrong
 * and it pins the ordering of a brood as well as its membership.
 */

const FIXTURES = ["simple", "problems", "edge-cases", "rooty", "multi"] as const;

/** The same drawing `graph_check.py` prints, from the TypeScript side. */
function treeLines(view: VaultView, graphDir: string): string[] {
  const hub = hubPath(view, graphDir);
  const paths = collectNoteFiles(view, graphDir);
  const { childrenOf } = hierarchyOf(paths, graphDir, hub);
  const lines: string[] = [];

  const draw = (path: string, prefix: string, last: boolean, root: boolean): void => {
    let below = "";
    if (root) {
      lines.push(stemOf(path));
    } else {
      lines.push(`${prefix}${last ? "└── " : "├── "}${stemOf(path)}`);
      below = prefix + (last ? "    " : "│   ");
    }
    const brood = childrenOf.get(path) ?? [];
    brood.forEach((child, i) => draw(child, below, i === brood.length - 1, false));
  };

  if (paths.some((p) => p === hub)) draw(hub, "", true, true);
  return lines;
}

function report(view: VaultView): unknown {
  return {
    root: ".",
    graphs: findGraphs(view).map((graphDir) => {
      const hub = hubPath(view, graphDir);
      const paths = collectNoteFiles(view, graphDir);
      const { nodes, hubChildren } = statsOf(paths, graphDir, hub);
      return {
        graph: graphDir === "" ? view.rootName : baseName(graphDir),
        path: graphDir === "" ? "." : graphDir,
        counts: { notes: nodes, hubChildren },
        tree: treeLines(view, graphDir),
      };
    }),
  };
}

describe("the folder hierarchy vs the oracle", () => {
  it.each(FIXTURES)("%s draws the tree graph_check.py draws", (name) => {
    expect(report(new VaultView(loadFixtureVault(name)))).toEqual(loadExpected(name, "graph-check"));
  });

  it.each(FIXTURES)("%s leaves nothing off the tree", (name) => {
    // Every note reaches the hub, because every note is in a folder and every
    // folder leads back. There is no tray of strays any more, and this is why.
    const view = new VaultView(loadFixtureVault(name));
    for (const graphDir of findGraphs(view)) {
      const paths = collectNoteFiles(view, graphDir);
      const drawn = treeLines(view, graphDir).length;
      expect(drawn, `${graphDir} drew ${drawn} of ${paths.length}`).toBe(paths.length);
    }
  });
});
