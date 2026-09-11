# Creative Buddy — Obsidian plugin

Conversational knowledge-graph interviewer (chat tabs + live mindmap) running on the
user's Claude Code subscription via the Claude Agent SDK. Renamed from "graph-buddy"
2026-08-12; historical docs under `docs/superpowers/` keep the old name.

## Architecture (one direction of truth: files are the state)

- `src/graph/` — deterministic core, **no Obsidian imports, no AI**. A line-faithful
  TypeScript port of the vendored Python in `oracle/`. `hierarchy.ts` is the
  load-bearing one: **the folder tree is the hierarchy**. A folder holding a
  note of its own name is a **branch** and that note is its **branch note**;
  everything in the folder hangs off it, and a folder without one is a plain
  folder whose notes pass up to the nearest branch above. Nothing reads a
  `parent:` field; there is no second opinion to reconcile, so nothing can be
  orphaned, cycle, or be misfiled, and two notes may share a name in different
  folders.
- `src/agent/` — Claude Agent SDK boundary: permission table (`permissions.ts`),
  prompt stitching, `AgentService`. Fail-closed by design.
- `src/chat/`, `src/mindmap/` — thin `ItemView` shells + React. **Manual-test only,
  by design** — every decision belongs in a pure TDD'd module beside the shell,
  never in the shell. Chat has `transcript.ts`, `sessions.ts`, `queue.ts`,
  `activity-groups.ts`, `links.ts`, `composer-size.ts`, `scroll-anchor.ts`; the
  map has `layout.ts`, `geometry.ts`, `heat.ts`, `radial.ts`, `bands.ts`. When a view grows a new rule,
  the rule gets its own module and its own test — that is the pattern, not a
  historical accident.
- `assets/prompts/` — the interviewer's behaviour: `system.md` + `grill.md` +
  `consult.md`, stitched into one document by `src/agent/prompts.ts`. This is
  where conversational conventions are defined (the `- [ ]` open-question rule
  that `src/mindmap/heat.ts` counts, for one), so read it before changing
  anything about how the interviewer is meant to behave.
- `src/main.ts` — plugin wiring, vault-event → GraphModel feed.

## The oracle discipline (load-bearing)

- `oracle/graph_check.py` is the behavioral contract; `tests/expected/*.json` are
  machine-generated. It draws a graph's shape rather than checking it — the five
  structural checks it used to run cannot be expressed once folders are the
  hierarchy — so what the fixtures pin is the **tree both implementations must
  agree on**, ordering included. Change the Python first, then the TypeScript.
- `npm run oracle && git diff --exit-code tests/expected` must stay clean.
- Do NOT "fix" Python-parity oddities (casefolded Windows sorts, BOM asymmetry,
  `pyStrip` char set, code-point compares) without checking the Python first —
  they are deliberate, tested equivalences.

## Commands

- `npx vitest run` — full suite (live test excluded). Single file: `npx vitest run tests/<f>.test.ts`
- `npm run build` — typecheck + esbuild production bundle (`main.js`)
- `deploy.bat [target]` — copy `main.js` + `manifest.json` + `styles.css` into
  the vault's plugin folder, overwriting. Prints build timestamps; never
  touches `data.json`. Build first — it refuses to deploy a missing bundle.
- `npm run oracle` — regenerate expected JSON (needs `python`; no third-party
  packages since the checks went)
- `npm run test:live` — one REAL subscription session, costs a few cents. Run it
  after any change to `src/agent/agent-service.ts` options or `permissions.ts`
  decisions — unit fakes have repeatedly missed real CLI behavior there.

## Gotchas

- Every `git commit` prints `ERROR: Failed to parse repository information` twice —
  user-global hook noise, harmless; verify with `git log`.
- The `import.meta.url` define+banner in `esbuild.config.mjs` is load-bearing (the
  bundled SDK throws at require-time without it); same for the `NODE_ENV` define
  (React prod build). Do not remove either.
- `tests/expected/*.json` are LF in git; a full-file diff usually means line endings.
- `src/mindmap/layout.ts` holds two literal NUL bytes (a separator inside the
  cross-link dedup key), so **git treats it as binary** — commits touching it
  show `Bin 4656 -> 5913 bytes` and no line diff. Nothing is broken; just don't
  expect to review that file's history from the diff.
- Docs are tested. `tests/docs-questions.test.ts` walks every `.md` under `docs/`:
  an answered question moves down to a `## Closed questions` section as a
  `**Q.**` / `**A.**` pair rather than being struck through in place, and a
  `Closed questions` section must alternate Q, A all the way down. Editing docs
  can turn the suite red, so run the tests after a docs change too.
- Commit format: `type: subject` (feat/test/chore/fix/docs) + a
  `Co-Authored-By:` trailer naming **the model that actually wrote it**
  (`Claude Opus 5 <noreply@anthropic.com>`, `Claude Fable 5 …`). Never commit
  red tests.

## Deeper context

- `.claude/knowledge/` — project KB (commands, conventions, gotchas).
- `docs/TODO.md` — feature backlog: wanted but not yet planned.
- `plans/progress/…checkpoint.md` — **the living status doc.** Task ledger, what
  has shipped since the plan finished, and the defects still open. Start here.
- `docs/superpowers/plans/2026-08-11-graph-buddy-plugin.md` — the original plan:
  build history and locked porting decisions, but **not** a description of the
  app today. Same for the specs beside it.
- Beware one trap in those: they specify an **obligations register** (a graded
  OWED/GAP/LOOK UP/PARKED scanner, a session-start digest, a map panel) that was
  built and then removed whole in `fde6f27`. It is not missing, it is deliberately
  gone — do not restore it from the plan. The map's Heat switch is what answers
  "where does this graph still owe me thinking?" now.
- `docs/superpowers/manual-test-checklist.md` — the user's manual verification pass.
