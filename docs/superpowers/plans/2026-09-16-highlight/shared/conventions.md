# Conventions for this plan

Read `CLAUDE.md` at the repo root first — this file only adds what is specific
to this work.

## Vocabulary

**Highlight** is the name of the view, capitalised as a name. Use its words from
the first commit:

- **Highlight is on / off** — whether the map is in this view.
- **the Highlight center** — the note Highlight was ticked on.
- **in the Highlight** / **lit** — a note that stays at full weight.
- **dimmed** — every other note.

Not "highlight mode", "focus", "selection" or "spotlight". The prose is British
("neighbour", "colour").

## Comments

`~/.claude/CLAUDE-CODING.md` applies: a comment derivable from the code plus one
hop gets deleted, not shortened. Worth writing here: why Highlight is kept out of
`getState`; why a cross-link that is held needs its own class rather than
`-live`; why the radial chord's `display: none` has to be lifted for held links.

## Tests

- Never pin an exact key set with `toEqual` on `MindmapData` or `HighlightMenu`
  — a correct implementation may extend either. Use `toMatchObject` or assert
  the fields you mean.
- Compute expected sets from the fixture's own links; do not write out a set a
  test could derive.
- Assert behaviour, not source text. No regex over `styles.css` or the view.
- The view is manual-test. `MindmapView.tsx` makes no decisions of its own — if
  you find yourself writing an `if` about who is lit, it belongs in
  `highlight.ts`.

## Commits

`type: subject` (feat/test/chore/fix/docs), one concern each, plus:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Name the model that actually wrote the commit — a subagent on another model
names that one.

Every `git commit` prints `ERROR: Failed to parse repository information` once or
twice. Global-hook noise; confirm with `git log -1`.

## What not to touch

- `oracle/` and `tests/expected/*.json`. `parentOf` is a TypeScript-side
  addition the oracle never draws; if `npm run oracle` goes dirty, stop and say so.
- `src/mindmap/layout.ts` holds two literal NUL bytes, so git treats it as
  binary and commits show `Bin N -> M bytes`. Expected; do not "fix" it, and
  edit it with a tool that preserves those bytes (the Edit tool does; `sed`
  and hand-retyping the dedup key may not).
- `getState` / `setState`. Highlight is not persisted.
