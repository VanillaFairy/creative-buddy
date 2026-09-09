# Radial mindmap — execution checkpoint

Branch `radial-mindmap`, off `main` at `e7f0bec`. Plan:
`docs/superpowers/plans/2026-09-08-radial-mindmap.md`.

## Wave 1 — done and merged (`96508e4`)

| Task | Role | Commit | What landed |
|---|---|---|---|
| T1a | red | `b083563` | 16 tests for `radialCaption` in `tests/mindmap-geometry.test.ts` |
| T2a | red | `ddbc389` | 43 tests for `radialLayout` in `tests/mindmap-radial.test.ts` (new file) |
| T3 | — | `0eed8f6` | Radial dot and caption rules in `styles.css` |

Merged state verified: 476 pre-existing tests green, 16 new failing only on the
missing `radialCaption` / `DOT_RADIUS` / `HUB_DOT_RADIUS` / `Caption` exports,
`tests/mindmap-radial.test.ts` failing to resolve `../src/mindmap/radial`.
`npx tsc --noEmit` reports those two absences and nothing else.

## Protocol adaptations (recorded deviations)

- **Test authors were given the behaviour spec, not the plan's test code.** The
  plan contains both the tests and the implementation, both written by the same
  author. Handing those pre-written tests to a "test author" would have made the
  adversarial separation theatre. Each red task got the API signatures and the
  behaviour contract instead, and authored freely. Both suites came back
  materially stronger than the plan's.
- **One reviewer covered two tasks** (T1a and T3) rather than four separate
  spec/quality dispatches, and reviews were sequenced rather than run
  concurrently. The first attempt at Wave 1 died when three agents hit the
  session rate limit simultaneously; concurrency has been held at two since.
- **Three of the four Wave 1 defects were in the plan, not in execution.** Every
  agent did what it was told correctly. Noted because it argues for reviewing
  the instructions, not only the work.

## Spec decisions made during the wave

Escalated by the test authors, resolved by the supervisor. These are contract.

**`radialCaption`**

1. "Tighter than a box" binds the rendered **label** as well as the width: a
   caption's stem is never longer than the same note's box label.
2. That holds with a fold count present too.
3. A count too wide for the cap: the stem collapses to `…` and the total may
   exceed the cap. The count is never dropped — clipping it would lie about what
   is hidden.
4. An empty label is not a real call. No special-casing.
5. The gap is the existing `DIVIDER_GAP`, not a new constant — it is the same
   visual remove between a name and its metadata, and two constants for one
   distance would drift.
6. `suffix` is echoed verbatim; the caller formats `+4`.

**`radialLayout`**

7. `Reach` carries no height and will not grow one. `bounds` encloses captions
   horizontally and dots vertically; the 32px fit margin absorbs a caption's
   ~7px overhang.
8. A near-antipodal cross-link whose bow collapses onto the hub is acceptable —
   a chord between opposite sides genuinely does run near the centre.
9. A cross-link with the hub as one end is left untested; a gentle curve is fine.
10. **Cubic and quadratic curve commands only, no `A` arcs.** The suite's path
    tests read a `d` string's numbers as coordinate pairs, and an arc mixes
    flags and radii in among them.
11. Angle convention: `x = radius·sin(angle)`, `y = −radius·cos(angle)`, screen
    coordinates with y growing downward.

## Defects found and fixed in-wave

- **`.cb-mm-caption` lost on specificity.** `.cb-mm-node text` is (0,1,1); a bare
  class is (0,1,0). The caption would have rendered in `--cb-ink` — the same
  colour its own hover rule sets — making that hover rule dead code. Fixed to
  `text.cb-mm-caption`. The plan asserted the opposite as fact; corrected there
  too.
- **Two reds for one signal.** `var(--text-error)` in radial vs `var(--cb-broken)`
  in box mode. Unified on `--cb-broken`.
- **A frozen test that could block a correct implementation.** T1a pinned an
  exact key set with `toEqual`, which this project's standards forbid on a type a
  correct implementation may extend. Deleted — the four fields are asserted by
  value elsewhere.
- **The headline invariant did not hold the line.** A layout separating
  neighbours by the *mean* of their footprints — which is exactly what
  `d3-flextree`'s `nodeSize` gives you — passed all 42 original tests while
  producing real caption collisions (2 overlaps at 60 alternating wide/narrow
  siblings, 4 at 140). An unrotated caption hangs entirely off **one** side of
  its dot, so a wide name needs its full width of clearance toward its
  neighbour, not half the pair's average. Closed by a new test using alternating
  200px/4px captions on a 72-node ring, proven to fail under mean separation and
  pass under `max`.
- **Ring inversion was undefended.** Computing each ring's radius independently
  (`max(depth · RING_GAP, circumference / 2π)`) passed everything while drawing
  ring 2 a thousand pixels *inside* ring 1. Closed by a test pairing a crowded
  first ring with a lone grandchild.
- **`toBeCloseTo(x, 6)` on path endpoints** forbade rounding coordinates in the
  emitted `d` string. Relaxed to 2 digits. Note the residual: 2 digits admits
  `toFixed(3)` but still rejects `toFixed(2)` on a coordinate landing exactly on
  `x.xx5`.

## Waves 2-5 — done and merged

| Task | Role | Commit | What landed |
|---|---|---|---|
| T1b | green | `15ad75d` | `radialCaption` + dot radii in `geometry.ts`. Proposal passed unchanged. |
| T2b | green | `cb69124` | `src/mindmap/radial.ts`. Took route 1 — flextree kept, separation corrected. |
| T2e | — | `86d5a60` | Comments that had gone false; `CHORD_PULL` renamed `CHORD_MIDPOINT_KEEP`. |
| T2d | red | `44a2471` | The guard that makes `.spacing()` load-bearing. |
| T2g | red | `580319d` | Caption gap pinned to the box's; the cap/ring-gap coupling written down. |
| T2c | audit | — | Report only. 40+ mutations run against the suite. |
| T2f | red | `d8e2110` | Six holes the audit found, each proven to fail on its mutation. |
| T4 | — | `a4f270a`, `a5bb8ec` | The seam rule `reachFor`, and the view with its Radial switch. |
| T4b | — | `d54f1be`, `a2c61f9`, `8100aeb` | Three loose ends at the seam. |
| T5 | — | pending | Manual checklist and the shipped-work ledger. |

547 tests green, `npm run build` clean.

## What the adversarial passes actually caught

Recorded because the pattern is more useful than the list. **Every real defect was found by running a
deliberately wrong implementation and seeing what stayed green.** Reading code carefully found comment
errors and CSS specificity mistakes — which matter — but never a hole in a contract.

- **Mean vs. max separation.** `d3-flextree` separates neighbours by `(sa+sb)/2`. An unrotated caption
  hangs off one side of its dot, so a wide name needs its *full* width of clearance toward its
  neighbour. Measured: 2 caption overlaps at 60 alternating wide/narrow siblings, 4 at 140. Fixed with
  `.spacing((a,b) => |sa−sb|/2)`, since `(sa+sb)/2 + |sa−sb|/2 = max(sa,sb)`. Confirmed from
  `flextree.js:241` that `spacing` is consulted inside a contour walk, so it fires on cousins from
  different parents — the fix is complete, not sibling-only.
- **That fix was unguarded for a while, and the reason is the sharpest lesson here.** The test meant to
  catch it was verified against a *scratch* implementation that packed to radius 1421, where the
  captions collided. The real implementation lands at 1547, where the vertical drop between neighbours
  clears the 14px band. **Verifying that a test catches a bug against one implementation does not
  establish that it catches that bug at all** — its bite depended on a radius each implementation
  chooses freely. Replaced with a direct arc-vs-footprint assertion, which no radius can dodge.
- **The fan guarantee was invisible to a whole class of test.** The crowding fix multiplies every angle
  by `s` and divides every radius by `s`, so `arc = Δangle × radius` is *invariant* under it. Every
  test phrased in arc length — the natural unit here, since collisions are made of arcs — was
  mathematically incapable of seeing whether the guard ran at all. Removing it put three notes at ±120°
  on a 49px circle with 536/536 green. Now asserted in angle and radius separately.
- **A guard can pass on floating-point dust.** `"opens the fan wider for wide notes"` survived the
  above mutation on a one-ULP difference (`4.18879020478639053` vs `...141`) that happened to land the
  right way. Strengthened with a same-ring precondition — "opens wider" is a claim about angle, and
  angle is only comparable at a fixed radius.
- **Ring inversion, bounds at `±1e6`, swapped link controls (66.5° off radial), an asymmetric
  cross-link, a tautological test, an over-tight path tolerance** — all green as mutants, all now
  guarded.

## Three CSS specificity bugs, one cause

`.cb-mm-caption` lost to `.cb-mm-node text`; `.cb-mm-fold` has lost to it since the flat map shipped;
and the fix for the first made `.cb-mm-fold` lose to `text.cb-mm-caption`. All the same shape: a
single-class rule (0,1,0) beaten by class-plus-type (0,1,1).

The structural cause is that `.cb-mm-node text` sets `fill` and `font-size` for every `<text>` in the
group, so every per-element class must out-specify it and nothing says so. Worth fixing at the root
some day; out of scope here. The flat map's `.cb-mm-fold` defect is tracked separately and deliberately
untouched on this branch.

## Errors in the plan, corrected in it

Three of the four Wave 1 defects and two later ones were the plan's, not any agent's:

- The plan asserted `.cb-mm-caption` would out-specify `.cb-mm-node text`. Backwards.
- It used `var(--text-error)` where the box mode uses `var(--cb-broken)` — two reds for one signal.
- Its fold-count formula anchored the count `"start"` while the stem was anchored `"end"`, measuring
  the two from opposite edges and landing the count on top of the name. **The implementer deviated and
  was right to**; the plan now carries the corrected form and the reason.
- Its `radial.ts` used flextree's default separation, which is the mean bug above.
- A comment approved into `geometry.ts` said the ring gap "clears it by 11px" when
  `6 + 7 + 168 = 181` against `RING_GAP = 170` is **short** by 11 (27 for the hub's larger dot).
  Corrected in `d54f1be`.

## Known and accepted

A long caption near 3 or 9 o'clock can clip up to 11px of a dot on the next ring out — 27px for the
hub, whose dot is larger. The no-overlap guarantee is **per-ring by design**; Obsidian's own graph view
behaves the same way. An audit swept 4000 random graphs (224,102 notes) and found **zero** real
occurrences: a caption only points that far outward under crowding, and crowding widens the rings by
almost exactly as much. `RING_GAP` stays at 170. It is on the manual checklist.

## Open for Wave 2 (resolved — kept for the record)

- **The plan's `radial.ts` is a proposal that is wrong at one known line.** It
  uses `flextree().nodeSize(...)`, which is mean-of-pair separation. Two routes,
  both proven to pass the suite: keep flextree and correct the separation with
  `.spacing((a, b) => Math.abs(size(a) − size(b)) / 2)`, since
  `(sa+sb)/2 + |sa−sb|/2 = max(sa, sb)`; or drop flextree for a ~100-line ring
  accumulator. flextree keeps a parent centred over its children, which is worth
  something visually. **Unverified:** whether flextree applies `spacing` between
  adjacent nodes of *different* subtrees or only between siblings. If only
  siblings, the spacing fix is incomplete and a mixed-parent ring with varied
  captions would still collide. Must be measured, not reasoned about.

## Remaining

Wave 2: T1b (`geometry.ts`), T2b (`radial.ts`) — parallel, fresh agents that did
not author the tests they are passing. Wave 3: T2c audit. Wave 4: T4 (the view).
Wave 5: T5 (docs).

## Out of band

`.cb-mm-fold` has the same specificity defect as the caption bug and has been
live since the feature shipped: a folded branch's count renders in `--cb-ink` at
`--font-ui-small` instead of the `--cb-quiet` / `--font-ui-smaller` its own
comment promises. Tracked separately; deliberately not fixed on this branch.
