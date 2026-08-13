# Task T08: Docs and checklist

## References
- Read: `../shared/architecture.md`
- Read: `../shared/conventions.md`
- Read: `../../knowledge/run-tests.md`
- Read: `../../knowledge/commit.md`
- Read: `docs/superpowers/manual-test-checklist.md`, section `## 1 — Dev vault: chat`
- Read: `docs/superpowers/plans/progress/2026-08-11-graph-buddy-plugin-checkpoint.md`,
  sections `## After the plan` and `## Suite state`

## Dependencies
- Depends on: T07 (chat wiring)
- Depended on by: — (none)

## Scope
**Files:**
- Modify: `docs/superpowers/manual-test-checklist.md`
- Modify: `docs/superpowers/plans/progress/2026-08-11-graph-buddy-plugin-checkpoint.md`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## A warning specific to this task

Everything under `docs/` is tested. `tests/docs-questions.test.ts` walks every markdown
file there and enforces the open/closed question convention. Run it after editing —
prose changes in this repo can turn the suite red.

## Positive Constraints (DO)
- Write the checklist items the way the existing ones are written: an instruction, an
  arrow, and what you should see. They are for a person at a keyboard, not for a script.
- Cover the cases a unit test cannot reach, which is the whole point of this file:
  cross-project, mid-turn navigation, and the announcement actually arriving.
- Update the suite count in `## Suite state` to whatever `npx vitest run` reports, and
  cite the commit you checked it at.

## Negative Constraints (DO NOT)
- Do NOT add a `## Open questions` or `## Closed questions` heading to either file. The
  docs test has opinions about both, and neither file needs one.
- Do NOT rewrite the plan under `docs/superpowers/plans/2026-08-11-graph-buddy-plugin.md`.
  It is build history and is meant to be out of date.
- Do NOT claim anything is verified that you have not actually clicked.

## Implementation Steps

- [ ] **Step 1: Add the manual checks**

At the end of `## 1 — Dev vault: chat` in `docs/superpowers/manual-test-checklist.md`,
add:

```markdown
- [ ] Open a note in this project holding at least one `- [ ]` → a third preset,
      **Current note questions**, appears at the end of the row. Open a note with
      none → it goes. Answer one of the questions in the editor and save → the
      preset survives while any remain and vanishes with the last one.
- [ ] With a chat bound to project A, open a note in project B → the preset is
      **not** offered, even though that note has open questions. A tab is bound to
      one project and never aims at another's notes.
- [ ] Press the preset → it is asked one question, in its own words, and then
      waits. Answer it → the question moves down into `## Closed questions` as a
      **Q.** / **A.** pair, and the next one is asked. Say "that's enough" → it
      stops without closing anything else.
- [ ] Ask something vague — "answer the second one", "what's still open here?" —
      while a note is open → it works on that note rather than sweeping the whole
      project.
- [ ] Switch notes and ask the same vague thing again → the answer follows you to
      the new note.
- [ ] Type a message while reading note A, send it during a running turn so it
      queues, then move to note B before the turn ends → when it goes out it is
      still about note A. This is the case the whole design turns on.
- [ ] Close every note in the project and ask something → it works from the graph
      as a whole rather than still answering about the note you closed.
- [ ] Look at the transcript throughout → your messages read exactly as you typed
      them. The note line is plumbing and never appears.
```

- [ ] **Step 2: Run the docs suite**

Run: `npx vitest run tests/docs-questions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: Record it in the checkpoint**

In `docs/superpowers/plans/progress/2026-08-11-graph-buddy-plugin-checkpoint.md`, add a
bullet at the end of the `## After the plan` list:

```markdown
- **The chat follows the note you are reading.** A message carries the note it was
  composed against; the panel tells the interviewer which note that is on the first
  message and again whenever it changes, and `system.md` says to resolve what the
  user says against that note before widening. A third preset, **Current note
  questions**, appears in the composer row when the open note belongs to this tab's
  project and still owes an answer, and walks its `## Open questions` one at a time.
  Designed in `docs/superpowers/specs/2026-08-13-current-note-behaviour-design.md`.
  The open-question counter moved out of `src/mindmap/heat.ts` to
  `src/open-questions.ts`, since the map and the composer now both count.
```

- [ ] **Step 4: Update the suite state**

Run: `npx vitest run` and read the count off the summary. Then update the first line of
`## Suite state` with that number and the commit you are about to make — for example:

```markdown
407/407 tests green (`<sha>`, checked 2026-08-13); `tsc --noEmit` clean. At the
```

Leave the rest of that paragraph alone.

- [ ] **Step 5: Run the whole suite one last time**

Run: `npx vitest run`
Expected: PASS, everything, with the count you just wrote down.

Run: `npm run oracle && git diff --exit-code tests/expected`
Expected: no diff. Nothing in this feature touches the ported core, and this proves it.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/manual-test-checklist.md docs/superpowers/plans/progress/2026-08-11-graph-buddy-plugin-checkpoint.md
git commit -m "docs: the checklist picks up the note the chat is following"
```

Remember the `Co-Authored-By:` trailer from `../shared/conventions.md`.

## Acceptance Criteria
- [ ] `npx vitest run` passes in full and the checkpoint's count matches it
- [ ] `npm run oracle && git diff --exit-code tests/expected` shows no diff
- [ ] The checklist covers the cross-project case and the queued-message case
- [ ] Neither edited file gained a questions heading
- [ ] No files outside Scope were modified
