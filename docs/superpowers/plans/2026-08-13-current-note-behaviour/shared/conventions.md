# Conventions

These are the house rules this repo already keeps. Match the surrounding code; do not
introduce a second style.

## Files and names

- Source files: kebab-case (`note-context.ts`), one responsibility each.
- Test files: `tests/<name>.test.ts`, mirroring the module's name, flat — the repo does
  not nest test directories.
- Functions: camelCase. Interfaces: PascalCase.

## Comments

Every module opens with a block comment explaining **why it exists**, not what it does,
in the plain, unhurried voice of `queue.ts` and `presets.ts`. Read one before writing
one. Inline comments explain a decision that would otherwise look arbitrary; they never
narrate the next line.

## Tests

- Vitest. `describe` names the unit, `it` names the behaviour as a sentence:
  `it("says nothing while the user stays on the same note")`.
- No mocking frameworks. Pure functions get literal inputs; anything needing a vault
  uses `tests/helpers/load-fixture.ts`.
- A test that would need Obsidian is not written. `ChatView`, `MindmapView` and
  `main.ts` are manual-test-only **by design** — that is why every decision is pulled
  out into a module that can be tested without them.
- `.md` files import as strings; `vitest.config.ts` has a loader for it, so
  `import md from "../assets/prompts/presets/x.md"` works in tests and in the bundle.

## Commits

```
type: subject

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

`type` is one of feat/test/chore/fix/docs. Subject is lower-case, no trailing period,
written as a plain statement about the app rather than about the diff — look at
`git log` before writing one. **Never commit red tests.**

`git commit` prints `ERROR: Failed to parse repository information` twice. That is
user-global hook noise and is harmless — verify the commit with `git log`.

## Two traps in this repo

- `src/mindmap/layout.ts` contains two literal NUL bytes, so **git treats it as
  binary**. A commit touching it shows `Bin 4656 -> 5913 bytes` and no line diff.
  Nothing is wrong. Edit it with the Edit tool as usual; just do not expect a readable
  diff, and check your change by running the tests.
- `tests/expected/*.json` are machine-generated and LF in git. Nothing in this plan
  touches them, so `npm run oracle && git diff --exit-code tests/expected` must stay
  clean throughout.
