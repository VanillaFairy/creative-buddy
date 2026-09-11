# T06: The scout follows folders

**Depends on:** —
**Read first:** `shared/conventions.md`, `knowledge/commit.md`

**Files:**
- Modify: `assets/agents/kg-scout.md`

A one-line correction the folder-tree change missed. The scout is still told to
follow a field that no longer exists, so on a real graph that instruction is a
dead end.

- [ ] **Step 1: Fix the instruction**

In `assets/agents/kg-scout.md`, under `## How to read`, replace:

```markdown
Grep first on the names, aliases and distinctive phrases in the question. Read
the notes that come back, then follow their `parent:` and wikilinks one hop if
the question needs it. Read whole notes — they are small. Stop when further
reading stops changing your answer.
```

with:

```markdown
Grep first on the names, aliases and distinctive phrases in the question. Read
the notes that come back, then go one hop if the question needs it: out along
their wikilinks, or up to the branch note of the folder they sit in — the note
carrying that folder's own name. Read whole notes — they are small. Stop when
further reading stops changing your answer.
```

- [ ] **Step 2: Check nothing else in the file says `parent:`**

```bash
grep -n "parent:" assets/agents/kg-scout.md
```

Expected: no output. If there is any, fix it the same way and say so.

- [ ] **Step 3: Run the tests**

```bash
npx vitest run tests/kg-scout.test.ts
```

Expected: green. That test asserts how the scout is configured and dispatched;
if it pins a phrase you just edited, read it before changing anything.

- [ ] **Step 4: Commit**

```bash
git add assets/agents/kg-scout.md
git commit -m "fix: the scout follows folders, since there is no parent field to follow

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Scope / Negative constraints

- Do NOT touch `assets/prompts/system.md` — that is T05, and two tasks must not
  share a file.
- Do NOT teach the scout about `color:`. It answers questions about content; a
  colour is not content.
