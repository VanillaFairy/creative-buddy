# T06: Verify

**Role:** — (verification only)
**Depends on:** T02c (and any red tasks its findings created), T04, T05
**Read first:** `../../knowledge/run-tests.md`, `../../knowledge/typecheck-build.md`

**Files:** none edited, unless a check fails — then stop and report, do not patch here.

- [ ] **Step 1: Full suite**

```bash
npx vitest run
```

Expected: all pass. Report the file and test counts.

- [ ] **Step 2: Oracle parity**

```bash
npm run oracle
git diff --exit-code tests/expected
```

Expected: no diff. Highlight is TypeScript-only; a dirty oracle means something
outside scope changed.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean. Report that it passed — green tests are not a build.

- [ ] **Step 4: Deploy**

```bash
deploy.bat
```

Report the printed build timestamps.

- [ ] **Step 5: Spec coverage walk**

Read the spec top to bottom. For each behaviour, name the test in
`tests/mindmap-highlight.test.ts` or the checklist item under `### Highlight`
that covers it. List anything uncovered.

- [ ] **Step 6: Hand-off**

Tell the user, in plain language: what landed (commits), that the build passed,
which manual checks from T03 / T04 were actually done in this session and which
were not, and that the `### Highlight` section of the manual checklist is theirs
to walk. `main` tracks a real `origin`; nothing is pushed.
