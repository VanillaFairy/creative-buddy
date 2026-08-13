# Task T06: Active-note resolver

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md`
- Read: `../shared/conventions.md`
- Read: `../../knowledge/typecheck-build.md`
- Read: `../../knowledge/commit.md`
- Read: `src/main.ts`, the `activeGraphDir()` method — its twin, and the style to match

## Dependencies
- Depends on: T01 (open-questions module)
- Depended on by: T07 (chat wiring)

## Scope
**Files:**
- Modify: `src/main.ts`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## There is no test here, and that is deliberate

`main.ts` is the Obsidian boundary — `Plugin`, `Workspace`, `TFile`. It is
manual-test-only by design, which is precisely why every decision this feature makes
lives in a module that is not this one. What is left here is three lines of lookup with
no judgement in them. Verification is the typecheck, the build, and the manual pass in
T08.

If you find yourself wanting to add a branch with any thought in it, that branch belongs
in a pure module and this task is the wrong place for it.

## Positive Constraints (DO)
- Put the new method directly after `activeGraphDir()`, which it mirrors.
- Return `null` for all three "no" cases: no active file, no index yet, wrong graph.
- Compare graph dirs with `===`, the way `ChatView.setState` already compares them —
  both sides come from `model.graphOf`, so they are the same string or they are not the
  same graph.

## Negative Constraints (DO NOT)
- Do NOT fall back to another graph, the hub, or "the last note you were on". A tab is
  bound to one project, and `src/agent/permissions.ts` is fail-closed about paths
  outside it. Silence is the correct answer.
- Do NOT cache the result. `contentOf` is a map lookup over an index that is already
  kept current by the vault listeners in `buildModel`.
- Do NOT import `countOpenQuestions` from `./mindmap/heat` — after T01 it is not there.

## Implementation Steps

- [ ] **Step 1: Add the import**

At the top of `src/main.ts`, beside the other local imports:

```typescript
import { countOpenQuestions } from "./open-questions";
```

- [ ] **Step 2: Write the method**

In `src/main.ts`, immediately after the closing brace of `activeGraphDir()`, add:

```typescript
  /**
   * The note the user is reading, when it belongs to this graph — its path and
   * what it still owes.
   *
   * Null when nothing is open, when the index is not built yet, and — the case
   * worth naming — when the open note belongs to a *different* project. A chat tab
   * is bound to one graph, and pointing it at another one's note is the thing the
   * approval table exists to refuse. So a tab bound elsewhere sees no note at all,
   * which is also why the preset simply is not there rather than being there and
   * failing.
   *
   * `contentOf` answers "" for a path the vault no longer holds, so a note deleted
   * between an event and the render reads as owing nothing rather than throwing.
   */
  activeNoteIn(graphDir: string): { path: string; openQuestions: number } | null {
    const file = this.app.workspace.getActiveFile();
    if (file === null || this.model === null) return null;
    if (this.model.graphOf(file.path) !== graphDir) return null;
    return { path: file.path, openQuestions: countOpenQuestions(this.model.contentOf(file.path)) };
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Run the suite**

Run: `npx vitest run`
Expected: PASS. Nothing tests `main.ts`, so this is checking you did not break an
import chain elsewhere.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: it completes and writes `main.js`. The build is the real check on this file —
green tests do not mean the plugin compiles.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: the plugin can name the note you are reading"
```

Remember the `Co-Authored-By:` trailer from `../shared/conventions.md`.

## Acceptance Criteria
- [ ] `npx tsc --noEmit` is clean
- [ ] `npm run build` completes and writes `main.js`
- [ ] `npx vitest run` passes
- [ ] The method returns `null` for a note outside `graphDir`
- [ ] No files outside Scope were modified
