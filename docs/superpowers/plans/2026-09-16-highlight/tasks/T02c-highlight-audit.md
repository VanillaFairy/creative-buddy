# T02c: Highlight rules audit

**Role:** `audit`
**Depends on:** T02b
**Read first:** the spec, `shared/interfaces.md`

**Files:** none. This task reports; it does not edit.

Invoke `vf-superpowers:adversarial-tdd` and take its auditor role over
`tests/mindmap-highlight.test.ts` and `src/mindmap/highlight.ts`.

## What to attack

- **The center invariant.** Is there any sequence of exported calls that yields
  a Highlight whose `lit` lacks its `center`? `prune` with a center that exists
  but is absent from `lit`? A hand-built state? Which of these can the view
  actually reach?
- **Nested folds.** Does `drawnLit` pick the outermost collapsed ancestor, and
  would the tests notice if it picked the nearest? Three levels deep, with the
  middle one not collapsed?
- **Folds that are not ancestors.** A collapsed sibling, or a collapsed path from
  another graph, must light nothing.
- **Direction.** Would the tests catch a `neighboursOf` that only follows
  `from → to`? One that forgets children? One that includes the note itself?
- **Stale history on recenter.** Would the tests catch a `toggle` that carries
  the old `lit` over into the new center?
- **Mutation.** Would the tests catch a transition that mutates the `Set` it was
  given and returns the same object?
- **Tests pinned to the implementation.** Would any test fail on a correct
  implementation that returns sets in another order or copies where this one
  shares?
- **Real data.** Does at least one test go through `buildMindmapData` with a
  pruned fold, so `parentOf`'s contract from T01 is exercised end to end?

Where useful, prove a gap by mutation: make the wrong change locally, run the
tests, revert. Leave the tree clean.

## Output

A list: what is wrong, why it matters, the test that would catch it. Findings
become new `red` tasks, which must land before T06.

If the pair is sound, say so plainly and stop.
