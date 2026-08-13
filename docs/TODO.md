# TODO — feature backlog

Ideas that are wanted but not yet planned. Nothing here is committed to a
milestone; a plan or spec gets written when an item is picked up.

For deferred *defects* and known traps from the original build, see
`docs/superpowers/plans/progress/2026-08-11-graph-buddy-plugin-checkpoint.md`
(the "Open items" section) instead.

---

## Nothing queued

The list is empty as of 2026-08-13. The one item it held — the map heatmap —
was built and merged the same day (`16ef30c`, `319a281`, `a8a864d`), so it left
the backlog rather than being dropped.

Where its record lives now, if you need it: the behaviour is described in the
"Heat" section of `docs/superpowers/manual-test-checklist.md`, the counting rule
in `src/mindmap/heat.ts`, and the two-region box in `src/mindmap/geometry.ts`.
The three questions this file left open all got answered by the build — a broken
note keeps its red dashed border and shows heat in the fill, the hub takes heat
like any other node, and the divider is permanent while only the colours are
conditional on the switch.

Add the next thing here when it turns up.
