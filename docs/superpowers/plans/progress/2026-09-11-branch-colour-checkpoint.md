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

## Verification

- `npx vitest run` — 634 passed, 38 files.
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
- **T01c and T03c**, the two adversarial audits, were still running when this
  was written. Their findings become new `red` tasks, never inline patches.
- **The branch is unmerged and unpushed.**

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
