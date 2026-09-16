# T02b: Highlight rules

**Role:** `green`
**Depends on:** T02a
**Read first:** `shared/interfaces.md`, `shared/conventions.md`, the spec's *Behaviour* section, `../../knowledge/run-tests.md`, `../../knowledge/commit.md`

**Files:**
- Create: `src/mindmap/highlight.ts`
- Test (READ-ONLY): `tests/mindmap-highlight.test.ts`

**Interfaces:**
- Consumes: `MindmapData` type from `src/mindmap/layout.ts` (with T01's `parentOf`).
- Produces: every export listed for `highlight.ts` in `shared/interfaces.md`, exactly as named and typed there. T03 and T04 import them.

## Scope / Negative constraints

- **Do NOT modify `tests/mindmap-highlight.test.ts`.** T02a authored it and it is
  locked. A test you believe is wrong gets escalated with your reasoning — never
  edited, skipped or loosened.
- Write no tests.
- No import from `obsidian`, no DOM, no d3. Type-only import from `./layout`.
- Do not touch the view or styles — that is T03 and T04.

## The rules

These are what the module must do. The locked tests supply the detail.

- A Highlight is `{ center, lit }`, and `lit` always contains `center`. No export
  can produce a Highlight that breaks that.
- A note's **neighbours** are its parent, its children and its cross-link partners
  in either direction, read from `parentOf` and `crossLinks` — never from a drawn
  tree. Not the note itself.
- **toggle** on the center turns Highlight off; anywhere else it starts over from
  that note with the note and its neighbours lit.
- **add** lights one note. **remove** dims one note and refuses the center.
  **extend** lights a note and all its neighbours.
- **prune** turns Highlight off when the center is gone, otherwise keeps only lit
  notes that still exist.
- **menuFor**: off → nothing ticked, nothing else offered. On → the center is
  ticked and offers Extend only; other lit notes offer Remove and Extend; dimmed
  notes offer Add and Extend.
- **drawnLit**: a lit note paints lit as itself, unless a collapsed strict
  ancestor hides it — then the **outermost** such ancestor paints lit in its place.
- Transitions return new objects; the argument is never mutated.

`neighboursOf` is called once per menu action, and `drawnLit` once per redraw
over the whole lit set. Either may scan `parentOf` linearly; do not build
indexes the tests do not need.

- [ ] **Step 1: Read the locked tests**

```bash
npx vitest run tests/mindmap-highlight.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 2: Implement `src/mindmap/highlight.ts`**

A short file header saying what the module decides is enough; comment only the
traps (why the *outermost* collapsed ancestor, not the nearest).

- [ ] **Step 3: Run the locked tests, then the suite and typecheck**

```bash
npx vitest run tests/mindmap-highlight.test.ts
npx vitest run
npx tsc --noEmit
```

Expected: all pass, typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add src/mindmap/highlight.ts
git commit -m "feat: Highlight rules — who is lit, what each note's menu offers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git log -1 --stat
```
