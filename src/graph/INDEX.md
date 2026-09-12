# src/graph

## PURPOSE

The deterministic core: a vault snapshot in, a tree and a note index out. No
Obsidian imports, no AI, no clock — it is a line-faithful TypeScript port of the
vendored Python in `oracle/`, and it is separate so that both implementations can
be run against the same fixtures and diffed.

## KEY ABSTRACTIONS

- `hierarchyOf` (`hierarchy.ts`) is the **only** answer to who hangs off what.
  Nothing in the codebase reads a `parent:` frontmatter field, and `Note` has no
  slot for one — that second source of truth is what folders-as-hierarchy
  replaced.
- `nameResolutionMap` (`notes.ts`) is asymmetric on purpose and it bites: stems
  are **last-wins** (`map.set` unguarded), aliases **first-wins** and never
  displace a stem. Duplicate note names in different folders are legal per
  `hierarchy.ts`, so a wikilink to a duplicated name resolves to whichever copy
  `collectNoteFiles` ordered last. Change the collection order and cross-links
  in `src/mindmap/layout.ts` move.
- `casefold` (`py-compat.ts`) is the project's one case fold. It, and every bare
  `toLowerCase` (`color.ts`, `permissions.ts`, `mindmap/service.ts`), must never
  become `toLocaleLowerCase`: under a Turkish locale that folds `INDIGO` to
  `ındıgo` and `SERVICE` to `ıce`, and no test run outside that locale catches it.

## CONCURRENCY MODEL

Synchronous throughout. `GraphModel.invalidate` calls listeners inline on every
`setFile`/`deleteFile`/`renameFile`, so a listener that writes back re-enters.
Debouncing belongs to the caller — `MindmapView` does it, tests do not.

## INVARIANTS & GOTCHAS

- The oracle pins **less than it looks like**. `oracle/graph_check.py` emits only
  the graph list, `counts.notes`, `counts.hubChildren` and the ASCII tree; it
  never parses frontmatter. So changes to how `aliases`, `kind`, `status` or
  `color` are read pass `npm run oracle` clean and are covered by unit tests
  alone.
- What the oracle *does* pin includes ordering. Change `graph_check.py` first,
  regenerate, then port — never the other way round.
- `graphOfNote` must be handed `model.graphs()`, never a folder walk.
  `findGraphs` stops descending at the first graph it finds, so a walk can return
  a dir the list does not contain, and the map silently substitutes its first
  graph for such a value.

## DEPENDENCIES

`js-yaml` for frontmatter, and nothing else. This module is the bottom of the
stack; everything above imports it.
