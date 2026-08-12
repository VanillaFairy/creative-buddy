# TODO — feature backlog

Ideas that are wanted but not yet planned. Nothing here is committed to a
milestone; a plan or spec gets written when an item is picked up.

For deferred *defects* and known traps from the original build, see
`docs/superpowers/plans/progress/2026-08-11-graph-buddy-plugin-checkpoint.md`
(the "Open items" section) instead.

---

## Heatmap in the map view

A toggle in the mindmap that colors each node by how many open questions it
carries. Off by default; a node with no open questions is green, ten or more is
red, everything between interpolated across that range.

The point is to see at a glance where the graph still owes the user thinking —
the hottest parts are the ones worth an interview session.

**What counts as an open question.** Already defined in
`assets/prompts/system.md` ("Open questions"): an unchecked `- [ ]` written on
the note where its answer will go. Checked boxes don't count. So the number is
just a count of unchecked task boxes in the note body.

### The node splits in two

Every node's color is its own — its own open questions, nothing inherited. A
collapsed node then gets a second area for what it's hiding:

```
[ Collapsed-node-title │ +N ]
```

The `│` is a literal thin vertical rule dividing the box into a **content area**
and a **child-ref area**. The content area carries the node's own heat. The
child-ref area carries the cumulative heat of unresolved questions across
everything hidden under it — same population the `+N` already counts, so the
number and the color always agree.

An expanded node is a plain single-area box. Its children are on screen carrying
their own colors, so there's nothing to summarize.

In each area, **fill is the unsaturated version of the heat color and the border
is the bright version of the same**.

This replaces how the fold indicator draws today: `nodeBox` in
`src/mindmap/geometry.ts:61` already reserves `SUFFIX_GAP` between the label and
the `+N`, and `MindmapView.tsx:294` paints the suffix as loose text. The divider
goes in that gap, and the box becomes two filled regions instead of one — so
`nodeBox` should also return the split coordinate rather than the view deriving
it.

### The scale is a lookup table

The range is static: 0 through 10, clamped above 10. That's eleven steps, so the
colors get precomputed and hardcoded rather than interpolated at runtime — no
color math in the render path, and the midpoints can be eyeballed once and
fixed.

Proposed shape, since it matches how `styles.css` already works: the pure module
yields a bucket index 0–10, and CSS owns the palette as
`--cb-heat-0-fill` … `--cb-heat-10-fill` plus the matching `-border` pair,
declared once per theme in the existing `.theme-dark` / `.theme-light` blocks
(`styles.css:51-55`). Keeps color values out of TypeScript entirely and lets
light and dark differ where they need to.

### The toggle lives in the header

Map header for now — cheap, and it matches how collapse state is already handled
per view. Later it can move into settings the way Obsidian's own graph view does
it, with the display controls as a panel.

### Where it plugs in

- `src/mindmap/layout.ts` — `MindmapNode` (line 7) already carries the per-node
  display facts (`kind`, `status`, `problemKinds`). The node's own count and the
  cumulative hidden count belong there beside them, computed in the pure module
  so both are TDD'd. `countDescendants` already walks the collapsed subtree for
  `+N`; the cumulative count rides along the same walk.
- `src/mindmap/geometry.ts` — `nodeBox` grows the divider position and the two
  region widths. Pure, already has tests.
- `src/mindmap/MindmapView.tsx` — draws the two regions and the toggle, applies
  the bucket class. No decisions in the shell.

### Still open

- How heat coexists with the styling already on a node for `problemKinds` and
  `status`. Two color systems on one small box can end up fighting; the problem
  markers may need to move to the border, or the heat to the fill only.
- Whether the hub note gets heat. It renders on a different path (`isHub`, no
  padding, its own height), so it needs an explicit answer either way.
- Whether the divider and two-region anatomy are permanent or only appear while
  the heatmap is on. Reading the redesign as permanent — the areas always exist,
  the colors only show when the toggle is on.
