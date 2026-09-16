# Testing

## Run tests
```
npx vitest run
npx vitest run tests/<file>.test.ts
```
Full suite / single file. Run from the repo root. The live test is excluded.
`npm test` is the same thing. 364 tests as of 2026-08-13 — a green run takes
about a second, so there is no excuse for skipping it. Note that it covers the
docs as well as the code (`tests/docs-questions.test.ts`).

## Live smoke test
```
npm run test:live
```
One real Claude Code session (subscription auth) in a scratch vault — spends a few cents per run. Deliberately excluded from `npm test`; asserts subscription auth, the six-tool contract surface, and zero approval cards for in-vault activity.
