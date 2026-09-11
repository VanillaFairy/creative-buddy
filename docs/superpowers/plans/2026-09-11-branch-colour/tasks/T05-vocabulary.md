# T05: The word

**Depends on:** —
**Read first:** `shared/conventions.md`, `knowledge/commit.md`

**Files:**
- Modify: `assets/prompts/system.md`
- Modify: `src/graph/hierarchy.ts` (header comment only)
- Modify: `CLAUDE.md`

This task is prose. It can run before any code lands — nothing here imports
anything. It carries two commits: the word, then the field.

**Run the test suite when you are done.** `tests/docs-questions.test.ts` walks
every `.md` under `docs/`, and `tests/prompts.test.ts` asserts things about the
stitched prompt. Editing prose can turn the suite red.

## Commit 1 — the word

- [ ] **Step 1: Rename the stale heading**

`assets/prompts/system.md` has a heading whose own body contradicts it. Change:

```markdown
### The folders mirror the tree
```

to:

```markdown
### The folders are the tree
```

- [ ] **Step 2: Name the thing**

In the same section, replace this paragraph:

```markdown
The folders are not a mirror of the tree — they **are** the tree, and there is
no second opinion to keep them in step with. A folder speaks through a note
carrying its own name, sitting either inside it (`References/References.md`) or
beside it (`References.md` next to `References/`), and everything in that folder
hangs off that note. A folder nobody speaks for is a filing convenience rather
than a generation: its notes pass up to the nearest folder that does speak.
```

with:

```markdown
The folders are not a mirror of the tree — they **are** the tree, and there is
no second opinion to keep them in step with.

A folder holding a note of its own name is a **branch**, and that note is its
**branch note**. The note sits either inside the folder
(`References/References.md`) or beside it (`References.md` next to
`References/`), and everything in that folder hangs off it. A folder with no
such note is a **plain folder** — a filing convenience rather than a generation
— and the notes inside it pass up to the nearest branch above.

The hub is the graph's root branch. Every other branch is a note that grew
children.
```

- [ ] **Step 3: Use the word where the section already needed it**

Three more spots in `assets/prompts/system.md`:

In the diagram, the comment on the group node:

```
    References.md       <- the group node, a folder because it has children
```

becomes:

```
    References.md       <- the branch note: References is a branch
```

In the working-set list under "What to read":

```markdown
- its parent — the note that speaks for the folder this one sits in;
```

becomes:

```markdown
- its parent — the branch note of the folder this one sits in;
```

And the promotion rule:

```markdown
**A note gains children by becoming a folder.** Promotion is a file move:
make `X/`, put `X.md` inside it, and the new children go in beside it.
```

becomes:

```markdown
**A note gains children by becoming a branch.** Promotion is a file move: make
`X/`, put `X.md` inside it, and the new children go in beside it. Moving a note
is not renaming it, so every link keeps resolving.
```

- [ ] **Step 4: Delete the paragraph left over from the old doctrine**

The section says "Three things follow" and then lists four. The fourth is a
duplicate of the promotion rule written in the language of the mirror the
section just disowned — "the tree did not change, only its reflection". Its one
surviving fact moved into Step 3. Delete it whole:

```markdown
**A node that gains its first child becomes a folder.** That is a file move, and
it is silent: the tree did not change, only its reflection. Moving a note is not
renaming it, so every link keeps resolving.
```

- [ ] **Step 5: Name it in the code's own words**

In `src/graph/hierarchy.ts`, the header comment describes the arrangement
longhand. Replace its first paragraph:

```ts
 * The folder tree is the hierarchy — there is no second opinion to reconcile
 * and nothing to keep in step. A folder speaks through a note carrying its own
 * name, sitting either *inside* it (`World/World.md`) or *beside* it
 * (`Buddies.md` next to `Buddies/`); everything in that folder hangs off that
 * note, and the note itself answers to the folder above. A folder nobody
 * speaks for is a filing convenience rather than a generation, so its notes
 * pass up to the nearest folder that does speak.
```

with:

```ts
 * The folder tree is the hierarchy — there is no second opinion to reconcile
 * and nothing to keep in step. A folder holding a note of its own name is a
 * **branch**, and that note is its **branch note**: it sits either *inside* the
 * folder (`World/World.md`) or *beside* it (`Buddies.md` next to `Buddies/`),
 * everything in that folder hangs off it, and it answers to the branch above.
 * A folder with no such note is a plain folder — a filing convenience rather
 * than a generation — so its notes pass up to the nearest branch above.
```

Leave `speakerFor` and `speaker` named as they are. They are the *mechanism*
that finds a branch note, the metaphor still reads, and renaming them is churn
this task did not ask for.

- [ ] **Step 6: Teach CLAUDE.md the word**

Replace the `src/graph/` bullet's second half:

```markdown
  load-bearing one: **the folder tree is the hierarchy**. A folder speaks
  through a note of its own name, inside it or beside it, and everything in
  that folder hangs off that note. Nothing reads a `parent:` field; there is no
  second opinion to reconcile, so nothing can be orphaned, cycle, or be
  misfiled, and two notes may share a name in different folders.
```

with:

```markdown
  load-bearing one: **the folder tree is the hierarchy**. A folder holding a
  note of its own name is a **branch** and that note is its **branch note**;
  everything in the folder hangs off it, and a folder without one is a plain
  folder whose notes pass up to the nearest branch above. Nothing reads a
  `parent:` field; there is no second opinion to reconcile, so nothing can be
  orphaned, cycle, or be misfiled, and two notes may share a name in different
  folders.
```

- [ ] **Step 7: Run the tests**

```bash
npx vitest run
```

Expected: green. If `tests/prompts.test.ts` fails, read what it asserts before
changing anything — it may be pinning a phrase you just edited.

- [ ] **Step 8: Commit**

```bash
git add assets/prompts/system.md src/graph/hierarchy.ts CLAUDE.md
git commit -m "docs: a folder and the note that speaks for it is a branch

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Commit 2 — the field

- [ ] **Step 9: Document `color:` where the other fields are documented**

In `assets/prompts/system.md`, under `## What a node looks like`, after the
paragraph ending "filling it in is inventing a fact." and before "The body is
statements and graded questions, in prose.", add:

```markdown
`color:` is the map's paint. A note carrying one is drawn in that colour, and so
is everything below it, until a descendant asks for its own. It belongs on a
**branch note**, where it marks the whole branch at a glance. Write it
**quoted** — `color: "#c94f7c"` — because an unquoted `#` opens a YAML comment
and the colour silently vanishes. Hex (`#rgb`, `#rrggbb`) or a CSS colour name;
anything else is ignored. Like a `status:` and unlike a `kind:`, it is the
user's own mark: set one when they ask, change one when they ask, explain how it
works when they wonder — and never add one on your own.
```

- [ ] **Step 10: Run the tests**

```bash
npx vitest run
```

- [ ] **Step 11: Commit**

```bash
git add assets/prompts/system.md
git commit -m "docs: the interviewer knows what a note's colour is for

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Scope / Negative constraints

- Do NOT edit `assets/prompts/skill-source.md`. It is an archival copy of the
  original Obsidian skill; nothing imports it, and its old `parent:` doctrine is
  meant to stay as a record.
- Do NOT edit `assets/agents/kg-scout.md` — that is T06, and two tasks must not
  share a file.
- Do NOT rename `speakerFor`/`speaker` in `src/graph/hierarchy.ts`, or any other
  identifier. This task changes prose.
- Do NOT add a `color:` example to `assets/prompts/grill.md` or `consult.md`.
  One place defines a field.
