# Commands

## Run tests
```
npx vitest run
npx vitest run tests/<file>.test.ts
```
Full suite / single file. Run from the worktree root. The live test is excluded.

## Typecheck and build
```
npx tsc --noEmit
npm run build
```
First is a fast typecheck, no output files. Second repeats the typecheck and produces the esbuild production bundle (`main.js`).

## Regenerate oracle fixtures
```
npm run oracle
```
Runs `python oracle/gen_expected.py`, regenerating `tests/expected/*.json`. Run after any fixture change and commit the JSON. `git diff --exit-code tests/expected` proves the committed expectations still match.

## Live smoke test
```
npm run test:live
```
One real Claude Code session (subscription auth) in a scratch vault — spends a few cents per run. Deliberately excluded from `npm test`; asserts subscription auth, the six-tool contract surface, and zero approval cards for in-vault activity.
