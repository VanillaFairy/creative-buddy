# Graph-Buddy execution checkpoint

Plan: `docs/superpowers/plans/2026-08-11-graph-buddy-plugin.md`

Branch, while the plan was running: `feature/graph-buddy` (worktree
`.worktrees/graph-buddy`), with task worktrees branching off it as
`task/t<N>-<slug>` and merging back after review. **All of that is gone now** —
the work merged to `main` at task 24 and the branches and worktrees were cleaned
up. `main` is the only branch, there is no remote, and work since has been
committed straight to it.

## Status ledger

| Task | Status | Notes |
|---|---|---|
| 1 scaffold | ✅ merged (91d68db) | TS 7.0.2 works; js-yaml 5.2.3 bundled types confirmed at first import (T4); spec review ✅; quality review N/A (config-only — covered by spec reviewer's live verification) |
| 2 fixtures+oracle | ✅ merged (7422971) | All bucket counts/problem lists matched intent on first generation; reproducibility verified twice; spec review ✅ |
| 3 py-compat | ✅ merged (e0ace00) | Spec review found 2 real bugs (JS Date 0–99 year fold in parseIsoDate; unpadded year in isoDate) + VaultView coverage gap — all fixed, re-verified. Implementer also caught an inverted assertion in the PLAN itself (verified vs live Python) |
| 4 frontmatter | ✅ merged (8ad9436) | Byte-identical parity probes vs Python on 8 edge cases incl. the BOM/pyStrip subtlety; js-yaml 5 bundled types work |
| 5 notes | ✅ merged | Accepted deviation: links from frontmatter-excised body |
| 6 discovery | ✅ merged | 78/78 after merge; implementer verified walk asymmetry vs both oracle scripts |
| 11 openTasks | ✅ merged (e27053b) | Spec review caught the CRLF divergence (split("\n") vs splitlines) — empirically shown to drop ALL tasks in CRLF files; fixed to self-normalize |
| 12 grading | ✅ merged | 84/84 after merge; line-for-line Python parity confirmed by implementer |
| 15 permissions | ✅ merged (32afaec) | Spec review ✅ incl. adversarial probes: traversal, prefix-confusion, UNC all fail closed |
| 20 transcript | ✅ merged | Pure reducer, exhaustive-switch clean |
| 7–10 validation chain | ✅ merged (f3b85d0) | Oracle equality first-run on all five fixtures; graphStats probed vs --tree |
| 13 register | ✅ merged | Oracle-equal all fixtures; tuple-type annotation fix |
| 14 GraphModel | ✅ merged | rootName/hubPathOf accessors added for mindmap |
| hardening | ✅ merged (f9fbecd) | pyStrip control chars, single boundary rule, markdownFiles Windows sort — batch-review findings |
| 16 prompts | ✅ merged (d6cabc1) | system.md adapted; stitch note; accepted micro-deviation (duplicate-name paragraph) |
| 17 AgentService | ✅ merged | Opus implementer; canUseTool fail-closed + abort listener, env sanitization, contract hooks, done()-is-teardown semantics |
| 18 settings+wiring | ✅ merged | claude-locator, GraphBuddySettingTab health check, GraphBuddyPlugin model seeding + vault events |
| M1 milestone review | ✅ closed | Opus review found 1 Important (comparePathSegments must casefold — verified vs live Python) + 8 minor; fixed in dfd66fd + 0bb9914, merged a8ce91f; oracle equality on all 5 fixtures, 161/161 |
| 19 live smoke | ✅ merged (be3c7e2) | Live green on subscription auth (apiKeySource: none, $0.03/run); Task tool name confirmed "Task"; found the connector-leak issue below |
| connector-leak fix | ✅ ffd1f71 | T19 saw ~75 mcp__claude_ai_* connector tools in the session despite settingSources: []; strictMcpConfig: true closes it — live-verified tool surface is exactly the 6 contract tools |
| 21 ChatView | ✅ merged (e8e699e) | All 5 deltas applied; +1 transcript TDD test; 9 self-review findings logged (fed into polish + M3 review) |
| chat quick fixes | ✅ 9bb99cb | NODE_ENV define (React prod build, main.js 3.4MB→2.3MB); approvalSeq seeded from restored items |
| 22 mindmap layout | ✅ merged (9d1e737) | All 3 deltas applied; implementer simplified further — public GraphModel accessors instead of hand-built VaultView; 169/169 |
| 23 MindmapView | ✅ merged (fbfc481) | Plan's links() typing was real drift (fixed in flextree.d.ts); headless esbuild probe of the flextree call; pan/zoom + zero-height fixes followed (7299742) |
| M2 milestone review | ✅ closed | Opus found 2 Critical (C1 .obsidian auto-allow with vault-root graph; C2 allowedTools made the read gate dead code), 4 Important (digest injection, silent session death, symlink lexicality, env gaps), 16 minors |
| M2 hardening | ✅ merged (e2b4efa) | ab3a0bc + c526662. All Criticals+Importants except symlink-realpath (deferred, noted below). THREE live-run discoveries: relative targets must resolve against cwd; drive-relative \\x paths bounce to the model with a correction (deny, not ask); no-surface approvals fail closed. Live smoke green: zero approval cards, "Smoke done", apiKeySource none |
| M3/M4 milestone review | ✅ closed | Opus: 0 Critical, 4 Important (all lifecycle: model-ready cb outlives view, picker dead end while indexing, dead-session approval cards lie, badge broken on deferred leaves), rich minors, triage of 6 known items |
| M3/M4 review fixes | ✅ ccb8e0e | All 4 Importants + fix-now triage (tool-input trim, layout-change badge, rebind guard) + minors (wrap-up out of render, onStatus indicator, promise handling, ghost graphDir, panel title, alt-click tooltip) |
| 24 docs+finish | ✅ done | README + checklist committed (950ebeb); full verification green on final head incl. live smoke; KB promoted (7c43ceb); merged to main (5152a10) and re-verified there. Worktree + branch kept for the user's manual checklist |

## Protocol adaptations (recorded deviations)

- Per-task code-QUALITY reviews are folded into (a) spec reviews that read every line against the plan (whose code I authored and self-reviewed), plus (b) thorough milestone-checkpoint code reviews on Opus over the whole milestone diff. Rationale: most implementations are verbatim-from-plan; a third per-task reviewer over just-spec-reviewed verbatim code duplicates effort. Novel-logic tasks (17, 21, 23) get true per-task quality reviews.
- Reviews so far: T1 (sonnet, live-verified), T2 (sonnet, regenerated oracle to prove reproducibility), T15 (sonnet + adversarial probes).

## Knowledge added

- `knowledge/run-tests.md`, `regen-oracle.md`, `typecheck-build.md`, `commit.md` (Task 1).
- Machine facts: interpreter is `python` (C:\Python314, pyyaml present); `npm ci` per worktree before tests; a user-global git hook prints `ERROR: Failed to parse repository information` on every commit — harmless noise, commits land fine; `tests/expected/*.json` are CRLF on disk via Python write_text but LF in git (autocrlf attribute) — do not "fix"; `__pycache__/` gitignored (a1bda1f).

## After the plan

The ledger above stops where the plan did. Work carried on directly on `main`,
so the code has moved past what the plan describes — enough that the plan should
be read as build history, not as a picture of the current app. What landed
since, in order:

- **The obligations register was removed** (`fde6f27`). Tasks 11, 12 and 13 built
  a graded OWED/GAP/LOOK UP/PARKED scanner, a per-graph digest handed to the
  interviewer at session start, and an "Obligations · all graphs" panel on the
  map. All of it is gone, along with `oracle/obligations.py` and its fixtures.
  Anything in the plan or the design spec about obligations describes code that
  no longer exists.
- **One ribbon icon per panel, and panels reveal instead of stacking**
  (`c42e8fd`), **conversations became tabs inside one chat panel** (`04c1c62`).
- **Chat and map open on the note you are standing in** (`2493019`, `fd0c51a`),
  with a picker that lists projects rather than folder paths (`f39fdf7`).
- **Composer work**: a message typed mid-turn queues and waits its turn
  (`6ddee71`), one reading size across the column (`26fe27c`), and the line above
  the composer is a resize handle (`30244e6`).
- **Clicking a name in a reply opens the note** (`db8ca41`).
- **The map heatmap** — a Heat switch colours nodes by the questions they still
  owe, and a folded node splits at a divider into its own heat beside the heat of
  what it hides (`16ef30c`, `319a281`, `a8a864d`). This closed out the only item
  the feature backlog held.
- **Dialog presets under the composer** (`c5447a7`) — a collapsible row holding
  two canned openings, *Ask me* and *Summarize*. A preset goes out through the
  same `onSend` as Enter, so it queues, records and stops like anything you
  typed; the texts live in `assets/prompts/presets/`. Neither preset reads the
  graph on the plugin side: the interviewer sweeps for `- [ ]` itself, which
  keeps the composer clear of `GraphModel` and honours system.md's rule against
  loading the whole graph. Whether the row is collapsed is panel state, restored
  by `restorePresetsOpen` — the one decision here with a test.
- **One name per thing** (`b8654a3`, `670c863`, `7911d7f`) — the interviewer's
  structural vocabulary is fixed now rather than implied. `system.md` gained a
  `## One name per thing` section: four reserved headings (`## Charter` and
  `## Shape`, hub-only; `## Open questions` and `## Closed questions`, any note)
  and a glossary pinning one name to each concept. Answering a question no longer
  ticks the box — the `- [ ]` moves down into `## Closed questions` as a
  bold-question / plain-answer paragraph, one pair per paragraph. `grill.md` step
  4 had been instructing the old behaviour outright ("Tick anything the answer
  just answered"), which is why a live graph had drifted into crossed-out answers
  shuffled among the questions still open. `tests/prompts.test.ts` now scans every
  shipped prompt asset's prose for retired names, and `tests/docs-questions.test.ts`
  checks the paired shape instead of the old two-paragraph one. `docs/` was
  reformatted to match, so the two corpora cannot teach different conventions.
  A later pass added the disappearing rule: a questions heading exists only while
  it has lines under it, so closing the last `- [ ]` takes `## Open questions`
  with it in the same edit. The check is style-aware — graph notes write open
  questions as `- [ ]` boxes because the map counts them, `docs/` as plain
  bullets, so it asks for a bullet of either kind rather than a checkbox.

  **`## Closed questions` did not survive the day.** It was built, applied across
  a live graph, and then retired the same afternoon in favour of the rule already
  written a few sections up: an answered question's answer becomes an ordinary
  statement in the note, and the question simply goes. Keeping the pair as well
  was the "record of every wobble" that "Changing your mind" exists to forbid.
  The fourth reserved heading is `## Ideas to explore` now — plain bullets,
  nothing counting them, nothing owed. `docs/` still keeps a Closed questions
  section of its own, and `tests/docs-questions.test.ts` still guards its shape:
  a decisions record is a different artifact from a graph note, and this is the
  one place the two corpora are deliberately allowed to differ.
- **The chat follows the note you are reading** (`061a104`…`dde07b7`, planned in
  `docs/superpowers/plans/2026-08-13-current-note-behaviour/`, spec in
  `docs/superpowers/specs/2026-08-13-current-note-behaviour-design.md`). One
  channel carries it: every outgoing message is stamped with the note it was
  *composed* against, and `pump` prepends a line naming that note only when the
  conversation has not already been told — so a message queued behind a turn
  still means the note you wrote it about, however far you have wandered by the
  time it goes. `system.md` gained the rule that what the user says resolves
  against that note first. A third preset, **Current note questions**, appears
  when the open note belongs to this tab's project and still owes an answer, and
  walks its `## Open questions` one at a time; the count decides only whether the
  button exists and never reaches the model. `countOpenQuestions` moved out of
  `src/mindmap/heat.ts` to `src/open-questions.ts`, since the map and the
  composer now both count and must not disagree. The decisions are in
  `note-context.ts`, `presets.ts`, `queue.ts` and `open-questions.ts`, all
  tested; `ChatView` and `components.tsx` only pass things along.

  Executed as eight tasks across three waves of subagents, each reviewed in two
  stages. Every implementation was approved unchanged — all four defects the
  reviews caught were in the plan, not the code: a preset that told the
  interviewer to close questions on the user's behalf against `system.md`'s
  absolute rule, two assertions that guarded each end of a contract but not the
  contract, a test that could not fail on the bug beside it, and an image in a
  project folder counting as the note you are reading. Wave-by-wave detail is in
  `docs/superpowers/plans/progress/2026-08-13-current-note-behaviour-checkpoint.md`.
- **Effort, and Fable in the model list** (2026-09-05). The plugin had never set
  the SDK's `effort` option, so every session ran at whatever the CLI defaults
  to. There is now a `defaultEffort` setting seeding new conversations and a
  second quiet control beside the model picker, changeable mid-thread and
  surviving a restart. `src/agent/effort.ts` owns the one rule underneath:
  which levels a model honours, and what a stored value means on a model that
  honours none. Haiku 4.5 has no effort control at all, so it shows no picker
  and the CLI is told to clear the level — while the conversation keeps the
  level you chose, so moving back off Haiku restores it. The live session owns
  the coupled pair: `setModel` and `setEffort` both re-answer what this model
  may be told. Design: `docs/superpowers/specs/2026-09-05-effort-setting-design.md`.

## Suite state

430/430 tests green (checked 2026-09-05, after the effort work above);
`tsc --noEmit` clean and `npm run build` writing a 2.53MB bundle. Live smoke
green on that change, plus one throwaway paid run on `claude-sonnet-5` at
`effort: "low"` — the committed smoke runs on Haiku, which exercises the
branch that *omits* effort and so proves nothing about the new option
reaching the CLI. At the plan's last merge (`e2b4efa`) it
was 192/192 with the build clean at ~2.4MB and live smoke green over 3 paid runs,
≤ $0.02 each.

The current-note work is verified by tests and by review only — the manual pass
in `docs/superpowers/manual-test-checklist.md` has **not** been run against it,
and nothing has been deployed to a vault.

## Open items

Re-checked against the code on 2026-08-13. Still open:

4. `interrupt()` ignores the SDK receipt (`still_queued`); Stop clears busy
   optimistically. The composer work built cancellation semantics on top of this
   (a stopped turn flips anything queued behind it to *canceled*) without
   changing the underlying receipt handling — `ChatView.tsx:440` still drops it.
6. Symlink/junction escape stays lexical in `permissions.ts` (M2 review I3): a
   realpath check in AgentService was deferred — needs fs plumbing and a design
   sentence about mounted folders. No `realpath` anywhere in the agent layer yet;
   the README documents the limitation as a caution to users.
7. d3-flextree's prebuilt CJS bundle inlines d3-hierarchy v1 next to our v3
   (dead weight, harmless).
8. **The per-turn cost line may be showing the running session total.** Suspected
   2026-08-13, not yet confirmed against a live session. The SDK reference
   (`research/2026-08-11-agent-sdk-reference.md`, "Cost/token accounting") states
   that `total_cost_usd` is cumulative across turns in a streaming-input session
   — which is the mode `AgentService` runs in (`agent-service.ts:210` passes a
   message channel as the prompt). That value goes straight through
   `agent-service.ts:314` → `ChatView.tsx:324` → the transcript's `result` item,
   and `components.tsx:356` renders it as `turn done · $X.XX`, which reads as
   what *this turn* cost. If the reference is right, every rule after the first
   overstates the turn and the last one is really the conversation's total.
   Two turns on Haiku settle it: a second rule showing roughly double the first,
   on a similar-sized question, means cumulative. The fix would be to keep the
   previous total per conversation and render the difference — leaving the
   cumulative figure available, which is exactly what the cost-threshold item in
   `docs/TODO.md` needs. Confirm this before building that feature on top of it.

Closed since:

1. **Tool inputs are no longer persisted.** `transcript.ts:118` drops the input
   deliberately — it carries whole note bodies — and `restoreItem` strips the
   blob off any item written before that, so old workspaces heal on load.
2. **The duplicate-tab badge recomputes on layout change.** `ChatView.tsx:102`.
3. **A rebound conversation disposes its live session.** `ChatView.tsx:87` drops
   any runtime whose `graphDir` changed under it, so a handle cannot outlive the
   graph it was writing into.
5. **The obligations panel is gone with the rest of the register** (`fde6f27`).

## Out-of-band

- Vendored oracle carries the misfiled() ring-termination fix (20500c2) — empirically confirmed the unpatched script hangs; user has a chip to port the fix to the live vault script (task_828970ca).
