# T05: Words and checklist

**Role:** — (docs)
**Depends on:** —
**Read first:** the spec, `shared/conventions.md` (vocabulary), `docs/GLOSSARY.md` section *The map*, `src/mindmap/INDEX.md`, `docs/superpowers/manual-test-checklist.md` section *2 — Dev vault: mindmap*, `../../knowledge/run-tests.md`, `../../knowledge/commit.md`

**Files:**
- Modify: `docs/GLOSSARY.md`
- Modify: `src/mindmap/INDEX.md`
- Modify: `docs/superpowers/manual-test-checklist.md`

Docs are tested (`tests/docs-questions.test.ts`), so run the suite before
committing.

- [ ] **Step 1: Glossary**

In `docs/GLOSSARY.md` under `## The map`, in the style of the **heat** entry,
add **Highlight**: a way of reading the map around one note — right-click,
tick Highlight, and what is not connected dims. Name its words (**the Highlight
center**, **in the Highlight**, **dimmed**), say that a note's neighbours are
its parent, children and cross-link partners, that folds are never opened (a
folded branch stands in for what it hides), and that it is not saved. Point at
[`src/mindmap/highlight.ts`](../src/mindmap/highlight.ts) as the module that
decides.

- [ ] **Step 2: Module INDEX**

In `src/mindmap/INDEX.md`:

- *KEY ABSTRACTIONS*: one bullet — `highlight.ts` decides Highlight; the view
  holds the state in memory and asks `drawnLit` once per draw.
- *INVARIANTS & GOTCHAS*: Highlight is deliberately not in `getState` and is
  pruned against the graph's notes on every redraw; `MindmapData.parentOf`
  exists because the flat map's `root` has lost folded notes and Highlight still
  needs their parents.

Keep each to two or three lines. The INDEX says what the code cannot.

- [ ] **Step 3: Manual checklist**

In `docs/superpowers/manual-test-checklist.md`, section 2, after `### Radial`,
add `### Highlight` with `- [ ]` items covering, on both maps:

- the menu on a note with Highlight off, on the center, on a lit note, on a
  dimmed note — exact items per the spec's table;
- ticking Highlight dims the rest and names the center in the header;
  ticking it elsewhere recenters and forgets earlier adds and removes;
  unticking on the center is the only exit;
- Add, Remove, Extend — Extend brings back a note removed earlier;
- held cross-links stay drawn without hover (radial chords included); hover
  still lights a dimmed note's links over the dimming;
- a folded branch hiding a lit note stays lit; Highlight never opens a fold;
- right-click on a radial caption; Shift+F10 on a focused node;
- a long center name truncates in a narrow pane without pushing the gear off;
- switching project, or restarting Obsidian, leaves Highlight off;
- renaming or deleting the center while Highlight is on turns it off; deleting a
  lit non-center note just drops it.

Write them in the checklist's voice: an action, an arrow, what must be true.

- [ ] **Step 4: Run the suite**

```bash
npx vitest run
```

Expected: all pass, `docs-questions` included.

- [ ] **Step 5: Commit**

```bash
git add docs/GLOSSARY.md src/mindmap/INDEX.md docs/superpowers/manual-test-checklist.md
git commit -m "docs: Highlight in the glossary, the map's INDEX and the checklist

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git log -1 --stat
```
