# T03c: Inheritance audit

**Role:** `audit`
**Depends on:** T03b
**Read first:** `shared/interfaces.md`, the design doc's "The field" section

**Files:** none. This task reports; it does not edit.

Invoke the `vf-superpowers:adversarial-tdd` skill and take its auditor role over
the `describe("colour down a branch", …)` block in
`tests/mindmap-layout.test.ts` and the `toNode` walk in `src/mindmap/layout.ts`.

## What to attack

- **Shapes the tests do not build.** `buildMindmapData` has more cases than a
  clean tree: a note already `drawn` is filtered out of its parent's brood, a
  collapsed node under `prune` returns no children at all, and `hiddenPaths`
  tracks notes a fold is hiding. Does a colour behave in each?
- **The plain-folder case.** A folder with no note of its own name is not a
  branch — its notes pass up to the nearest branch above. Do they take that
  branch's colour? Nothing in the test block builds such a folder, and it is the
  arrangement most likely to surprise someone.
- **Whether the walk resolves or defers.** `MindmapNode.color` is meant to be
  the *effective* colour. If any consumer would still have to look upward, the
  interface is not holding up its end.
- **Tests pinned to the implementation.** Would any of them still pass if the
  rule were "nearest ancestor wins" implemented some other way? They should.
- **Cost.** The walk runs on every redraw. Is anything here doing work per node
  that it does not need to?

## Output

Report findings as a list: what is wrong, why it matters, what test would catch
it. Findings become new `red` tasks — you write no tests and edit no files.

If the pair is sound, say so plainly and stop.
