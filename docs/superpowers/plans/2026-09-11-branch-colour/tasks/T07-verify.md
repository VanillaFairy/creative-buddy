# T07: Verify

**Depends on:** T04, T05, T06
**Read first:** `knowledge/run-tests.md`

**Files:** none. This task proves the work, it does not change it.

Do not claim any of these passed without pasting what it printed. If something
is red, say so with the output and stop — a half-true "done" costs more than a
failure.

- [ ] **Step 1: Full suite**

```bash
npx vitest run
```

Expected: every file green, including `tests/color.test.ts`,
`tests/notes.test.ts`, `tests/mindmap-layout.test.ts` and
`tests/docs-questions.test.ts`.

- [ ] **Step 2: Typecheck and bundle**

```bash
npm run build
```

Expected: no type errors, `main.js` written. Tests do not typecheck, so this is
the tier that proves the two extended interfaces hold everywhere.

- [ ] **Step 3: Oracle parity**

```bash
npm run oracle && git diff --exit-code tests/expected
```

Expected: clean. Nothing in this plan touches the tree's shape, so a diff here
means something went wrong — investigate rather than regenerating over it. (If
the whole file diffs, check line endings before anything else: those fixtures
are LF in git.)

- [ ] **Step 4: Deploy and do the manual pass**

```bash
deploy.bat
```

Then run the six checks in `tasks/T04-paint.md`, Step 5, against the real vault.
They are the only verification the painting gets.

- [ ] **Step 5: Report**

Say plainly: what passed, what the manual pass looked like, and anything the two
audit tasks (T01c, T03c) reported that has not been turned into work yet.

Do not run `npm run test:live`. Nothing here touched `src/agent/`.
