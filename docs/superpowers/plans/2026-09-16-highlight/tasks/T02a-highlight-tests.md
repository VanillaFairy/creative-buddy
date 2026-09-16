# T02a: Highlight rules tests

**Role:** `red`
**Depends on:** T01
**Read first:** the spec (`docs/superpowers/specs/2026-09-16-highlight-design.md`) sections *Behaviour* and *Closed questions*; `shared/interfaces.md`; `shared/conventions.md`; `../../knowledge/run-tests.md`; `../../knowledge/commit.md`

**Files:**
- Create: `tests/mindmap-highlight.test.ts` — **you own it**

**Interfaces:**
- Consumes: the `highlight.ts` signatures in `shared/interfaces.md` (they do not exist yet — that is the point); `buildMindmapData` and `MindmapData.parentOf` from T01.
- Produces: the locked test file T02b implements against.

## Your job

Write tests that pin the spec's intent, not one implementation's choices. Do not
write `src/mindmap/highlight.ts`. Invoke `vf-superpowers:adversarial-tdd` and take
the test-author role.

Where the spec leaves something open, **assert the invariant and escalate the
question** — do not pick an answer and pin it. Known open points you must not
pin: the iteration order of any returned set; whether a no-op transition returns
the same object or an equal copy.

## Building fixtures

Two kinds, both fine:

1. **Literal `Links`** for the pure rules — a `parentOf` map and a `crossLinks`
   array you write by hand. Small and readable:

   ```ts
   const links: Links = {
     parentOf: new Map([["G/A.md", "G/G.md"], ["G/B.md", "G/G.md"], ["G/A/A1.md", "G/A.md"]]),
     crossLinks: [{ from: "G/B.md", to: "G/A/A1.md" }],
   };
   ```

2. **Real data** through `GraphModel` + `buildMindmapData`, the way
   `tests/mindmap-crosslinks.test.ts` does, for at least one test that proves the
   rules compose with what the builder actually produces (a folded branch under
   `prune: true` included).

Compute expected sets from the fixture — e.g. "the parent from `parentOf`, the
children by scanning it, the partners by scanning `crossLinks`" — rather than
writing the answer out as a literal a reader has to trust.

## Cases — a floor, not a ceiling

**neighboursOf**
- includes the parent; includes every child; includes cross-link partners
  whether the note is the link's `from` or its `to`;
- never includes the note itself;
- the hub has no parent and still gets its children;
- a note with no connections gets an empty set.

**toggle**
- from off: a Highlight centered on the note, `lit` = the note ∪ its neighbours;
- on the center: off;
- on another note while on: recentered there, and any earlier add / remove is
  forgotten (build that history first, then prove it is gone).

**add / remove / extend**
- add lights exactly that note;
- remove dims exactly that note;
- remove on the center changes nothing — the center stays lit;
- extend lights the note and all its neighbours, **including one removed
  earlier**;
- none of them mutates the state passed in (keep a copy of `lit` before, compare
  after).

**prune**
- `null` stays `null`;
- center missing from `existing` → off;
- a lit non-center note missing → dropped, the rest untouched;
- nothing missing → the same center and lit set.

**menuFor**
- off: checked false, membership null, extend false;
- the center: checked true, membership null (no Remove), extend true;
- a lit note: checked false, membership `"remove"`, extend true;
- a dimmed note: checked false, membership `"add"`, extend true.

Assert the fields; do not `toEqual` the whole object.

**drawnLit**
- no folds: exactly the lit set;
- a lit note under one collapsed ancestor: the ancestor is in, the hidden note is not;
- nested folds (A collapsed, its descendant B collapsed, lit note under B): **A**
  is in — the outermost — and B is not;
- a lit note that is itself collapsed but not hidden: the note itself is in;
- a collapsed branch hiding nothing lit, and not lit itself: not in;
- `collapsed` may hold paths from other graphs or notes that no longer exist —
  they must not throw or light anything.

- [ ] **Step 1: Write the test file**

Import from `../src/mindmap/highlight` exactly the names in `shared/interfaces.md`.

- [ ] **Step 2: Run it to verify it fails for the right reason**

```bash
npx vitest run tests/mindmap-highlight.test.ts
```

Expected: FAIL because the module does not exist — not because of a typo or a
broken fixture. If a fixture-only sanity check can run (e.g. that the real-data
fixture builds and has the fold you expect), make sure that part is sound.

- [ ] **Step 3: Commit the red tests**

The suite is red by design here. This commit lands on the plan's feature branch
(`claude/highlight`), never on `main`; the branch only merges once T06 is green,
which is how the branch-colour triads squared the lock with "never commit red".
Say so in the body.

```bash
git add tests/mindmap-highlight.test.ts
git commit -m "test: Highlight rules, locked ahead of the module

Red by design: T02b implements against these.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git log -1 --stat
```

- [ ] **Step 4: Report**

List any question you escalated instead of pinning.
