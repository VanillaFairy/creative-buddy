# Conventions

## Commit message format
```
type: subject

optional body

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```
`type` is one of feat/test/chore/fix/docs. Body optional; the trailer is not, and
it names **the model that actually wrote the commit** — the history carries both
`Claude Fable 5` and `Claude Opus 5`, which is the point. Never commit with
failing tests.

Subjects are written as a sentence about behaviour, in the present tense, from
the user's side of the screen: "the map colours nodes by the questions still
owed", "a message typed mid-turn waits its turn". Not "add heatmap toggle".
Match the surrounding log rather than a generic conventional-commits style.

## Answered questions move, they don't get struck out
In any doc under `docs/`, answering a question in an `## Open questions` section
means moving it down to `## Closed questions` and writing it as a `**Q.**` /
`**A.**` pair — never striking it through in place. A decision reads better as a
decision than as a crossed-out doubt.

`tests/docs-questions.test.ts` enforces the mechanical half: no strikethrough
inside an Open questions section, and a Closed section must alternate Q, A all
the way down (which also rejects an empty one). So a docs edit can turn the
suite red — run `npx vitest run` after changing docs, not just after changing
code.
