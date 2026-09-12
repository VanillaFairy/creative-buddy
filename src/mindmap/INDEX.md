# src/mindmap

## PURPOSE

The live map of a project. `MindmapView.tsx` is a d3 shell that owns the SVG,
the zoom behaviour and a text measurer; every drawing rule lives in a pure
module beside it with its own test. Two layouts share those rules — a flat tree
and a radial one — which is why `geometry.ts` is separate from both.

## KEY ABSTRACTIONS

- `buildMindmapData` (`layout.ts`) turns a `GraphModel` into the drawable tree.
  Its `prune` option is the difference between the two maps: the flat tree drops
  folded branches and closes the gap, the radial one keeps every note in the
  layout and returns `hiddenPaths` for the painter to skip, so folding costs a
  gap rather than everyone's place on the circle.
- `radialLayout` settles bearings, `placeBands` settles distances, and they
  disagree on purpose: `RadialLayout.rings` is the circle a generation's angles
  were *reserved* against, while `node.radius` is where `bands.ts` actually
  seated it, usually nearer the hub. An arc reserved for a note is an angle
  times the ring, never times `node.radius`.

## INVARIANTS & GOTCHAS

- **`layout.ts` contains two literal NUL bytes** — the separator inside the
  cross-link dedup key, `${a}\0${b}`. Under `.gitattributes`' `text=auto`, git
  auto-detects the file as binary, so every commit touching it shows
  `Bin N -> M bytes` and no line diff. Nothing is broken; the file's history
  just cannot be reviewed from the diff.
- Several constants here are **measurements, not preferences**, and each was
  taken by drawing real graphs and watching where the layout stopped moving:
  `SETTLING_PASSES` (6) and `RADIUS_TRIES` (28) in the layout loops,
  `MAX_CAPTION_WIDTH` (155) against `RING_GAP` (170), `MAX_FIT_SCALE` (1.6).
  Anything that changes what a node reserves — caption font, dot radius, the
  fold suffix — invalidates them. Re-measure on a real vault; do not carry the
  numbers forward on the assumption they still hold.
- The map redraws on a 300 ms debounce of its own (`scheduleRedraw`).
  `GraphModel` notifies synchronously on every single file event, so removing
  that timer means a redraw per keystroke during vault indexing.

## DEPENDENCIES

`src/graph` for the model, the hierarchy and the note index. `src/open-questions`
for the per-note count `heat.ts` maps to a palette step. `d3-hierarchy`,
`d3-flextree`, `d3-selection`, `d3-zoom`. The eleven `cb-mm-heat-*` classes and
the cross-link chord style live in `styles.css`.
