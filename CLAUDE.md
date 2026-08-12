# Creative Buddy — Obsidian plugin

Conversational knowledge-graph interviewer (chat tabs + live mindmap) running on the
user's Claude Code subscription via the Claude Agent SDK. Renamed from "graph-buddy"
2026-08-12; historical docs under `docs/superpowers/` keep the old name.

## Architecture (one direction of truth: files are the state)

- `src/graph/` — deterministic core, **no Obsidian imports, no AI**. A line-faithful
  TypeScript port of the two vendored Python scripts in `oracle/`.
- `src/agent/` — Claude Agent SDK boundary: permission table (`permissions.ts`),
  prompt stitching, `AgentService`. Fail-closed by design.
- `src/chat/`, `src/mindmap/` — thin `ItemView` shells + React. **Manual-test only,
  by design** — decision logic must live in pure TDD'd modules (`transcript.ts`,
  `layout.ts`), never in the shells.
- `src/main.ts` — plugin wiring, vault-event → GraphModel feed.

## The oracle discipline (load-bearing)

- `oracle/*.py` is the behavioral contract; `tests/expected/*.json` are machine-generated.
- `npm run oracle && git diff --exit-code tests/expected` must stay clean.
- Do NOT "fix" Python-parity oddities (casefolded Windows sorts, BOM asymmetry,
  `pyStrip` char set, code-point compares) without checking the Python first —
  they are deliberate, tested equivalences.

## Commands

- `npx vitest run` — full suite (live test excluded). Single file: `npx vitest run tests/<f>.test.ts`
- `npm run build` — typecheck + esbuild production bundle (`main.js`)
- `npm run oracle` — regenerate expected JSON (needs `python`, 3.14 with pyyaml)
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
- Commit format: `type: subject` (feat/test/chore/fix/docs) + trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Never commit red tests.

## Deeper context

- `.claude/knowledge/` — project KB (commands, conventions, gotchas).
- `docs/superpowers/plans/2026-08-11-graph-buddy-plugin.md` + `plans/progress/…checkpoint.md`
  — full build history, locked porting decisions, open items.
- `docs/superpowers/manual-test-checklist.md` — the user's manual verification pass.
