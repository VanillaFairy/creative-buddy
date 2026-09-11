# Conventions for this plan

Read `CLAUDE.md` at the repo root first — this file only adds what is specific
to this work.

## Vocabulary

Use it from the first commit, in code comments, prompts and commit messages:

- **branch** — a folder together with the note of its own name that speaks for it.
- **branch note** — that note.
- **plain folder** — a folder with no such note. A filing convenience; its notes
  pass up to the nearest branch above.
- The hub is the graph's **root branch**.

Do not write "folder note", "group node" or "speaker" in new prose. The old
sentences that describe the arrangement longhand are being replaced by the word,
not supplemented with it.

Spell the field `color:` (it is CSS) and the prose "colour" (the repo's prose is
British — "coloured by the heat", "the two colours").

## Comments

`CLAUDE-CODING.md` applies: if a comment is derivable from the code plus one hop,
delete it rather than shorten it. What survives here is the one real trap —
the guaranteed-invalid `var()` fallback in `styles.css`, which compiles, looks
wrong, and is load-bearing. Explain that one.

## Tests

- Never pin an exact key set with `toEqual` on a `Note` or a `MindmapNode`. Both
  are being extended right now, which is exactly the case the rule is about.
  Use `toMatchObject`.
- Assert behaviour, not source text. No regex over `styles.css`.
- Painting stays manual-test. `src/mindmap/MindmapView.tsx` is a view shell and
  the project's standing rule is that every decision lives in a pure module
  beside it — which is why the inheritance rule is in `layout.ts` and the
  colour grammar is in `color.ts`.

## Commits

`type: subject` (feat/test/chore/fix/docs), one concern each, plus:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Name the model that actually wrote the commit — if a subagent on another model
did the work, name that one.

Every `git commit` prints `ERROR: Failed to parse repository information` once
or twice. It is global-hook noise from a machine-wide Bitbucket hook and means
nothing. Confirm a commit with `git log -1`, never by that line's absence.

## What not to touch

- `oracle/graph_check.py` and `tests/expected/*.json`. The oracle pins tree
  shape and has never read a frontmatter field. If a change here makes
  `npm run oracle` dirty, something is wrong — stop and say so.
- `assets/prompts/skill-source.md`. It still teaches the old `parent:`-is-truth
  doctrine and it is meant to: nothing imports it, it is an archival copy of the
  original Obsidian skill.
- `src/mindmap/layout.ts` holds two literal NUL bytes, so git treats it as
  binary. A commit touching it shows `Bin 4656 -> 5913 bytes` and no line diff.
  Nothing is broken; do not try to "fix" it.
