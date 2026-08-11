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
| 5 notes | 🔄 in flight | task/t5-notes |
| 6 discovery | ✅ merged | 78/78 after merge; implementer verified walk asymmetry vs both oracle scripts |
| 11 openTasks | ✅ merged (e27053b) | Spec review caught the CRLF divergence (split("\n") vs splitlines) — empirically shown to drop ALL tasks in CRLF files; fixed to self-normalize |
| 12 grading | ✅ merged | 84/84 after merge; line-for-line Python parity confirmed by implementer |
| 15 permissions | ✅ merged (32afaec) | Spec review ✅ incl. adversarial probes: traversal, prefix-confusion, UNC all fail closed |
| 20 transcript | ✅ merged | Pure reducer, exhaustive-switch clean |
| 7–10 validation chain | next | Sequential (all append to validation.ts); starts when 5 merges |
| 13 register, 14 GraphModel | pending | 13 needs 6+12 (ready when dispatched); 14 needs 10+13 |
| 16–19 (M2), 21–24 (M3–M5) | pending | Per plan wave schedule |

## Protocol adaptations (recorded deviations)

- Per-task code-QUALITY reviews are folded into (a) spec reviews that read every line against the plan (whose code I authored and self-reviewed), plus (b) thorough milestone-checkpoint code reviews on Opus over the whole milestone diff. Rationale: most implementations are verbatim-from-plan; a third per-task reviewer over just-spec-reviewed verbatim code duplicates effort. Novel-logic tasks (17, 21, 23) get true per-task quality reviews.
- Reviews so far: T1 (sonnet, live-verified), T2 (sonnet, regenerated oracle to prove reproducibility), T15 (sonnet + adversarial probes).

## Knowledge added

- `knowledge/run-tests.md`, `regen-oracle.md`, `typecheck-build.md`, `commit.md` (Task 1).
- Machine facts: interpreter is `python` (C:\Python314, pyyaml present); `npm ci` per worktree before tests; a user-global git hook prints `ERROR: Failed to parse repository information` on every commit — harmless noise, commits land fine; `tests/expected/*.json` are CRLF on disk via Python write_text but LF in git (autocrlf attribute) — do not "fix"; `__pycache__/` gitignored (a1bda1f).

## Suite state at last merge

26/26 tests green on feature/graph-buddy (a1bda1f); `tsc --noEmit` clean; build clean.

## Out-of-band

- Vendored oracle carries the misfiled() ring-termination fix (20500c2) — empirically confirmed the unpatched script hangs; user has a chip to port the fix to the live vault script (task_828970ca).
