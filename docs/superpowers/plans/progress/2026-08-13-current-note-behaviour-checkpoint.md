# Note-Specific Behaviour — execution checkpoint

Plan: `docs/superpowers/plans/2026-08-13-current-note-behaviour/plan.md`
Spec: `docs/superpowers/specs/2026-08-13-current-note-behaviour-design.md`
Branch: `feat/current-note-behaviour`, off `main` at `bb05fa6`.

## Wave 1 — done, reviewed, merged

Five tasks, no shared files, run in parallel in five git worktrees. Every one was
implemented by Claude Sonnet 5 and reviewed by Claude Opus 5 in two stages — spec
compliance first, then code quality. **All five APPROVED with no changes requested.**

| Task | Commit | What landed |
| --- | --- | --- |
| T01 | `5af2d74` | `countOpenQuestions` moved from `src/mindmap/heat.ts` to `src/open-questions.ts`; `heat.ts` keeps the palette |
| T02 | `5e78b11` | `src/chat/note-context.ts` — `noteAnnouncement`, seven-row truth table |
| T03 | `71fe005` | `Outgoing.note`, and `advance()` carrying it rather than rebuilding without it |
| T04 | `1bf18d9` | `visiblePresets` + `assets/prompts/presets/current-note-questions.md` |
| T05 | `d7f35e3` | The open-note rule in `assets/prompts/system.md` + its guard test |

Suite after merge: **402 green**, `tsc --noEmit` clean.

### What the reviews actually caught

Three findings, all of them defects in **the plan** rather than in the implementations.
Fixed after the merge in `1c1dc54` and `e8eded7`:

- **The preset told the interviewer to close questions on the user's behalf.**
  `current-note-questions.md` said to "say so and close them" for questions already
  answered in a note's body. `system.md` is absolute the other way — a question closes
  because the user answered it, never otherwise. It offers now, matching the idiom
  already in `summarize.md` ("offer to redraw it; leave it alone unless I say yes").
- **The prompt rule and the line it quotes were guarded separately.** Rewording either
  end would have left `system.md` describing a line that no longer arrives, with every
  test still green. `tests/prompts.test.ts` now derives the assertion from
  `noteAnnouncement` itself. Verified by mutation: change the string, the test fails.
- **One of T03's four new tests could not fail on the bug it sits beside.**
  `send?.note` reads `undefined` whether the field is carried or dropped, and vitest
  does not typecheck. Kept — it pins "advance invents no default note" — but recorded
  here as decorative for the bug it was written next to.

### One trap, hit twice

Prompt assets are prose and therefore soft-wrapped, while the tests assert on them with
literal `toContain`. A phrase that straddles a line break fails even though the model
reads the file identically. The T05 implementer hit it transcribing the plan; the
supervisor hit it again immediately afterwards while tidying the same paragraph. Those
assertions now compare against flattened whitespace, which removes the trap rather than
documenting it.

## Wave 2 — done, reviewed, merged

T06, `plugin.activeNoteIn(graphDir)`, commit `5e500a3`. **APPROVED.**

Its reviewer found a wart the spec had not considered: graph ownership is decided on
the path alone, so a picture sitting in a project folder counts as belonging to the
graph. The method would have answered `{path: "graph/cover.png", openQuestions: 0}` —
the preset stays hidden, but the announcement would have told the interviewer it was
looking at a note and handed it a path it cannot read. Closed in `061a104` with the
same `.md` test `buildModel` indexes by.

## Wave 3 — done, reviewed, merged

T07, the chat wiring, commit `b5484c9`. **APPROVED**, on the longest review of the run —
it re-derived the queued-message trace from the code, walked the four `announced`
transitions by hand, and tried to break the `model.onChange` guard from both directions
without success. Two of its three minor items were acted on in `dde07b7`:

- **`onEnd` and reload disagreed about re-announcing.** A crash kept `announced` while a
  reload dropped it, on a rationale — a resumed session may have been compacted — that
  does not distinguish the two. The rule is now stated once and followed by both: a
  fresh process is told again.
- **`refreshNoteContext` had landed under the `── links out of the transcript ──`
  header**, where it is derived view state filed under link resolution. Moved up beside
  the state it derives from. No behaviour.

Its third item was for the human, not the code: deep into a long session the interviewer
may ask which note is meant, because the note is announced on change rather than on
every message and a compacted context can lose it. That is the design, and the manual
checklist now says so, so it gets recognised rather than filed as a bug.

T08 — the manual checklist and the project's status doc — was written by the supervisor
rather than dispatched, since its content is what the reviews changed and only this
session knew that.

## State at the end

- 8/8 tasks done, all reviewed, all merged into `feat/current-note-behaviour`.
- **403 tests green**, `tsc --noEmit` clean, `npm run build` writing 2.52MB,
  `npm run oracle` showing no drift in `tests/expected`.
- **The manual pass has not been run and nothing has been deployed to a vault.**
  That is the one thing still owed, and it needs a human.

## Protocol adaptations (recorded deviations)

- **Task specs were read from the worktree, not pasted into prompts.** The skill's
  template says to paste plan text so an agent never hunts for its spec. The plan is
  committed and present in every worktree, so each agent got exact absolute paths
  instead — five agents reading four small files beats re-emitting the same shared
  context five times. No agent reported trouble finding anything.
- **Two agents looked for `knowledge/run-tests.md` under the plan directory** and
  reported it missing. The reference `../../knowledge/…` resolves correctly to
  `docs/superpowers/plans/knowledge/`, which is shared across plans — nothing is
  broken, but repo-root-relative paths in task files would have saved the confusion.
- **Reviews ran as one agent per task covering both stages in order**, rather than two
  agents per task. Proportionate to tasks whose literal code was supplied by the plan;
  the ordering rule (spec compliance before code quality) was kept.
- **`docs/superpowers/plans/knowledge/commit.md` names Claude Fable 5 in its example
  trailer.** Three agents flagged it. `CLAUDE.md` governs — the trailer names whichever
  model actually wrote the code — but the example invites literal copying.
