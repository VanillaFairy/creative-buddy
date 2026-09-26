---
name: publish
description: Publish a new Creative Buddy release - commit any pending work, bump the version by semver, push `main` and the version tag so the release workflow builds a draft release. Use when the user invokes /publish or asks to publish, release or ship the current state of this repo.
---

# Publish

Invoking this skill is the user's go-ahead to commit, tag and push. Stop and ask at any
point where the steps below say so; otherwise run straight through.

## 1. Preflight

- `git status -sb` must show branch `main`. On any other branch, stop and ask.
- `git fetch origin`, then compare `main` with `origin/main`. If `origin/main` has commits
  that `main` lacks, stop and ask — never rebase or merge on your own here.

## 2. Commit pending work

Skip this step when the working tree is clean.

Read `git status` and `git diff` in full, then commit following `docs/kb/CONVENTIONS.md`:
`type: subject` (feat/fix/docs/test/chore), subject written as behaviour from the user's
side of the screen, and the `Co-Authored-By:` trailer naming the model writing the commit.
One concern per commit; if the diff carries several concerns, use the `focused-commits`
skill.

Ask the user before committing when any of this holds:

- a file looks unintended: scratch or debug output, `data.json`, credentials, anything
  large or binary nobody mentioned;
- you can't tell which concern a change belongs to, or what its type is;
- a change looks unfinished (commented-out code, TODO markers added in this diff).

Never commit red: run `npx vitest run` and `npm run build` after committing. If either
fails, stop and report — do not bump or push.

## 3. Choose the bump

The public contract of this plugin is what an existing user relies on: their vault's notes
and folder layout, the plugin's settings in `data.json`, its commands and views, and the
minimum Obsidian version. List the commits since the last tag:

```bash
git log --format='%h %s%n%b' "$(git describe --tags --abbrev=0)"..HEAD
```

- **major** — a commit marked `type!:` or carrying `BREAKING CHANGE:`, or any change that
  makes an existing vault or settings file stop working as it did: a note format or folder
  convention the plugin no longer reads, a setting removed or reinterpreted, a raised
  `minAppVersion`.
- **minor** — otherwise, any `feat:` commit: new behaviour a user can see.
- **patch** — otherwise: only `fix`, `docs`, `test`, `chore`.

No commits since the last tag: stop and tell the user there is nothing to publish.

When the commit types and the actual diff disagree (a `fix:` that changes a setting's
meaning, a `feat:` that is really internal), judge by the diff. If you're still unsure,
ask the user with the candidate levels and the commits that decide it.

## 4. Bump, tag, push

```bash
node .claude/skills/publish/bump.mjs <major|minor|patch>
```

It updates `manifest.json`, `package.json`, `package-lock.json` and `versions.json`, and
prints the new version. Check `git diff` shows exactly those four files changed to that
version, then:

```bash
git commit -am "chore: bump version to <version>" -m "Co-Authored-By: <model> <noreply@anthropic.com>"
git tag <version>
git push origin main
git push origin <version>
```

The tag has no `v` prefix: the release workflow fails when the tag differs from
`manifest.json`'s version.

## 5. Report

Pushing the tag starts `.github/workflows/release.yml`, which builds, attests and opens a
**draft** release. Check it with `gh run list --workflow release.yml --limit 1` and wait
for it with `gh run watch <id> --exit-status`. Tell the user the version, the bump level
and why, the commits it covers, and whether the workflow passed. The draft still needs
release notes and publishing on GitHub; say so, and offer to draft the notes from the
commit list.
