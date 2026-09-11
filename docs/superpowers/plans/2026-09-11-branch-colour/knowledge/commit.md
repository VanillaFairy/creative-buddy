# Committing

Format is `type: subject` — `feat`, `test`, `chore`, `fix`, `docs` — with a
trailer naming the model that actually wrote the work:

```bash
git add <exact paths>
git commit -m "feat: a note's colour reaches everything below it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Stage exact paths. Never `git add -A` — the working tree carries an untracked
`.claude/knowledge/usage.log` that churns on its own.

**Every commit prints `ERROR: Failed to parse repository information`, once or
twice.** It is a machine-wide Bitbucket hook announcing that this is not a
Bitbucket repo. It is not your commit failing. Confirm with:

```bash
git log --oneline -1
```

Never commit red tests.
