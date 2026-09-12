# assets/prompts

## PURPOSE

The interviewer's behaviour, as prose. `src/agent/prompts.ts` stitches these
markdown files into the one system prompt every session opens with, so a change
to how the interviewer behaves is a text edit here rather than a code change.
Conversational conventions the code depends on are defined here, not in TypeScript.

## KEY ABSTRACTIONS

- `system.md` + `grill.md` + `consult.md` are what ships, joined with `---`
  rules by `buildSystemPrompt`. `presets/*.md` ship too, but as *user* messages:
  clicking a preset says that text as though you had typed it.
- `skill-source.md` **does not ship**. It is an archival copy of the original
  `SKILL.md` this plugin grew out of, kept for provenance, and it still teaches
  the overturned `parent:`-is-truth hierarchy. Do not edit it and do not read it
  as a description of current behaviour — `system.md` is the live document.

## INVARIANTS & GOTCHAS

- The `- [ ]` open-question convention declared in `system.md` is parsed by
  `src/open-questions.ts`, which drives the map's heat colouring and whether the
  "Current note questions" preset appears at all. Rewording that section can
  turn a whole vault's heat off without a single test going red.
- The word `service`, reserved as the one `kind:` the plugin reads for itself,
  is spelled in `system.md` and again in `src/mindmap/service.ts`. Both must
  change together.
- These files reach the running code as **strings**, through two independent
  mechanisms that do not know about each other: esbuild's `loader: {".md":
  "text"}` in `esbuild.config.mjs`, and a hand-written `md-as-text` Vite plugin
  in `vitest.config.ts`. A build that resolves markdown differently — a new
  bundler, a changed test runner — has to satisfy both.
- `grill.md` and `consult.md` refer to each other as `references/grill.md` and
  friends, because they were files once. `STITCH_NOTE` in `prompts.ts` exists to
  tell the model those paths point inside the same document; a wording change
  that reintroduces a file-shaped reference needs that note to keep pace.

## DEPENDENCIES

Consumed by `src/agent/prompts.ts` (the system prompt) and `src/chat/presets.ts`
(the composer's canned openings). `assets/agents/kg-scout.md` is loaded the same
way but by `src/agent/kg-scout.ts`, which splits its frontmatter for the
subagent definition.
