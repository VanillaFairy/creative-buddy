# src/agent

## PURPOSE

The Claude Agent SDK boundary. Every decision that could let the interviewer
touch something it should not is made here, in pure code (`permissions.ts`,
`effort.ts`, `prompts.ts`), and `agent-service.ts` does nothing but map those
decisions onto SDK options, hooks and callbacks. Fail-closed by design.

## KEY ABSTRACTIONS

- The tool contract is spelled out in **three** places that must be edited
  together, and no type ties them: `CONTRACT_TOOLS` (the `tools` option *and*
  the `preToolUse` hook's allowlist), `READ_TOOLS`/`WRITE_TOOLS` inside
  `decideToolUse`, and that function's trailing catch-all deny. A tool added to
  one and not the others is either dead or ungoverned.
- `decideToolUse` is total over `(tool, input, ctx)` and knows nothing about the
  SDK, so it reads as the whole approval story. It is not: an entry in the
  `allowedTools` option auto-approves *before* `canUseTool` runs, so a name
  added to `AUTO_ALLOWED` silently deletes that tool's branch of the table.

## RESOURCE LIFECYCLE

`AgentService.start` returns a `SessionHandle` that owns a child `claude.exe`.
`dispose()` resolves every pending approval as denied and closes the query;
`onEnd` fires only when the stream ends on its own. `ChatView` holds one handle
per conversation key and must dispose it when a conversation is closed **or
rebound to another graph** — a surviving handle keeps writing into the old one.

## INVARIANTS & GOTCHAS

- Unit fakes here have repeatedly diverged from the real CLI. After any change
  to `AgentService`'s options block or to a `decideToolUse` branch, run
  `npm run test:live` (one real session, a few cents) — green unit tests are not
  evidence for this module.
- `assets/prompts/skill-source.md` is **not** bundled. `buildSystemPrompt`
  stitches `system.md` + `grill.md` + `consult.md` only; skill-source is an
  archival copy of the original SKILL.md and still teaches the overturned
  `parent:`-is-truth model. Do not edit it, and do not read it as current
  behaviour.
- `settingSources: []` does not isolate MCP. `strictMcpConfig: true` is a
  separate gate, and without it the user's own claude.ai connectors appear in
  the session's tool surface.

## DEPENDENCIES

`src/graph` for `GraphStats` and the frontmatter parser reused by `kg-scout.ts`.
`@anthropic-ai/claude-agent-sdk`, reached only through `defaultQueryFn` so the
`import.meta.url` bundling patch stays in one place.
