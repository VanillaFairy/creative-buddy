# Branch Colour — checkpoint

**Plan:** `docs/superpowers/plans/2026-09-11-branch-colour/plan.md`
**Design:** `docs/superpowers/specs/2026-09-11-branch-colour-design.md`
**Branch:** `claude/branch-colour`, cut from `main` at `0baa612`. Not merged, not pushed.

## What shipped

| Task | Commit | What |
|---|---|---|
| T01a | `66cc2fc` | `tests/color.test.ts` — 23 tests, authored from the spec alone |
| T01b | `e6f3ae2` | `src/graph/color.ts` — hex grammar + the 148-name table |
| T02 | `7ee2d8c` | `Note.color`, read through `scalarOrNull` like every other scalar |
| T03a | `c3a3d3e` | 14 inheritance tests in `tests/mindmap-layout.test.ts` |
| T03b | `e4d0d6b` | `MindmapNode.color`, resolved in the existing `toNode` walk |
| T04 | `7bf67a9` | Painters set `--cb-tint`; seven stylesheet rules read it |
| T05 | `7a62653`, `012896e` | The word **branch**, then the `color:` field, in the prompt and the docs |
| — | `fe415b1` | The words table admits `branch` and says how it differs from a `limb` |
| T06 | `c467867` | The scout follows folders; `parent:` is gone from every shipped asset |

Spec decisions settled mid-flight are in the plan's `shared/interfaces.md`, under
the two "Settled while…" headings — ten cases the design left open, each raised
by a test author rather than guessed at by an implementer.

## The audits

Both triads were audited by a third agent that had seen neither the author's nor
the implementer's reasoning. Both implementations survived; every finding was on
the test side.

**The parser** (`T01c`): built 13 mutant implementations and found **9 survived**
the suite. Three settled decisions had no test at all — system colours, the
NBSP/BOM half of the trim rule, and a newline inside a hex, which was the one way
a non-colour could have reached `style.setProperty`. It also cross-checked the
148-name table entry-for-entry against `mdn-data`, `@csstools/color-helpers`,
`@asamuzakjp/css-color` and `d3-color`: all four agree exactly, nothing missing,
extra, misspelled or out of order. And it found a literal NUL byte in
`tests/color.test.ts` that had already made the file binary to ripgrep.

**The inheritance walk** (`T03c`): 11 mutations, 4000 fuzzed graph shapes, eight
hand-built awkward shapes. Nothing escaped. Three tests, though, were never the
unique catcher and asserted what another tier already guarantees — those are
gone (`865b35d`).

Acted on in `bc9f833` and `865b35d`. Two findings were out of scope and are
queued as separate work: the dead `drawn` cycle guard, and `stats()` recomputing
the hierarchy every redraw.

**Declined:** adding `mdn-data` as a devDependency so the name table could be
compared against the spec's own data. The CSS named-colour list has been frozen
since `rebeccapurple` in 2014, so the dependency would guard against an edit
nobody is going to make. The comment in `tests/color.test.ts` now says plainly
that the table is not protected at this tier, and records the cross-check date.

## Verification

- `npx vitest run` — 630 passed, 38 files. (Down from 634: four tests that could
  not fail were deleted, three added that pin decisions nothing was holding.)
- `npm run build` — clean (`tsc --noEmit` included).
- `npm run oracle && git diff --exit-code tests/expected` — clean. Nothing here
  touches tree shape.
- `deploy.bat` — deployed 2026-09-11 18:29.
- Adversarial separation verified with `check-separation.sh` for both triads:
  RED is an ancestor of GREEN, and GREEN changed no locked test file.

## Still open

- **The manual visual pass.** Six checks, listed in
  `docs/superpowers/plans/2026-09-11-branch-colour/tasks/T04-paint.md`, Step 5.
  Nobody has run them. No agent can — the map has to be looked at.
- **The branch is unmerged and unpushed.**

## A process lesson, recorded because it cost an audit to find

`T03b`'s task file contained the implementation verbatim — signature, body, call
site, even the comment. The implementer's only independent act was *deleting*
that comment, which was correct. But it means both artifacts descended from the
same plan, and the tests never got to constrain a differently-minded
implementer. They were good tests regardless (11 of 11 mutations caught), but
the pair's independence was thinner than the triad shape suggested.

Next time: a `green` task states the rule and the files, not the diff. A `red`
task may carry a proposed test file, because its author is told to treat it as a
floor and attack it — that asymmetry is fine.

## Noticed, not acted on

- `tests/notes.test.ts` still carries `parent: "[[References]]"` in one fixture.
  Inert since `120fc29` — nothing reads a `parent:` claim. Harmless, and it does
  document that such a key is ignored, but the assertion that used to prove that
  was loosened to `toMatchObject` in T02.
- `assets/prompts/system.md` still says **group node** in four places. The words
  table now defines it as "a branch note made to gather siblings under a role",
  so the two words cohere — but a later pass could decide the purpose-word is no
  longer worth its own row.
- `color-mix()` needs Chromium 111+. Any current Obsidian is far past it; if
  colours never appear while the flat palette still looks right, an old Electron
  is the first thing to check. The failure would be silent, not black.
