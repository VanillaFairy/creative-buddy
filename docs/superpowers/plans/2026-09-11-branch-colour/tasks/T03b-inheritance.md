# T03b: Inheritance

**Role:** `green`
**Depends on:** T03a
**Read first:** `shared/interfaces.md`, `shared/conventions.md`, `knowledge/run-tests.md`, `knowledge/commit.md`

**Files:**
- Modify: `src/mindmap/layout.ts`
- Modify: `tests/mindmap-radial.test.ts` (one line — a type literal, not coverage)
- Test (READ-ONLY): `tests/mindmap-layout.test.ts`

## Scope / Negative constraints

- **Do NOT modify `tests/mindmap-layout.test.ts`.** T03a authored it and it is
  locked. A test you believe is wrong gets escalated, never edited.
- Write no new tests. The one line you add to `tests/mindmap-radial.test.ts` is
  a required field in an existing object literal, so the file keeps compiling.
- Do not touch `src/mindmap/MindmapView.tsx` or `styles.css` — painting is T04.
- `src/mindmap/layout.ts` contains two literal NUL bytes, so git treats it as
  binary. Your commit will show `Bin <n> -> <m> bytes` and no line diff. That is
  expected and is not a problem to solve.

- [ ] **Step 1: Read the locked tests**

Read the `describe("colour down a branch", …)` block at the end of
`tests/mindmap-layout.test.ts`. It is the specification.

```bash
npx vitest run tests/mindmap-layout.test.ts
```

- [ ] **Step 2: Add the field to `MindmapNode`**

In `src/mindmap/layout.ts`, in the `MindmapNode` interface, between `status` and
`children`:

```ts
  /** The colour to paint this node: its own, or the nearest ancestor's. */
  color: string | null;
```

- [ ] **Step 3: Resolve it in the walk that already exists**

`toNode` currently takes `(note, insideFold)`. Give it the colour standing over
it, and let each note either keep that colour or replace it for everything
below. Change the signature and body:

```ts
  const toNode = (note: Note, insideFold: boolean, inherited: string | null): MindmapNode => {
    drawn.add(note.path);
    if (insideFold) hiddenPaths.add(note.path);
    const kids = (childrenOf.get(note.path) ?? []).filter((k) => !drawn.has(k.path));
    const isCollapsed = collapsed.has(note.path);
    const hidden = isCollapsed ? hiddenTotals(kids, childrenOf, questionsOf) : { notes: 0, questions: 0 };
    // A note under a fold is still laid out; it is the drawing that skips it.
    const childrenFolded = insideFold || isCollapsed;
    // Its own colour if it asks for one, otherwise whatever is standing over it.
    const color = note.color ?? inherited;
    return {
      path: note.path,
      stem: note.stem,
      kind: note.kind,
      status: note.status,
      color,
      children: prune && isCollapsed ? [] : kids.map((kid) => toNode(kid, childrenFolded, color)),
      collapsedChildren: hidden.notes,
      openQuestions: questionsOf(note),
      hiddenOpenQuestions: hidden.questions,
    };
  };
```

And the one call that starts the walk:

```ts
  const root = hubNote === null ? null : toNode(hubNote, false, null);
```

- [ ] **Step 4: Keep the radial test's node factory compiling**

`tests/mindmap-radial.test.ts` builds `MindmapNode` literals by hand (the `note`
helper, around line 22). A required field breaks it. Add one line, in the same
position the interface has it — after `status`:

```ts
  color: null,
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run
```

Expected: everything green, including the six tests in
`describe("colour down a branch", …)`.

- [ ] **Step 6: Typecheck**

```bash
npm run build
```

Expected: the build completes. This is the tier that catches any other place
constructing a `MindmapNode` by hand.

- [ ] **Step 7: Commit**

```bash
git add src/mindmap/layout.ts tests/mindmap-radial.test.ts
git commit -m "feat: a colour reaches everything below the note that asks for it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
