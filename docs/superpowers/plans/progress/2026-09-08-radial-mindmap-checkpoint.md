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

## Open for Wave 2

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
