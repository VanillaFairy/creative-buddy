# Graph-Buddy execution checkpoint

Plan: `docs/superpowers/plans/2026-08-11-graph-buddy-plugin.md`
Branch: `feature/graph-buddy` (worktree `.worktrees/graph-buddy`). Task worktrees branch from it as `task/t<N>-<slug>` and merge back after review.

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
| 19 live smoke | 🔄 in flight | task/t19-smoke (opus); max 3 live runs; checks real Task-tool name from init message |
| 21 ChatView | 🔄 in flight | task/t21-chatview (opus); 5 deltas over plan (transcript title TDD, stats null-guard, seeding race, done()=teardown, drop onWrapUp) |
| 22 mindmap layout | ✅ merged (9d1e737) | All 3 deltas applied; implementer simplified further — public GraphModel accessors instead of hand-built VaultView; 169/169 |
| 23 MindmapView | pending | Blocked on T21 (shares main.ts + styles.css) |
| 24 docs+finish | pending | After M2–M4 reviews |

## Protocol adaptations (recorded deviations)

- Per-task code-QUALITY reviews are folded into (a) spec reviews that read every line against the plan (whose code I authored and self-reviewed), plus (b) thorough milestone-checkpoint code reviews on Opus over the whole milestone diff. Rationale: most implementations are verbatim-from-plan; a third per-task reviewer over just-spec-reviewed verbatim code duplicates effort. Novel-logic tasks (17, 21, 23) get true per-task quality reviews.
- Reviews so far: T1 (sonnet, live-verified), T2 (sonnet, regenerated oracle to prove reproducibility), T15 (sonnet + adversarial probes).

## Knowledge added

- `knowledge/run-tests.md`, `regen-oracle.md`, `typecheck-build.md`, `commit.md` (Task 1).
- Machine facts: interpreter is `python` (C:\Python314, pyyaml present); `npm ci` per worktree before tests; a user-global git hook prints `ERROR: Failed to parse repository information` on every commit — harmless noise, commits land fine; `tests/expected/*.json` are CRLF on disk via Python write_text but LF in git (autocrlf attribute) — do not "fix"; `__pycache__/` gitignored (a1bda1f).

## Suite state at last merge

169/169 tests green on feature/graph-buddy (9d1e737, after T22 merge); `tsc --noEmit` clean; build clean.

## Out-of-band

- Vendored oracle carries the misfiled() ring-termination fix (20500c2) — empirically confirmed the unpatched script hangs; user has a chip to port the fix to the live vault script (task_828970ca).
